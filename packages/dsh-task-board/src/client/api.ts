/**
 * Browser-side API client for the /api/task-board route family: the board's
 * data face (TaskStore over the wire) and the host-execution bridge. The
 * board keeps its controller/UI untouched; only the persistence and execution
 * backends move to the host.
 */

import type { TaskRecord } from '../core/tasks.ts'
import type { TodoRecord } from '../core/todos.ts'
import type { TaskStore, TaskUpdatePatch } from '../core/store.ts'
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

  /** Delete one task on the host (a targeted DELETE, never a full-ledger write). */
  async deleteTask(id: string): Promise<boolean> {
    await readJson<{ ok: boolean }>(await fetch(`/api/task-board/tasks?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }))
    return true
  }

  /** Upsert exactly one task on the host (the board's targeted mutation path). */
  async putTask(task: TaskRecord): Promise<TaskRecord | undefined> {
    const body = await readJson<{ task?: TaskRecord }>(await fetch('/api/task-board/tasks', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ task }),
    }))
    return body.task
  }

  /** Field-level task update (targeted PATCH; never carries executions). */
  async patchTask(id: string, patch: TaskUpdatePatch): Promise<TaskRecord | undefined> {
    const body = await readJson<{ task?: TaskRecord }>(await fetch('/api/task-board/tasks', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id, patch }),
    }))
    return body.task
  }

  /** Load the todo ledger. */
  async todos(): Promise<TodoRecord[]> {
    return (await readJson<{ todos: TodoRecord[] }>(await fetch('/api/task-board/todos'))).todos
  }

  /** Upsert exactly one todo on the host. */
  async putTodo(todo: TodoRecord): Promise<TodoRecord | undefined> {
    const body = await readJson<{ todo?: TodoRecord }>(await fetch('/api/task-board/todos', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ todo }),
    }))
    return body.todo
  }

  /** Delete one todo on the host. */
  async deleteTodo(id: string): Promise<boolean> {
    await readJson<{ ok: boolean }>(await fetch(`/api/task-board/todos?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }))
    return true
  }

  /** Replace the whole todo ledger. */
  async replaceTodos(todos: readonly TodoRecord[]): Promise<TodoRecord[]> {
    return (await readJson<{ todos: TodoRecord[] }>(await fetch('/api/task-board/todos/batch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ todos }),
    }))).todos
  }
}

/**
 * The board's TaskStore over the host API. Every board mutation is a
 * TARGETED write ({@link putTask} / {@link deleteTask} / putTodo /
 * deleteTodo) so a stale in-memory snapshot can never overwrite newer host
 * state (a running/settled execution) or erase tasks written by other
 * writers (agent tools, the host scheduler, sibling tabs). `refresh()`
 * re-reads the host ledger (the settlement poll path); `save()` remains as a
 * merge fallback for legacy paths only.
 * Cross-instance notifications are a no-op: the host is the single owner.
 */
export class ApiTaskStore implements TaskStore {
  /** Whether the legacy localStorage ledger was already pushed to the host. */
  private migrated = false
  /** In-memory mirror of the host ledger (the sync `load()` face). */
  private cached: TaskRecord[] = []
  /** In-memory mirror of the host todo ledger. */
  private cachedTodos: TodoRecord[] = []

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
    // Load the todo ledger in the same pass so the board starts with both.
    void this.refreshTodos()
    return tasks
  }

  save(tasks: readonly TaskRecord[]): void {
    this.cached = [...tasks]
    void (async () => {
      try {
        // Merge against the freshest host ledger: rows the snapshot does not
        // carry (agent-created, scheduler-created, sibling-tab) survive; the
        // snapshot's own rows win over their host twins.
        const current = await this.api.tasks()
        const byId = new Map(tasks.map(task => [task.id, task]))
        await this.api.replaceTasks([...current.filter(task => !byId.has(task.id)), ...tasks])
      } catch (error) {
        console.error('[dsh-task-board] failed to persist the ledger', error)
      }
    })()
  }

  deleteTask(id: string): void {
    this.cached = this.cached.filter(task => task.id !== id)
    void this.api.deleteTask(id).catch(error => {
      console.error(`[dsh-task-board] failed to delete task '${id}' on the host`, error)
    })
  }

  putTask(task: TaskRecord): void {
    const index = this.cached.findIndex(candidate => candidate.id === task.id)
    if (index >= 0) this.cached[index] = task
    else this.cached.push(task)
    void this.api.putTask(task).catch(error => {
      console.error(`[dsh-task-board] failed to persist task '${task.id}' on the host`, error)
    })
  }

  updateTask(id: string, patch: TaskUpdatePatch, _now?: number): void {
    // Optimistically mirror the patch locally (the poll corrects drift).
    this.cached = this.cached.map(task => {
      if (task.id !== id) return task
      const next: TaskRecord = { ...task, updatedAt: Date.now() }
      if (patch.title !== undefined) next.title = patch.title
      if (patch.description !== undefined) next.description = patch.description
      if (patch.prompt !== undefined) next.prompt = patch.prompt
      if (patch.workspacePath !== undefined) next.workspacePath = patch.workspacePath
      if (patch.status !== undefined) next.status = patch.status
      return next
    })
    void this.api.patchTask(id, patch).catch(error => {
      console.error(`[dsh-task-board] failed to update task '${id}' on the host`, error)
    })
  }

  clear(): void {
    this.cached = []
    void this.api.replaceTasks([]).catch(() => { /* best effort */ })
  }

  todos(): TodoRecord[] {
    return this.cachedTodos
  }

  async refreshTodos(): Promise<TodoRecord[]> {
    try {
      this.cachedTodos = await this.api.todos()
    } catch (error) {
      console.warn('[dsh-task-board] failed to read the todo ledger', error)
    }
    return this.cachedTodos
  }

  saveTodos(todos: readonly TodoRecord[]): void {
    this.cachedTodos = [...todos]
    void this.api.replaceTodos(todos).catch(error => {
      console.error('[dsh-task-board] failed to persist the todo ledger', error)
    })
  }

  putTodo(todo: TodoRecord): void {
    const index = this.cachedTodos.findIndex(candidate => candidate.id === todo.id)
    if (index >= 0) this.cachedTodos[index] = todo
    else this.cachedTodos.push(todo)
    void this.api.putTodo(todo).catch(error => {
      console.error(`[dsh-task-board] failed to persist todo '${todo.id}' on the host`, error)
    })
  }

  deleteTodo(id: string): void {
    this.cachedTodos = this.cachedTodos.filter(todo => todo.id !== id)
    void this.api.deleteTodo(id).catch(error => {
      console.error(`[dsh-task-board] failed to delete todo '${id}' on the host`, error)
    })
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
