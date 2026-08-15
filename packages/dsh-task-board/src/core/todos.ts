/**
 * Todo domain model: durable cross-session todos owned by the host store.
 * Framework-free (no cordis, no runtime imports) so the state machine is
 * unit-testable in isolation.
 *
 * Todos are the lightweight counterpart of board tasks: agent-facing
 * `todo_add` / `todo_list` / `todo_done` / `todo_delete` operate on this
 * ledger, and the board UI can surface the same rows in a future column.
 */

/** Todo lifecycle status. */
export type TodoStatus = 'open' | 'done'

/** One todo row. */
export interface TodoRecord {
  /** Stable todo id (uuid). */
  id: string
  /** Short title. */
  title: string
  /** Optional longer description. */
  description: string
  /** Current status. */
  status: TodoStatus
  /** Creation instant (ms epoch). */
  createdAt: number
  /** Last mutation instant (ms epoch). */
  updatedAt: number
}

/** Input for creating a todo. */
export interface NewTodoInput {
  title: string
  description: string
}

/** All valid todo statuses (closed union guard). */
export const ALL_TODO_STATUSES: readonly TodoStatus[] = ['open', 'done']

/** Brand an unknown string as a todo status; undefined when it is not one. */
export function isTodoStatus(value: unknown): value is TodoStatus {
  return typeof value === 'string' && (ALL_TODO_STATUSES as readonly string[]).includes(value)
}

/** Create a todo from input. */
export function createTodo(input: NewTodoInput, now: number, id: string): TodoRecord {
  return {
    id,
    title: input.title.trim(),
    description: input.description.trim(),
    status: 'open',
    createdAt: now,
    updatedAt: now,
  }
}

/** Clone a todo with an updated status and a fresh updatedAt. */
export function withTodoStatus(todo: TodoRecord, status: TodoStatus, now: number): TodoRecord {
  return { ...todo, status, updatedAt: now }
}

/** Whether a todo record is structurally valid. */
export function isTodoRecord(value: unknown): value is TodoRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id === '') return false
  if (typeof record.title !== 'string') return false
  if (typeof record.description !== 'string') return false
  if (!isTodoStatus(record.status)) return false
  if (typeof record.createdAt !== 'number') return false
  if (typeof record.updatedAt !== 'number') return false
  return true
}

/** A compact todo summary for agent-facing list surfaces. */
export function summarizeTodo(todo: TodoRecord): { id: string; title: string; status: TodoStatus; createdAt: number } {
  return { id: todo.id, title: todo.title, status: todo.status, createdAt: todo.createdAt }
}
