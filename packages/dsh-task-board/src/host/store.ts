/**
 * Host task/todo store: one JSON file (`~/.dsh/task-board.json`) holding the
 * task ledger and the todo ledger, written atomically (tmp + rename). The
 * host owns scheduling and execution, so the file is the single source of
 * truth the board UI reads through `/api/task-board/*` and the agent tools
 * mutate. Pure file I/O — no cordis dependency, unit-testable.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { TodoRecord } from '../core/todos.ts'
import { isTodoRecord } from '../core/todos.ts'
import type { ScheduleRule, TaskRecord } from '../core/tasks.ts'
import { isTaskStatus } from '../core/tasks.ts'
import { isValidCron } from '../core/schedule.ts'

/** File format version. */
const FORMAT_VERSION = 1

/** Store file location: <home>/.dsh/task-board.json. */
export function storePath(): string {
  return join(homedir(), '.dsh', 'task-board.json')
}

/** One stored document. */
export interface TaskBoardDocument {
  version: number
  tasks: TaskRecord[]
  todos: TodoRecord[]
}

/** Normalize an unknown persisted status back into the closed status union. */
function normalizeStatus(status: unknown): TaskRecord['status'] {
  return isTaskStatus(status) ? status : 'todo'
}

/** Repair a persisted schedule rule (same policy as the browser store). */
function normalizeSchedule(schedule: unknown): ScheduleRule | undefined {
  if (typeof schedule !== 'object' || schedule === null) return undefined
  const rule = schedule as Record<string, unknown>
  if (typeof rule.cron !== 'string') return undefined
  if (rule.cron.trim() === '' || !isValidCron(rule.cron)) return undefined
  return {
    enabled: rule.enabled === true,
    cron: rule.cron,
    nextRunAt: typeof rule.nextRunAt === 'number' ? rule.nextRunAt : undefined,
    lastTriggeredAt: typeof rule.lastTriggeredAt === 'number' ? rule.lastTriggeredAt : undefined,
  }
}

/** Structural row check; invalid rows are dropped on load. */
function parseTaskRow(value: unknown): TaskRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id === '') return undefined
  if (typeof record.title !== 'string') return undefined
  if (typeof record.description !== 'string') return undefined
  if (typeof record.prompt !== 'string') return undefined
  if (typeof record.createdAt !== 'number') return undefined
  if (typeof record.updatedAt !== 'number') return undefined
  if (!Array.isArray(record.executions)) return undefined
  const executions: TaskRecord['executions'] = []
  for (const execution of record.executions) {
    if (typeof execution !== 'object' || execution === null) return undefined
    const entry = execution as Record<string, unknown>
    if (typeof entry.id !== 'string') return undefined
    if (entry.sessionId !== undefined && typeof entry.sessionId !== 'string') return undefined
    if (typeof entry.startedAt !== 'number') return undefined
    if (entry.endedAt !== undefined && typeof entry.endedAt !== 'number') return undefined
    if (entry.result !== undefined && entry.result !== 'succeeded' && entry.result !== 'failed' && entry.result !== 'cancelled') return undefined
    if (entry.error !== undefined && typeof entry.error !== 'string') return undefined
    executions.push({
      id: entry.id,
      sessionId: entry.sessionId,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      result: entry.result,
      error: entry.error,
    })
  }
  return {
    id: record.id,
    title: record.title,
    description: record.description,
    prompt: record.prompt,
    status: normalizeStatus(record.status),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    executions,
    schedule: normalizeSchedule(record.schedule),
    ...(typeof record.workspacePath === 'string' && record.workspacePath !== '' ? { workspacePath: record.workspacePath } : {}),
  }
}

/**
 * The host store. Loads/validates the document on every read and writes
 * atomically; mutation helpers are thin and delegate the domain transitions
 * to the core modules so the board and the tools share one state machine.
 */
export class TaskBoardStore {
  readonly path: string

  /**
   * @param path - store file path (defaults to the standard location).
   */
  constructor(path?: string) {
    this.path = path ?? storePath()
  }

  /** Load the full document (empty document when the file is absent). */
  load(): TaskBoardDocument {
    if (!existsSync(this.path)) return { version: FORMAT_VERSION, tasks: [], todos: [] }
    let raw: string
    try {
      raw = readFileSync(this.path, 'utf8')
    } catch {
      return { version: FORMAT_VERSION, tasks: [], todos: [] }
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return { version: FORMAT_VERSION, tasks: [], todos: [] }
    }
    if (typeof parsed !== 'object' || parsed === null) return { version: FORMAT_VERSION, tasks: [], todos: [] }
    const doc = parsed as Record<string, unknown>
    const tasks = Array.isArray(doc.tasks)
      ? doc.tasks.map(parseTaskRow).filter((row): row is TaskRecord => row !== undefined)
      : []
    const todos = Array.isArray(doc.todos)
      ? doc.todos.filter(isTodoRecord)
      : []
    return { version: FORMAT_VERSION, tasks, todos }
  }

  /** Replace the whole document (atomic tmp + rename). */
  save(document: TaskBoardDocument): void {
    const dir = dirname(this.path)
    mkdirSync(dir, { recursive: true })
    const tmp = `${this.path}.tmp-${process.pid}-${Date.now().toString(36)}`
    writeFileSync(tmp, JSON.stringify({ ...document, version: FORMAT_VERSION }, null, 2), 'utf8')
    try {
      renameSync(tmp, this.path)
    } catch (error) {
      // Best-effort cleanup of the temp file on rename failure.
      try { writeFileSync(this.path, JSON.stringify({ ...document, version: FORMAT_VERSION }, null, 2), 'utf8') } catch { /* surface below */ }
      throw error
    }
  }

  /** Load just the tasks. */
  tasks(): TaskRecord[] {
    return this.load().tasks
  }

  /** Load just the todos. */
  todos(): TodoRecord[] {
    return this.load().todos
  }

  /** Persist a task mutation: replace one task (or append) and save. */
  putTask(task: TaskRecord): void {
    const doc = this.load()
    const index = doc.tasks.findIndex(candidate => candidate.id === task.id)
    if (index >= 0) doc.tasks[index] = task
    else doc.tasks.push(task)
    this.save(doc)
  }

  /** Remove a task by id; returns whether it existed. */
  removeTask(id: string): boolean {
    const doc = this.load()
    const next = doc.tasks.filter(task => task.id !== id)
    if (next.length === doc.tasks.length) return false
    doc.tasks = next
    this.save(doc)
    return true
  }

  /** Persist a todo mutation: replace one todo (or append) and save. */
  putTodo(todo: TodoRecord): void {
    const doc = this.load()
    const index = doc.todos.findIndex(candidate => candidate.id === todo.id)
    if (index >= 0) doc.todos[index] = todo
    else doc.todos.push(todo)
    this.save(doc)
  }

  /** Remove a todo by id; returns whether it existed. */
  removeTodo(id: string): boolean {
    const doc = this.load()
    const next = doc.todos.filter(todo => todo.id !== id)
    if (next.length === doc.todos.length) return false
    doc.todos = next
    this.save(doc)
    return true
  }

  /** Replace the whole task ledger (board sync / migration). */
  replaceTasks(tasks: readonly TaskRecord[]): void {
    const doc = this.load()
    doc.tasks = tasks.map(parseTaskRow).filter((row): row is TaskRecord => row !== undefined)
    this.save(doc)
  }
}
