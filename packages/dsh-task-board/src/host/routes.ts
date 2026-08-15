/**
 * The /api/task-board route family: task CRUD + run, todo CRUD, and the
 * one-shot browser-ledger migration. Every route carries the loopback-only
 * trust fence the family uses — these endpoints mutate the host task ledger
 * and launch real agent sessions, so LAN-exposed deployments must not serve
 * them.
 */

import { randomUUID } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { createTodo, withTodoStatus, type NewTodoInput, type TodoRecord } from '../core/todos.ts'
import { createTask, withStatus, type NewTaskInput, type TaskRecord, type TaskStatus } from '../core/tasks.ts'
import { applySetSchedule, type SetSchedulePatch } from '../core/use-cases/task-schedule.ts'
import { applyUpdateTask } from '../core/use-cases/task-update.ts'
import { finishExecution, openExecution } from './execution-service.ts'
import type { TaskRunner } from './runner.ts'
import type { TaskBoardStore } from './store.ts'

/** Cap on JSON request bodies. */
const MAX_JSON_BODY_BYTES = 256 * 1024

/** Loopback literal check plus browser same-origin markers (family fence). */
function isLoopbackRequest(request: IncomingMessage): boolean {
  const address = request.socket.remoteAddress
  if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') return false
  const host = request.headers.host
  if (typeof host !== 'string') return false
  let hostUrl: URL
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (hostUrl.hostname !== '127.0.0.1' && hostUrl.hostname !== 'localhost' && hostUrl.hostname !== '[::1]') return false
  if (request.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = request.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

/** One JSON response. */
function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Read a JSON request body (undefined when too large or unparseable). */
async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = chunk as Buffer
    size += buffer.length
    if (size > MAX_JSON_BODY_BYTES) return undefined
    chunks.push(buffer)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/** String field helper. */
function strField(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
}

/** Number field helper. */
function numField(payload: Record<string, unknown>, key: string): number | undefined {
  const value = payload[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** The routes' dependencies. */
export interface TaskBoardRoutesDeps {
  store: TaskBoardStore
  runner: TaskRunner
  /** Clock for task/todo transitions. */
  now?(): number
}

/**
 * Build every /api/task-board route.
 * @param deps - store, runner, clock.
 * @returns the routes to register on the webServer.
 */
export function makeRoutes(deps: TaskBoardRoutesDeps): WebRoute[] {
  const { store, runner } = deps
  const now = deps.now ?? (() => Date.now())

  /** Guard helper: fence + method check. */
  const guard = (req: IncomingMessage, res: ServerResponse, method: string): boolean => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { error: 'forbidden: loopback-only' })
      return false
    }
    if (req.method !== method) {
      writeJson(res, 405, { error: `method not allowed: ${req.method}` })
      return false
    }
    return true
  }

  /** Shared POST handling: parse body or 400. */
  const post = async (req: IncomingMessage, res: ServerResponse): Promise<Record<string, unknown> | undefined> => {
    const body = await readJsonBody(req)
    if (body === undefined) {
      writeJson(res, 400, { error: 'invalid JSON body' })
      return undefined
    }
    return body
  }

  return [
    // ------------------------------------------------------------ tasks
    {
      kind: 'exact',
      path: '/api/task-board/tasks',
      handler: async (req, res) => {
        const method = req.method ?? 'GET'
        if (!isLoopbackRequest(req)) {
          writeJson(res, 403, { error: 'forbidden: loopback-only' })
          return
        }
        if (method === 'GET') {
          writeJson(res, 200, { tasks: store.tasks() })
          return
        }
        if (method === 'POST') {
          const body = await post(req, res)
          if (body === undefined) return
          const title = strField(body, 'title') ?? ''
          if (title.trim() === '') {
            writeJson(res, 400, { error: 'title is required' })
            return
          }
          const input: NewTaskInput = {
            title,
            description: strField(body, 'description') ?? '',
            prompt: strField(body, 'prompt') ?? '',
          }
          const task = createTask(input, now(), randomUUID())
          const workspacePath = strField(body, 'workspacePath')
          if (workspacePath !== undefined && workspacePath.trim() !== '') task.workspacePath = workspacePath.trim()
          // Optional schedule on creation (agent cron_create path).
          const schedule = body.schedule as Record<string, unknown> | undefined
          if (schedule !== undefined) {
            const applied = applySetSchedule([task], task.id, {
              enabled: schedule.enabled === true,
              cron: typeof schedule.cron === 'string' ? schedule.cron : '',
            }, now())
            if (applied.applied) {
              const next = applied.tasks[0]
              store.putTask(next)
              writeJson(res, 201, { task: next })
              return
            }
            writeJson(res, 400, { error: 'invalid schedule' })
            return
          }
          store.putTask(task)
          writeJson(res, 201, { task })
          return
        }
        if (method === 'PATCH') {
          const body = await post(req, res)
          if (body === undefined) return
          const id = strField(body, 'id')
          if (id === undefined || id === '') {
            writeJson(res, 400, { error: 'id is required' })
            return
          }
          const task = store.tasks().find(candidate => candidate.id === id)
          if (task === undefined) {
            writeJson(res, 404, { error: 'task not found' })
            return
          }
          const patch = body.patch as Record<string, unknown> | undefined
          let next: TaskRecord = task
          if (patch !== undefined) {
            const editable = {
              title: typeof patch.title === 'string' ? patch.title : undefined,
              description: typeof patch.description === 'string' ? patch.description : undefined,
              prompt: typeof patch.prompt === 'string' ? patch.prompt : undefined,
            }
            if (editable.title !== undefined || editable.description !== undefined || editable.prompt !== undefined) {
              const updated = applyUpdateTask(store.tasks(), id, {
                ...(editable.title !== undefined ? { title: editable.title } : {}),
                ...(editable.description !== undefined ? { description: editable.description } : {}),
                ...(editable.prompt !== undefined ? { prompt: editable.prompt } : {}),
              }, now())
              const fresh = updated.find(candidate => candidate.id === id)
              if (fresh !== undefined) next = fresh
            }
            if (typeof patch.status === 'string' && (['backlog', 'todo', 'running', 'done', 'failed'] as string[]).includes(patch.status)) {
              next = withStatus(next, patch.status as TaskStatus, now())
            }
            if (typeof patch.workspacePath === 'string') {
              next = patch.workspacePath.trim() === ''
                ? { ...next, workspacePath: undefined }
                : { ...next, workspacePath: patch.workspacePath.trim() }
            }
            const schedulePatch = patch.schedule as SetSchedulePatch | undefined
            if (schedulePatch !== undefined) {
              const { tasks, applied } = applySetSchedule([next], id, {
                enabled: schedulePatch.enabled,
                cron: typeof schedulePatch.cron === 'string' ? schedulePatch.cron : undefined,
              }, now())
              if (!applied) {
                writeJson(res, 400, { error: 'invalid schedule' })
                return
              }
              next = tasks[0]
            }
          }
          store.putTask(next)
          writeJson(res, 200, { task: next })
          return
        }
        if (method === 'DELETE') {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const id = url.searchParams.get('id')
          if (id === null || id === '') {
            writeJson(res, 400, { error: 'id query parameter is required' })
            return
          }
          writeJson(res, 200, { ok: store.removeTask(id) })
          return
        }
        writeJson(res, 405, { error: `method not allowed: ${method}` })
      },
    },
    // ------------------------------------------------------------ run
    {
      kind: 'exact',
      path: '/api/task-board/tasks/run',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        const body = await post(req, res)
        if (body === undefined) return
        const id = strField(body, 'id')
        if (id === undefined || id === '') {
          writeJson(res, 400, { error: 'id is required' })
          return
        }
        const parentSessionId = strField(body, 'parentSessionId')
        const task = store.tasks().find(candidate => candidate.id === id)
        if (task === undefined) {
          writeJson(res, 404, { error: 'task not found' })
          return
        }
        const opened = openExecution(store, task)
        if (opened === undefined) {
          writeJson(res, 409, { error: 'task is already running' })
          return
        }
        // Fire-and-forget: the board polls the ledger for the settled state.
        void finishExecution(store, runner, opened, parentSessionId)
          .catch((error: unknown) => {
            // The execution record already exists; settle it as cancelled on
            // an unexpected orchestration failure.
            const execution = opened.executions[opened.executions.length - 1]
            const settled = {
              ...opened,
              status: 'failed' as const,
              updatedAt: now(),
              executions: opened.executions.map(entry => entry.id === execution.id
                ? { ...entry, endedAt: now(), result: 'failed' as const, error: error instanceof Error ? error.message : String(error) }
                : entry),
            }
            store.putTask(settled)
          })
        writeJson(res, 202, { ok: true })
      },
    },
    // ------------------------------------------------------------ todos
    {
      kind: 'exact',
      path: '/api/task-board/todos',
      handler: async (req, res) => {
        const method = req.method ?? 'GET'
        if (!isLoopbackRequest(req)) {
          writeJson(res, 403, { error: 'forbidden: loopback-only' })
          return
        }
        if (method === 'GET') {
          writeJson(res, 200, { todos: store.todos() })
          return
        }
        if (method === 'POST') {
          const body = await post(req, res)
          if (body === undefined) return
          const title = strField(body, 'title') ?? ''
          if (title.trim() === '') {
            writeJson(res, 400, { error: 'title is required' })
            return
          }
          const input: NewTodoInput = {
            title,
            description: strField(body, 'description') ?? '',
          }
          const todo = createTodo(input, now(), randomUUID())
          store.putTodo(todo)
          writeJson(res, 201, { todo })
          return
        }
        if (method === 'PATCH') {
          const body = await post(req, res)
          if (body === undefined) return
          const id = strField(body, 'id')
          if (id === undefined || id === '') {
            writeJson(res, 400, { error: 'id is required' })
            return
          }
          const todo = store.todos().find(candidate => candidate.id === id)
          if (todo === undefined) {
            writeJson(res, 404, { error: 'todo not found' })
            return
          }
          const patch = body.patch as Record<string, unknown> | undefined
          let next: TodoRecord = todo
          if (patch !== undefined) {
            if (typeof patch.title === 'string') next = { ...next, title: patch.title, updatedAt: now() }
            if (typeof patch.description === 'string') next = { ...next, description: patch.description, updatedAt: now() }
            if (patch.status === 'open' || patch.status === 'done') {
              next = withTodoStatus(next, patch.status, now())
            }
          }
          store.putTodo(next)
          writeJson(res, 200, { todo: next })
          return
        }
        if (method === 'DELETE') {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const id = url.searchParams.get('id')
          if (id === null || id === '') {
            writeJson(res, 400, { error: 'id query parameter is required' })
            return
          }
          writeJson(res, 200, { ok: store.removeTodo(id) })
          return
        }
        writeJson(res, 405, { error: `method not allowed: ${method}` })
      },
    },
    // ------------------------------------------------------------ migrate
    {
      kind: 'exact',
      path: '/api/task-board/migrate',
      handler: async (req, res) => {
        if (!guard(req, res, 'POST')) return
        const body = await post(req, res)
        if (body === undefined) return
        const tasks = body.tasks
        if (!Array.isArray(tasks)) {
          writeJson(res, 400, { error: 'tasks array is required' })
          return
        }
        store.replaceTasks(tasks as TaskRecord[])
        writeJson(res, 200, { tasks: store.tasks() })
      },
    },
  ]
}
