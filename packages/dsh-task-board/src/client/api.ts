/**
 * Browser-side API client for the /api/task-board route family: the board's
 * data face (TaskStore over the wire) and the host-execution bridge. The
 * board keeps its controller/UI untouched; only the persistence and execution
 * backends move to the host.
 */

import type { TaskRecord } from '../core/tasks.ts'
import type { TodoRecord } from '../core/todos.ts'
import type { TaskStore } from '../core/store.ts'
import { parseLedger } from '../core/store.ts'

/** Legacy localStorage ledger key (migration source). */
export const LEGACY_STORAGE_KEY = 'dsh.taskBoard.v1'

/** HTTP error carrying the route's JSON error message. */
export class TaskBoardApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TaskBoardApiError'
  }
}

/** Parse a JSON response or throw. */
async function readJson<T>(response: Response): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new TaskBoardApiError(`HTTP ${response.status}: invalid JSON response`)
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : `HTTP ${response.status}`
    throw new TaskBoardApiError(message)
  }
  return body as T
}

/** The browser half's only data entry point. */
export class TaskBoardApi {
  /** Load the task ledger. */
  async tasks(): Promise<TaskRecord[]> {
    return (await readJson<{ tasks: TaskRecord[] }>(await fetch('/api/task-board/tasks'))).tasks
  }

  /** Replace the whole task ledger (board save + migration). */
  async replaceTasks(tasks: readonly TaskRecord[]): Promise<TaskRecord[]> {
    return (await readJson<{ tasks: TaskRecord[] }>(await fetch('/api/task-board/migrate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tasks }),
    }))).tasks
  }

  /** Trigger a host-side run (fire-and-forget; poll tasks() for settlement). */
  async run(id: string, parentSessionId?: string): Promise<boolean> {
    await readJson<{ ok: boolean }>(await fetch('/api/task-board/tasks/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, ...(parentSessionId !== undefined ? { parentSessionId } : {}) }),
    }))
    return true
  }

  /** Load the todo ledger. */
  async todos(): Promise<TodoRecord[]> {
    return (await readJson<{ todos: TodoRecord[] }>(await fetch('/api/task-board/todos'))).todos
  }
}

/**
 * The board's TaskStore over the host API. Saving replaces the whole host
 * ledger (the same replace semantics as the retired localStorage store), and
 * `refresh()` re-reads the host ledger (the settlement poll path).
 * Cross-instance notifications are a no-op: the host is the single owner.
 */
export class ApiTaskStore implements TaskStore {
  /** Whether the legacy localStorage ledger was already pushed to the host. */
  private migrated = false
  /** In-memory mirror of the host ledger (the sync `load()` face). */
  private cached: TaskRecord[] = []

  constructor(private readonly api: TaskBoardApi) {}

  load(): TaskRecord[] {
    return this.cached
  }

  /** Async re-read + one-shot legacy migration (call before start()). */
  async refresh(): Promise<TaskRecord[]> {
    let tasks = await this.api.tasks()
    if (!this.migrated && tasks.length === 0) {
      const legacy = this.readLegacy()
      if (legacy.length > 0) {
        try {
          tasks = await this.api.replaceTasks(legacy)
        } catch (error) {
          console.warn('[dsh-task-board] legacy ledger migration failed; keeping it for a later attempt', error)
        }
      }
    }
    this.migrated = true
    this.cached = tasks
    return tasks
  }

  save(tasks: readonly TaskRecord[]): void {
    this.cached = [...tasks]
    void this.api.replaceTasks(tasks).catch(error => {
      console.error('[dsh-task-board] failed to persist the ledger', error)
    })
  }

  clear(): void {
    this.cached = []
    void this.api.replaceTasks([]).catch(() => { /* best effort */ })
  }

  /** Read the legacy localStorage ledger (empty when absent). */
  private readLegacy(): TaskRecord[] {
    if (typeof localStorage === 'undefined') return []
    try {
      return parseLedger(localStorage.getItem(LEGACY_STORAGE_KEY))
    } catch {
      return []
    }
  }
}
