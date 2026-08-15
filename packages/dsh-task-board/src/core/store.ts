/**
 * Task persistence: a small storage seam with a localStorage backend.
 *
 * The task-board client plugin runs in the browser, and dsh exposes no
 * browser-writable file channel (same conclusion the skin-center research
 * reached for cordis.patch.yml), so tasks persist in the browser's
 * localStorage under a versioned key — the same persistence mechanism dsh's
 * own client snapshot stores use (`createSnapshotStore` persist). Data
 * survives page refreshes and dsh restarts (same origin), and survives
 * plugin uninstall (the key is simply left in place).
 *
 * The seam keeps the backend swappable (e.g. an IndexedDB or a host-file
 * channel later); tests run against the in-memory backend and a jsdom
 * localStorage backend.
 */
import { isValidCron } from './schedule.ts'
import { applySetSchedule } from './use-cases/task-schedule.ts'
import type { TodoRecord } from './todos.ts'
import type { ScheduleRule, TaskRecord, TaskStatus } from './tasks.ts'
import { isTaskStatus } from './tasks.ts'

/** Field-level task update (targeted PATCH). Never carries executions: the
 * host owns execution records, and a board edit must not overwrite them. */
export interface TaskUpdatePatch {
  title?: string
  description?: string
  prompt?: string
  workspacePath?: string
  status?: TaskStatus
  schedule?: { enabled?: boolean; cron?: string; at?: number }
}

/** Persistence seam for the task ledger. */
export interface TaskStore {
  /** Read the persisted ledger (empty when nothing is stored yet). */
  load(): TaskRecord[]
  /**
   * Optional async re-read of the persisted ledger (host-backed stores use
   * this; the polling controller awaits it when present).
   */
  refresh?(): Promise<TaskRecord[]>
  /** Persist the whole ledger (replaces the stored document). */
  save(tasks: readonly TaskRecord[]): void
  /**
   * Optional single-task upsert (creation path). Host-backed stores
   * implement this so every board mutation is a targeted write: a full-ledger
   * save built from a stale snapshot can overwrite newer host state (a
   * running/settled execution) written by other writers (the host runner,
   * the scheduler, agent tools, sibling tabs).
   */
  putTask?(task: TaskRecord): void
  /**
   * Optional field-level update (edit path). Host-backed stores implement
   * this so an edit only touches the edited fields: a whole-row write from
   * a stale snapshot would overwrite the host's execution records and
   * running/done status.
   * @param now - optional clock instant (ms epoch) for schedule recompute;
   *   backends that own their clock (the host) ignore it.
   */
  updateTask?(id: string, patch: TaskUpdatePatch, now?: number): void
  /**
   * Optional single-task delete. Host-backed stores implement this so a
   * deletion never races a full-ledger save: an out-of-date board snapshot
   * writing the whole ledger back would otherwise erase tasks created by
   * other writers (agent tools, the host scheduler, sibling tabs).
   */
  deleteTask?(id: string): void
  /** Drop the persisted ledger (leaves the in-memory state alone). */
  clear(): void
  /**
   * Subscribe to ledger changes written by ANOTHER tab of the same origin
   * (browser storage events). The board controller reloads the ledger on
   * such a change, so a task deleted in one tab cannot keep firing (or be
   * written back) from the stale in-memory copy of another tab. No-op when
   * the backend has no cross-instance channel (in-memory store).
   */
  subscribeExternal?(listener: () => void): () => void
  // --- todo ledger (optional; backends without todos omit the faces) ---
  /** Read the todo ledger (empty when the backend has none). */
  todos?(): TodoRecord[]
  /** Optional async re-read of the todo ledger. */
  refreshTodos?(): Promise<TodoRecord[]>
  /** Persist the whole todo ledger (replaces the stored document). */
  saveTodos?(todos: readonly TodoRecord[]): void
  /** Optional single-todo upsert (same targeted-write rationale as putTask). */
  putTodo?(todo: TodoRecord): void
  /** Optional single-todo delete. */
  deleteTodo?(id: string): void
}

/** Storage key for the task ledger document. */
export const DEFAULT_STORAGE_KEY = 'dsh.taskBoard.v1'

/** Structural shape of the storage event fired in sibling tabs (DOM-free). */
export interface StorageChangeEvent {
  key: string | null
}

/** The event-target face the store needs for cross-tab notifications. */
export interface StorageEvents {
  addEventListener(type: 'storage', listener: (event: StorageChangeEvent) => void): void
  removeEventListener(type: 'storage', listener: (event: StorageChangeEvent) => void): void
}

/**
 * Structural row check with the status left unvalidated (see {@link parseLedger}).
 * The `schedule` field is deliberately NOT checked here: a malformed schedule
 * never drops the task row — {@link normalizeSchedule} repairs or drops the
 * schedule alone.
 */
function isTaskRecordShape(value: unknown): value is Omit<TaskRecord, 'status'> & { status: unknown } {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  if (typeof record.id !== 'string' || record.id === '') return false
  if (typeof record.title !== 'string') return false
  if (typeof record.description !== 'string') return false
  if (typeof record.prompt !== 'string') return false
  if (typeof record.createdAt !== 'number') return false
  if (typeof record.updatedAt !== 'number') return false
  if (!Array.isArray(record.executions)) return false
  for (const execution of record.executions) {
    if (typeof execution !== 'object' || execution === null) return false
    const entry = execution as Record<string, unknown>
    if (typeof entry.id !== 'string') return false
    if (entry.sessionId !== undefined && typeof entry.sessionId !== 'string') return false
    if (typeof entry.startedAt !== 'number') return false
    if (entry.endedAt !== undefined && typeof entry.endedAt !== 'number') return false
    if (entry.result !== undefined && entry.result !== 'succeeded' && entry.result !== 'failed' && entry.result !== 'cancelled') return false
    if (entry.error !== undefined && typeof entry.error !== 'string') return false
  }
  return true
}

/** A task record is structurally valid if it round-trips through the UI. */
export function isTaskRecord(value: unknown): value is TaskRecord {
  return isTaskRecordShape(value) && isTaskStatus(value.status)
}

/** Normalize an unknown persisted status back into the closed status union. */
function normalizeStatus(status: unknown): TaskStatus {
  return isTaskStatus(status) ? status : 'todo'
}

/**
 * Repair a persisted schedule rule into the v2 shape (one discriminated rule
 * with a `recurring` flag): a usable cron rule becomes recurring, a one-shot
 * `onceAt` instant (or an explicit `recurring: false` row) becomes one-shot.
 * Booleans/numbers are coerced and `nextRunAt`/`lastTriggeredAt` left
 * undefined when missing (a fresh recompute or the next tick fixes them). A
 * fired one-shot (nextRunAt consumed) is kept so the rule survives until the
 * run settles.
 */
function normalizeSchedule(schedule: unknown): ScheduleRule | undefined {
  if (typeof schedule !== 'object' || schedule === null) return undefined
  const rule = schedule as Record<string, unknown>
  const cron = typeof rule.cron === 'string' ? rule.cron.trim() : ''
  const onceAt = typeof rule.onceAt === 'number' ? rule.onceAt : undefined
  const nextRunAt = typeof rule.nextRunAt === 'number' ? rule.nextRunAt : undefined
  const lastTriggeredAt = typeof rule.lastTriggeredAt === 'number' ? rule.lastTriggeredAt : undefined
  if (cron !== '') {
    // A malformed cron rule would otherwise linger as a never-firing
    // schedule instead of being dropped for later repair.
    if (!isValidCron(cron)) return undefined
    return {
      enabled: rule.enabled === true,
      recurring: true,
      cron,
      nextRunAt,
      lastTriggeredAt,
    }
  }
  if (onceAt !== undefined) {
    return {
      enabled: rule.enabled === true,
      recurring: false,
      cron: '',
      nextRunAt: nextRunAt ?? onceAt,
      lastTriggeredAt,
    }
  }
  if (rule.recurring === false) {
    return {
      enabled: rule.enabled === true,
      recurring: false,
      cron: '',
      nextRunAt,
      lastTriggeredAt,
    }
  }
  return undefined
}

/**
 * Apply a field-level update patch to a ledger (shared by the non-host
 * backends). Only the patched fields change: executions and every other host
 * -owned field survive untouched.
 */
function applyTaskUpdatePatch(tasks: readonly TaskRecord[], id: string, patch: TaskUpdatePatch, now: number): TaskRecord[] {
  return tasks.map(task => {
    if (task.id !== id) return task
    const next: TaskRecord = { ...task, updatedAt: now }
    if (patch.title !== undefined) next.title = patch.title
    if (patch.description !== undefined) next.description = patch.description
    if (patch.prompt !== undefined) next.prompt = patch.prompt
    if (patch.workspacePath !== undefined) next.workspacePath = patch.workspacePath
    if (patch.status !== undefined) next.status = patch.status
    if (patch.schedule !== undefined) {
      const { tasks: scheduled } = applySetSchedule([next], id, patch.schedule, now)
      next.schedule = scheduled[0].schedule
    }
    return next
  })
}

/** Parse + validate a persisted ledger document; invalid rows are dropped. */
export function parseLedger(raw: string | null): TaskRecord[] {
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    console.error('[dsh-task-board] persisted task ledger is not valid JSON; starting empty', error)
    return []
  }
  if (!Array.isArray(parsed)) {
    console.error('[dsh-task-board] persisted task ledger is not an array; starting empty')
    return []
  }
  const tasks: TaskRecord[] = []
  for (const row of parsed) {
    // Status is normalized (an unknown status from a future version lands in
    // todo instead of dropping the row); the schedule is repaired field by
    // field; every other field must be valid.
    if (!isTaskRecordShape(row)) {
      console.warn('[dsh-task-board] dropping invalid task row from persisted ledger', row)
      continue
    }
    // Always (re)assign the schedule: a repair that returns undefined must
    // clear a malformed persisted rule rather than leave it in the row.
    const task: TaskRecord = { ...row, status: normalizeStatus(row.status) }
    task.schedule = normalizeSchedule(row.schedule)
    tasks.push(task)
  }
  return tasks
}

/** localStorage-backed store (the browser backend). */
export class LocalStorageTaskStore implements TaskStore {
  /**
   * @param key - storage key for the ledger document.
   * @param storage - storage backend (defaults to the global localStorage; tests inject fakes).
   * @param events - storage-event target for cross-tab notifications (defaults
   *   to the browser global; undefined in non-browser runtimes, where the
   *   subscription becomes a no-op).
   */
  constructor(
    private readonly key: string = DEFAULT_STORAGE_KEY,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | undefined = globalThis.localStorage,
    private readonly events: StorageEvents | undefined = typeof (globalThis as { addEventListener?: unknown }).addEventListener === 'function'
      ? (globalThis as unknown as StorageEvents)
      : undefined,
  ) {}

  load(): TaskRecord[] {
    if (this.storage === undefined) return []
    try {
      return parseLedger(this.storage.getItem(this.key))
    } catch (error) {
      // Storage read failures (private mode, quota) degrade to an empty ledger,
      // never break the board.
      console.error('[dsh-task-board] task ledger read failed; starting empty', error)
      return []
    }
  }

  save(tasks: readonly TaskRecord[]): void {
    if (this.storage === undefined) return
    try {
      this.storage.setItem(this.key, JSON.stringify(tasks))
    } catch (error) {
      // Write failures only skip persistence; in-memory state stays live.
      console.error('[dsh-task-board] task ledger write failed (persistence skipped)', error)
    }
  }

  deleteTask(id: string): void {
    if (this.storage === undefined) return
    this.save(this.load().filter(task => task.id !== id))
  }

  putTask(task: TaskRecord): void {
    if (this.storage === undefined) return
    const current = this.load()
    const index = current.findIndex(candidate => candidate.id === task.id)
    if (index >= 0) current[index] = task
    else current.push(task)
    this.save(current)
  }

  updateTask(id: string, patch: TaskUpdatePatch, now?: number): void {
    if (this.storage === undefined) return
    this.save(applyTaskUpdatePatch(this.load(), id, patch, now ?? Date.now()))
  }

  clear(): void {
    if (this.storage === undefined) return
    try {
      this.storage.removeItem(this.key)
    } catch (error) {
      console.error('[dsh-task-board] task ledger clear failed', error)
    }
  }

  /**
   * Cross-tab change subscription (see {@link TaskStore.subscribeExternal}).
   * The browser fires the storage event in every OTHER tab of the same origin
   * when one tab writes; a null key means the whole storage was cleared. Both
   * cases reload the ledger here; unrelated keys are ignored.
   */
  subscribeExternal(listener: () => void): () => void {
    if (this.events === undefined) return () => {}
    const onStorage = (event: StorageChangeEvent): void => {
      if (event.key !== null && event.key !== this.key) return
      listener()
    }
    this.events.addEventListener('storage', onStorage)
    return () => { this.events?.removeEventListener('storage', onStorage) }
  }
}

/** In-memory backend (tests, and a fallback when storage is unavailable). */
export class InMemoryTaskStore implements TaskStore {
  private ledger: TaskRecord[] = []
  private todoLedger: TodoRecord[] = []

  load(): TaskRecord[] {
    return this.ledger.map(task => ({ ...task, executions: [...task.executions] }))
  }

  save(tasks: readonly TaskRecord[]): void {
    this.ledger = tasks.map(task => ({ ...task, executions: [...task.executions] }))
  }

  deleteTask(id: string): void {
    this.ledger = this.ledger.filter(task => task.id !== id)
  }

  putTask(task: TaskRecord): void {
    const index = this.ledger.findIndex(candidate => candidate.id === task.id)
    if (index >= 0) this.ledger[index] = { ...task, executions: [...task.executions] }
    else this.ledger.push({ ...task, executions: [...task.executions] })
  }

  updateTask(id: string, patch: TaskUpdatePatch, now?: number): void {
    this.ledger = applyTaskUpdatePatch(this.ledger, id, patch, now ?? Date.now())
  }

  clear(): void {
    this.ledger = []
  }

  todos(): TodoRecord[] {
    return [...this.todoLedger]
  }

  saveTodos(todos: readonly TodoRecord[]): void {
    this.todoLedger = [...todos]
  }

  putTodo(todo: TodoRecord): void {
    const index = this.todoLedger.findIndex(candidate => candidate.id === todo.id)
    if (index >= 0) this.todoLedger[index] = { ...todo }
    else this.todoLedger.push({ ...todo })
  }

  deleteTodo(id: string): void {
    this.todoLedger = this.todoLedger.filter(todo => todo.id !== id)
  }
}
