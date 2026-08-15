/**
 * Agent tools: the model-facing surfaces of the host task board. Every tool
 * talks to the same host store the board UI reads, so a task or todo created
 * by the agent is immediately visible on the board and vice versa. The cron
 * surface is ONE tool (`cron`) whose `action` field dispatches to the
 * underlying functions (create / list / pause / resume / run / delete) —
 * the reference-manager pattern: one entry point, one discriminated
 * schedule record, no per-action tool proliferation. The host scheduler
 * fires scheduled tasks even while no GUI tab is open.
 */

import { defineTool, type GenericCallView } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { randomUUID } from 'node:crypto'
import { createTask, type TaskRecord } from '../core/tasks.ts'
import { createTodo, summarizeTodo, withTodoStatus, type TodoRecord } from '../core/todos.ts'
import { applySetSchedule } from '../core/use-cases/task-schedule.ts'
import { applyManualRunPolicy, finishExecution, openExecution } from './execution-service.ts'
import { DISPATCHER_SESSION_ID, type TaskRunner } from './runner.ts'
import type { TaskBoardStore } from './store.ts'

/** One text content block (the only render shape these tools emit). */
function text(value: string): ContentBlock[] {
  return [{ type: 'text', text: value }]
}

/** A generic read/pending card for tool calls. */
function readCard(title: string, rawInput: unknown): GenericCallView {
  return { card: 'generic', title, kind: 'read', rawInput }
}

/**
 * Parse a one-shot trigger: an ISO 8601 instant with an explicit UTC offset
 * (`2026-08-16T09:00:00+08:00`, `...Z`). The offset is REQUIRED (reference
 * contract: "next_run_at 必须包含 UTC offset") and the instant must be
 * strictly in the future. Returns undefined otherwise.
 */
export function parseNextRunAt(value: string | undefined, now: number): number | undefined {
  if (value === undefined) return undefined
  const trimmed = value.trim()
  if (trimmed === '') return undefined
  if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed)) return undefined
  const ms = Date.parse(trimmed)
  if (Number.isNaN(ms)) return undefined
  if (ms <= now) return undefined
  return ms
}

/** Convert a relative delay (seconds, strictly positive) into an instant. */
export function parseDelaySeconds(value: unknown, now: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return now + Math.round(value * 1000)
}

/** Task table render shared by list surfaces. */
function renderTaskTable(tasks: readonly TaskRecord[]): string {
  if (tasks.length === 0) return 'no tasks'
  const rows = tasks.map(task => {
    const schedule = task.schedule
    const scheduleText = schedule?.enabled === true
      ? schedule.recurring
        ? schedule.cron
        : schedule.nextRunAt !== undefined
          ? `one-shot @ ${new Date(schedule.nextRunAt).toLocaleString()}`
          : 'one-shot (fired)'
      : '-'
    const next = schedule?.enabled === true && schedule.nextRunAt !== undefined
      ? new Date(schedule.nextRunAt).toLocaleString()
      : '-'
    return [
      task.id,
      task.title,
      task.status,
      scheduleText,
      next,
      task.workspacePath ?? '',
    ].join(' | ')
  })
  return ['id | title | status | schedule | next run | workspace', '--- | --- | --- | --- | --- | ---', ...rows].join('\n')
}

/** Todo table render. */
function renderTodoTable(todos: readonly TodoRecord[]): string {
  if (todos.length === 0) return 'no todos'
  const rows = todos.map(todo => [todo.id, todo.title, todo.status].join(' | '))
  return ['id | title | status', '--- | --- | ---', ...rows].join('\n')
}

/** Tool deps. */
export interface TaskBoardToolDeps {
  store: TaskBoardStore
  runner: TaskRunner
  /** Clock. */
  now?(): number
  /** Whether the current tool call comes from the dispatcher session (scheduled runs). */
  isDispatcherCall?(): boolean
}

/** The `cron` tool's create-branch result. */
interface CronCreateResult {
  taskId: string
  title: string
  recurring: boolean
  cron?: string
  nextRunAt?: number
}

/** One row of the `cron` tool's list-branch result. */
interface CronListRow {
  id: string
  title: string
  status: string
  recurring?: boolean
  cron?: string
  enabled?: boolean
  nextRunAt?: number
  lastTriggeredAt?: number
  workspacePath?: string
}

/** Build every task-board agent tool. */
export function makeTools(deps: TaskBoardToolDeps) {
  const { store, runner } = deps
  const now = deps.now ?? (() => Date.now())

  /** Apply a schedule patch to a task (shared by create/pause/resume). */
  const applySchedule = (id: string, patch: { enabled?: boolean; cron?: string; at?: number }): { task?: TaskRecord; error?: string } => {
    const task = store.tasks().find(candidate => candidate.id === id)
    if (task === undefined) return { error: `task '${id}' not found` }
    const { tasks, applied } = applySetSchedule([task], id, patch, now())
    if (!applied) {
      const cron = (patch.cron ?? task.schedule?.cron ?? '').trim()
      const error = cron !== ''
        ? `invalid cron expression: ${cron}`
        : `invalid schedule: one-shot trigger missing for task '${id}'`
      return { error }
    }
    const next = tasks[0]
    store.putTask(next)
    return { task: next }
  }

  /** create: recurring (cron) or one-shot (nextRunAt/delaySeconds). */
  const createCron = (args: {
    name?: string
    prompt?: string
    recurring?: boolean
    cron?: string
    nextRunAt?: string
    delaySeconds?: number
    workspacePath?: string
  }): CronCreateResult => {
    const name = (args.name ?? '').trim()
    if (name === '') throw new Error('name is required')
    const prompt = (args.prompt ?? '').trim()
    if (prompt === '') throw new Error('prompt is required')
    const recurring = args.recurring === true
    const cron = args.cron !== undefined ? String(args.cron).trim() : ''
    const task = createTask({ title: name, description: '', prompt }, now(), randomUUID())
    if (args.workspacePath !== undefined && args.workspacePath.trim() !== '') {
      task.workspacePath = args.workspacePath.trim()
    }
    if (recurring) {
      if (cron === '') throw new Error('recurring cron tasks require a cron expression')
      if (args.nextRunAt !== undefined || args.delaySeconds !== undefined) {
        throw new Error('recurring cron tasks cannot set nextRunAt or delaySeconds')
      }
      const { tasks, applied } = applySetSchedule([task], task.id, { enabled: true, cron }, now())
      if (!applied) throw new Error(`invalid cron expression: ${cron}`)
      const next = tasks[0]
      store.putTask(next)
      return {
        taskId: next.id,
        title: next.title,
        recurring: true,
        cron: next.schedule?.cron ?? cron,
        nextRunAt: next.schedule?.nextRunAt,
      }
    }
    // One-shot.
    if (cron !== '') throw new Error('one-shot tasks cannot set cron; pass recurring: true for a cron schedule')
    if (args.nextRunAt !== undefined && args.delaySeconds !== undefined) {
      throw new Error('nextRunAt and delaySeconds are mutually exclusive')
    }
    let at: number | undefined
    if (args.nextRunAt !== undefined) {
      at = parseNextRunAt(args.nextRunAt, now())
      if (at === undefined) {
        throw new Error(`invalid nextRunAt: ${args.nextRunAt} (expected ISO 8601 with a UTC offset, e.g. 2026-08-16T09:00:00+08:00, strictly in the future)`)
      }
    } else if (args.delaySeconds !== undefined) {
      at = parseDelaySeconds(args.delaySeconds, now())
      if (at === undefined) throw new Error('invalid delaySeconds: expected a positive number of seconds')
    } else {
      throw new Error('one-shot tasks require nextRunAt or delaySeconds')
    }
    const { tasks, applied } = applySetSchedule([task], task.id, { enabled: true, at }, now())
    if (!applied) throw new Error('failed to schedule the one-shot task')
    const next = tasks[0]
    store.putTask(next)
    return { taskId: next.id, title: next.title, recurring: false, nextRunAt: at }
  }

  /** list: summarize the ledger. */
  const listCrons = (): { tasks: CronListRow[] } => ({
    tasks: store.tasks().map(task => ({
      id: task.id,
      title: task.title,
      status: task.status,
      ...(task.schedule?.recurring !== undefined ? { recurring: task.schedule.recurring } : {}),
      ...(task.schedule?.cron !== undefined && task.schedule.cron !== '' ? { cron: task.schedule.cron } : {}),
      ...(task.schedule?.enabled !== undefined ? { enabled: task.schedule.enabled } : {}),
      ...(task.schedule?.nextRunAt !== undefined ? { nextRunAt: task.schedule.nextRunAt } : {}),
      ...(task.schedule?.lastTriggeredAt !== undefined ? { lastTriggeredAt: task.schedule.lastTriggeredAt } : {}),
      ...(task.workspacePath !== undefined ? { workspacePath: task.workspacePath } : {}),
    })),
  })

  /** pause: disarm the schedule (one-shot keeps its trigger for resume). */
  const pauseCron = (id: string | undefined): { ok: boolean; error?: string } => {
    if (id === undefined) return { ok: false, error: 'id is required' }
    const result = applySchedule(id, { enabled: false })
    if (result.error !== undefined) return { ok: false, error: result.error }
    return { ok: true }
  }

  /** resume: re-arm the schedule and recompute/restore its next run. */
  const resumeCron = (id: string | undefined): { ok: boolean; nextRunAt?: number; error?: string } => {
    if (id === undefined) return { ok: false, error: 'id is required' }
    const task = store.tasks().find(candidate => candidate.id === id)
    if (task === undefined) return { ok: false, error: `task '${id}' not found` }
    const schedule = task.schedule
    if (schedule === undefined) return { ok: false, error: `task '${id}' has no schedule` }
    if (schedule.recurring) {
      const result = applySchedule(id, { enabled: true, cron: schedule.cron })
      if (result.error !== undefined) return { ok: false, error: result.error }
      return { ok: true, ...(result.task?.schedule?.nextRunAt !== undefined ? { nextRunAt: result.task.schedule.nextRunAt } : {}) }
    }
    if (schedule.nextRunAt === undefined) {
      return { ok: false, error: `one-shot task '${id}' has already fired; create a new one-shot task instead` }
    }
    const result = applySchedule(id, { enabled: true })
    if (result.error !== undefined) return { ok: false, error: result.error }
    return { ok: true, ...(result.task?.schedule?.nextRunAt !== undefined ? { nextRunAt: result.task.schedule.nextRunAt } : {}) }
  }

  /** delete: remove the task (its schedule stops firing). */
  const deleteCron = (id: string | undefined): { ok: boolean; error?: string } => {
    if (id === undefined) return { ok: false, error: 'id is required' }
    if (!store.removeTask(id)) return { ok: false, error: `task '${id}' not found` }
    return { ok: true }
  }

  /** run: execute a task now through a real dsh agent session. */
  const runCron = (id: string | undefined): { ok: boolean; error?: string } => {
    if (id === undefined) return { ok: false, error: 'id is required' }
    const task = store.tasks().find(candidate => candidate.id === id)
    if (task === undefined) return { ok: false, error: `task '${id}' not found` }
    const opened = openExecution(store, task)
    if (opened === undefined) return { ok: false, error: 'task is already running' }
    // The dispatcher session calls this action for scheduled runs; a manual
    // call (user or board) applies the manual-run policy instead.
    const scheduled = deps.isDispatcherCall !== undefined && deps.isDispatcherCall()
    void finishExecution(store, runner, opened)
      .then(() => {
        void applyManualRunPolicy(store, id, { scheduled })
      })
      .catch((error: unknown) => {
        const execution = opened.executions[opened.executions.length - 1]
        store.putTask({
          ...opened,
          status: 'failed',
          updatedAt: now(),
          executions: opened.executions.map(entry => entry.id === execution.id
            ? { ...entry, endedAt: now(), result: 'failed' as const, error: error instanceof Error ? error.message : String(error) }
            : entry),
        })
        // Apply the settle policy even on an orchestration failure
        // (one-shot tasks are removed; recurring tasks roll forward).
        void applyManualRunPolicy(store, id, { scheduled })
      })
    return { ok: true }
  }

  const CRON_ACTIONS = ['create', 'list', 'pause', 'resume', 'run', 'delete'] as const
  const TODO_ACTIONS = ['add', 'list', 'done', 'delete'] as const

  return [
    // ------------------------------------------------------------ cron
    defineTool({
      name: 'cron',
      description: 'Manage scheduled tasks on the host task board. One tool, six actions (the `action` field selects the operation): ' +
        'create (recurring cron or one-shot), list, pause, resume, run now, delete. ' +
        'Scheduled tasks run on a real dsh agent session when due (the host scheduler fires them even while no GUI tab is open; every scheduled run goes through the LLM dispatcher). ' +
        'Create with `recurring: true` + `cron` (5-field cron) for a recurring schedule, or `recurring: false` + `nextRunAt` (ISO 8601 with UTC offset) or `delaySeconds` (relative seconds) for a one-shot. ' +
        'Triggers: 定时任务 / 定时执行 / 每天/每周/每小时自动运行 / cron 调度 / 一次性定时 / 查看定时任务 / 任务列表 / 暂停定时任务 / 恢复定时任务 / 删除定时任务 / 立即执行任务 / schedule a task / list cron jobs / pause cron / resume cron / run task now / delete cron.',
      parameters: {
        action: { type: 'string', required: true, enum: CRON_ACTIONS, description: 'Which cron operation to perform.' },
        name: { type: 'string', description: 'Task title (required for action=create).' },
        prompt: { type: 'string', description: 'The prompt the execution session runs (required for action=create).' },
        recurring: { type: 'boolean', description: 'true = recurring cron task; false = one-shot (required for action=create).' },
        cron: { type: 'string', description: '5-field cron expression: `分 时 日 月 周` (e.g. "0 23 * * *" = daily 23:00; required for create when recurring=true).' },
        nextRunAt: { type: 'string', description: 'One-shot trigger: ISO 8601 with an explicit UTC offset, e.g. 2026-08-16T09:00:00+08:00, strictly in the future (for create when recurring=false; mutually exclusive with delaySeconds).' },
        delaySeconds: { type: 'number', description: 'One-shot trigger as seconds from now (for create when recurring=false; mutually exclusive with nextRunAt and cron).' },
        workspacePath: { type: 'string', description: 'Optional absolute workspace path the task executes in (defaults to the cron workspace).' },
        id: { type: 'string', description: 'Task id from action=list (required for pause/resume/run/delete).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            taskId: { type: 'string' },
            title: { type: 'string' },
            recurring: { type: 'boolean' },
            cron: { type: 'string' },
            nextRunAt: { type: 'number' },
            ok: { type: 'boolean' },
            error: { type: 'string' },
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  title: { type: 'string', required: true },
                  status: { type: 'string', required: true },
                  recurring: { type: 'boolean' },
                  cron: { type: 'string' },
                  enabled: { type: 'boolean' },
                  nextRunAt: { type: 'number' },
                  lastTriggeredAt: { type: 'number' },
                  workspacePath: { type: 'string' },
                },
              },
            },
          },
        },
        render: (args, value) => {
          const action = (args as { action?: string }).action
          const v = value as Record<string, unknown>
          if (action === 'list') return text(renderTaskTable((v.tasks ?? []) as TaskRecord[]))
          if (action === 'create') {
            const mode = v.recurring === false ? '一次性' : '周期性'
            const schedule = v.cron !== undefined && v.cron !== ''
              ? String(v.cron)
              : v.nextRunAt !== undefined
                ? `触发 ${new Date(v.nextRunAt as number).toLocaleString()}`
                : '?'
            const next = v.nextRunAt !== undefined
              ? `，下次运行：${new Date(v.nextRunAt as number).toLocaleString()}`
              : ''
            return text(`已创建${mode}定时任务 ${v.taskId ?? '?'} "${v.title ?? ''}"（${schedule}）${next}`)
          }
          if (action === 'resume') {
            return text(v.ok === true
              ? `任务调度已恢复${v.nextRunAt !== undefined ? `，下次运行：${new Date(v.nextRunAt as number).toLocaleString()}` : ''}`
              : `失败：${v.error ?? '未知错误'}`)
          }
          if (action === 'pause') {
            return text(v.ok === true ? '任务调度已暂停' : `失败：${v.error ?? '未知错误'}`)
          }
          if (action === 'delete') {
            return text(v.ok === true ? '任务已删除' : `失败：${v.error ?? '未知错误'}`)
          }
          if (action === 'run') {
            return text(v.ok === true ? '任务已在后台开始执行' : `失败：${v.error ?? '未知错误'}`)
          }
          return text('ok')
        },
      },
      async execute(args: {
        action: (typeof CRON_ACTIONS)[number]
        name?: string
        prompt?: string
        recurring?: boolean
        cron?: string
        nextRunAt?: string
        delaySeconds?: number
        workspacePath?: string
        id?: string
      }) {
        switch (args.action) {
          case 'create': return createCron(args)
          case 'list': return listCrons()
          case 'pause': return pauseCron(args.id)
          case 'resume': return resumeCron(args.id)
          case 'run': return runCron(args.id)
          case 'delete': return deleteCron(args.id)
          default: throw new Error(`unknown cron action: ${String(args.action)}`)
        }
      },
      presentCall: (args) => readCard(`Cron: ${String((args as { action?: string }).action)}`, args),
    }),

    // ------------------------------------------------------------ todo
    defineTool({
      name: 'todo',
      description: 'Manage durable todos on the host todo ledger (visible in the task board). One tool, four actions (the `action` field selects the operation): add, list, done, delete. ' +
        'Triggers: 添加待办 / 记下待办 / 新增 todo / 查看待办 / 待办列表 / 还有什么没做 / 完成待办 / 待办已完成 / 标记完成 / 删除待办 / add todo / list todos / done todo / remove todo.',
      parameters: {
        action: { type: 'string', required: true, enum: TODO_ACTIONS, description: 'Which todo operation to perform.' },
        title: { type: 'string', description: 'Todo title (required for action=add).' },
        description: { type: 'string', description: 'Optional longer description (action=add).' },
        id: { type: 'string', description: 'Todo id from action=list (required for action=done/delete).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            todoId: { type: 'string' },
            title: { type: 'string' },
            ok: { type: 'boolean' },
            error: { type: 'string' },
            todos: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  title: { type: 'string', required: true },
                  status: { type: 'string', required: true },
                  createdAt: { type: 'number', required: true },
                },
              },
            },
          },
        },
        render: (args, value) => {
          const action = (args as { action?: string }).action
          const v = value as Record<string, unknown>
          if (action === 'list') return text(renderTodoTable((v.todos ?? []) as TodoRecord[]))
          if (action === 'add') return text(`added todo ${v.todoId ?? '?'} "${v.title ?? ''}"`)
          if (v.ok === true) return text(action === 'done' ? 'todo marked done' : 'todo deleted')
          return text(`failed: ${v.error ?? 'unknown'}`)
        },
      },
      async execute(args: {
        action: (typeof TODO_ACTIONS)[number]
        title?: string
        description?: string
        id?: string
      }) {
        switch (args.action) {
          case 'add': {
            const title = (args.title ?? '').trim()
            if (title === '') throw new Error('title is required')
            const todo = createTodo({ title, description: args.description ?? '' }, now(), randomUUID())
            store.putTodo(todo)
            return { todoId: todo.id, title: todo.title }
          }
          case 'list': {
            return { todos: store.todos().map(summarizeTodo) }
          }
          case 'done': {
            if (args.id === undefined) return { ok: false, error: 'id is required' }
            const todo = store.todos().find(candidate => candidate.id === args.id)
            if (todo === undefined) return { ok: false, error: `todo '${args.id}' not found` }
            store.putTodo(withTodoStatus(todo, 'done', now()))
            return { ok: true }
          }
          case 'delete': {
            if (args.id === undefined) return { ok: false, error: 'id is required' }
            if (!store.removeTodo(args.id)) return { ok: false, error: `todo '${args.id}' not found` }
            return { ok: true }
          }
          default: throw new Error(`unknown todo action: ${String(args.action)}`)
        }
      },
      presentCall: (args) => readCard(`Todo: ${String((args as { action?: string }).action)}`, args),
    }),
  ]
}
