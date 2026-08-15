/**
 * Board controller: the single owner of task-ledger state and view state.
 *
 * It keeps the ledger in memory, persists every mutation through the
 * {@link TaskStore} (the host-backed store in production), triggers real
 * executions through the host runner, polls the ledger while a run settles,
 * and closes the board view whenever the user navigates to a session (the
 * sessions-list `current` selection changes). Framework-free (structural
 * runtime faces) so the whole orchestration is unit-testable with fakes.
 *
 * The per use-case domain transitions (create/update/delete/schedule) live in
 * dedicated modules under core/use-cases and are applied here; the controller
 * owns only the orchestration seam (state, persistence, notify, execution,
 * navigation).
 */
import type { TaskStore } from './store.ts'
import {
  withStatus,
  type NewTaskInput, type TaskRecord, type TaskStatus,
} from './tasks.ts'
import { applyCreateTask } from './use-cases/task-create.ts'
import { applyDeleteTask } from './use-cases/task-delete.ts'
import { applyScheduleNextRun as applyScheduleRollForward, applySetSchedule } from './use-cases/task-schedule.ts'
import { applyUpdateTask } from './use-cases/task-update.ts'

/** The sessions face the controller needs for navigation awareness. */
export interface SessionsControllerFace {
  list: {
    getSnapshot(): { current: string | undefined }
    subscribe(fn: () => void): () => void
  }
  /** Select a session as current (navigates the conversation view). */
  open(id: string): void
}

/**
 * The host-runner face: trigger a real execution on the host and let the
 * controller poll the ledger for the settled state.
 */
export interface HostRunnerFace {
  /** Trigger a host-side run of one task; resolves true when accepted. */
  run(id: string, parentSessionId?: string): Promise<boolean>
}

/** Controller dependencies (all swappable in tests). */
export interface ControllerDeps {
  store: TaskStore
  exec: HostRunnerFace
  sessions: SessionsControllerFace
  /** Clock; defaults to Date.now. */
  now?: () => number
  /** Id minting; defaults to a random-uuid. */
  uuid?: () => string
  /** Poll cadence (ms) while a run settles; defaults to 2000. */
  pollMs?: number
  /** Give-up bound for one run's settlement poll; defaults to 30 minutes. */
  pollTimeoutMs?: number
}

/** Immutable controller snapshot for UI subscriptions. */
export interface ControllerSnapshot {
  tasks: readonly TaskRecord[]
  boardOpen: boolean
  selectedTaskId: string | undefined
}

/** The selected task (resolved from the ledger), or undefined. */
export function selectedTaskOf(snapshot: ControllerSnapshot): TaskRecord | undefined {
  if (snapshot.selectedTaskId === undefined) return undefined
  return snapshot.tasks.find(task => task.id === snapshot.selectedTaskId)
}

function randomUuid(): string {
  const bytes = globalThis.crypto?.getRandomValues(new Uint8Array(16))
  if (bytes === undefined) {
    // Non-secure fallback (tests, odd environments).
    return `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Read the current selection off a session-list snapshot (structural). */
function currentOf(sessions: SessionsControllerFace): string | undefined {
  return sessions.list.getSnapshot().current
}

/**
 * Board controller (see module doc). All mutations bump the snapshot and
 * persist through the store; UI and DOM mounts subscribe and re-render.
 */
export class BoardController {
  private tasks: TaskRecord[] = []
  private boardOpen = false
  private selectedTaskId: string | undefined
  private listeners = new Set<() => void>()
  private disposers: Array<() => void> = []
  private readonly now: () => number
  private readonly uuid: () => string

  /** @param deps - store, host-runner face, and the sessions navigation face. */
  constructor(private readonly deps: ControllerDeps) {
    this.now = deps.now ?? (() => Date.now())
    this.uuid = deps.uuid ?? randomUuid
    this.pollMs = deps.pollMs ?? 2_000
    this.pollTimeoutMs = deps.pollTimeoutMs ?? 30 * 60_000
  }

  // --- lifecycle -------------------------------------------------------------

  /** Load the persisted ledger and start the navigation subscription. */
  start(): void {
    this.tasks = this.deps.store.load()
    // Leftover 'running' tasks (a run in flight when the page loaded) settle
    // through the host ledger; watch them until they settle.
    if (this.tasks.some(task => task.status === 'running')) this.startPolling()
    const unsubscribeExternal = this.deps.store.subscribeExternal?.(() => {
      this.tasks = this.deps.store.load()
      this.notify()
    })
    if (unsubscribeExternal !== undefined) this.disposers.push(unsubscribeExternal)
    this.disposers.push(this.deps.sessions.list.subscribe(() => {
      this.onSessionsChanged()
    }))
    this.notify()
  }

  /** Stop all subscriptions and drop retained state (idempotent). */
  dispose(): void {
    for (const dispose of this.disposers.splice(0)) dispose()
    this.stopPolling()
    this.listeners.clear()
  }

  // --- snapshot / subscription ------------------------------------------------

  getSnapshot(): ControllerSnapshot {
    return {
      tasks: this.tasks,
      boardOpen: this.boardOpen,
      selectedTaskId: this.selectedTaskId,
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  // --- view state -------------------------------------------------------------

  openBoard(): void {
    if (this.boardOpen) return
    // Baseline the selection the board opened against: the board stays open
    // until the user navigates (selection changes), never on mere status
    // updates of the already-selected session.
    this.lastCurrent = currentOf(this.deps.sessions)
    this.boardOpen = true
    this.notify()
  }

  closeBoard(): void {
    if (!this.boardOpen) return
    this.boardOpen = false
    this.notify()
  }

  toggleBoard(): void {
    if (this.boardOpen) this.closeBoard()
    else this.openBoard()
  }

  openTask(id: string): void {
    if (this.tasks.some(task => task.id === id)) {
      this.selectedTaskId = id
      this.notify()
    }
  }

  closeTask(): void {
    if (this.selectedTaskId === undefined) return
    this.selectedTaskId = undefined
    this.notify()
  }

  // --- task mutations (use-case transitions in core/use-cases) -----------------

  createTask(input: NewTaskInput): TaskRecord | undefined {
    const { task, tasks } = applyCreateTask(this.tasks, input, this.now(), this.uuid())
    if (task === undefined) return undefined
    this.tasks = [...tasks]
    this.persistAndNotify()
    return task
  }

  updateTask(id: string, patch: Partial<Pick<TaskRecord, 'title' | 'description' | 'prompt'>>): void {
    this.tasks = [...applyUpdateTask(this.tasks, id, patch, this.now())]
    this.persistAndNotify()
  }

  moveTask(id: string, status: TaskStatus): void {
    this.tasks = this.tasks.map(task => task.id === id ? withStatus(task, status, this.now()) : task)
    this.persistAndNotify()
  }

  deleteTask(id: string): void {
    const { tasks, selectionCleared } = applyDeleteTask(this.tasks, this.selectedTaskId, id)
    this.tasks = [...tasks]
    if (selectionCleared) this.selectedTaskId = undefined
    this.persistAndNotify()
  }

  // --- scheduling ---------------------------------------------------------------

  /**
   * Update a task's schedule rule. A blank or invalid cron expression is
   * rejected (returns false, state untouched). When the rule ends up enabled
   * the next run instant is computed immediately; a disabled rule carries no
   * next-run instant. Delegates the domain transition to the schedule use case.
   * @param id - the task to schedule.
   * @param patch - fields to change (absent fields keep their current value).
   * @returns true when applied, false when rejected (invalid cron / unknown task).
   */
  setSchedule(id: string, patch: { enabled?: boolean; cron?: string }): boolean {
    const { tasks, applied } = applySetSchedule(this.tasks, id, patch, this.now())
    if (!applied) return false
    this.tasks = [...tasks]
    this.persistAndNotify()
    return true
  }

  /**
   * Roll a task's schedule forward (scheduler callback): persist the next due
   * instant and the trigger instant of this run. No-op when the task has no
   * schedule rule (it was deleted mid-tick, for example).
   */
  applyScheduleNextRun(id: string, nextRunAt: number | undefined, lastTriggeredAt: number | undefined): void {
    const next = applyScheduleRollForward(this.tasks, id, nextRunAt, lastTriggeredAt, this.now())
    this.tasks = [...next]
    this.persistAndNotify()
  }

  /**
   * Jump to an execution's session transcript. Selecting the session changes
   * `current`, which closes the board (the conversation view takes over).
   * @param sessionId - the execution session to open.
   */
  openSession(sessionId: string): void {
    this.deps.sessions.open(sessionId)
  }

  // --- execution ---------------------------------------------------------------

  /**
   * Execute a task for real: ask the host runner to open an execution on the
   * task and run it, then poll the ledger until the run settles. A second
   * call while the task is already running is ignored.
   */
  async runTask(id: string): Promise<boolean> {
    const task = this.tasks.find(candidate => candidate.id === id)
    if (task === undefined || task.status === 'running') return false
    const parentSessionId = this.deps.sessions.list.getSnapshot().current
    const accepted = await this.deps.exec.run(id, parentSessionId)
    if (!accepted) return false
    // The host opened the execution and moved the task to 'running'; reload
    // the ledger and watch it settle.
    this.tasks = this.deps.store.load()
    this.notify()
    this.startPolling()
    return true
  }

  /** Re-run a settled task: move it back to 'todo' first, then execute. */
  async rerunTask(id: string): Promise<void> {
    const task = this.tasks.find(candidate => candidate.id === id)
    if (task === undefined) return
    if (task.status !== 'running') {
      this.tasks = this.tasks.map(candidate => candidate.id === id ? withStatus(candidate, 'todo', this.now()) : candidate)
      this.persistAndNotify()
    }
    await this.runTask(id)
  }

  // --- internals ---------------------------------------------------------------

  /** Close the board when the user navigates (selection changes). */
  private onSessionsChanged(): void {
    if (!this.boardOpen) return
    const current = currentOf(this.deps.sessions)
    if (current !== this.lastCurrent) this.closeBoard()
    this.lastCurrent = current
  }

  private lastCurrent: string | undefined = undefined

  /** Poll timer while any task is running. */
  private pollTimer: ReturnType<typeof setInterval> | undefined = undefined
  private readonly pollMs: number
  private readonly pollTimeoutMs: number
  private pollDeadline = 0

  /** Start polling the host ledger until every running task settles. */
  private startPolling(): void {
    if (this.pollTimer !== undefined) return
    this.pollDeadline = Date.now() + this.pollTimeoutMs
    this.pollTimer = setInterval(() => { this.pollTick() }, this.pollMs)
  }

  /** Stop the settlement poll (idempotent). */
  private stopPolling(): void {
    if (this.pollTimer !== undefined) {
      clearInterval(this.pollTimer)
      this.pollTimer = undefined
    }
  }

  /** One poll pass: reload the ledger (async when the store supports it); stop once nothing is running (or on timeout). */
  private pollTick(): void {
    const apply = (tasks: TaskRecord[]): void => {
      this.tasks = tasks
      this.notify()
      const anyRunning = tasks.some(task => task.status === 'running')
      if (!anyRunning || Date.now() > this.pollDeadline) this.stopPolling()
    }
    if (this.deps.store.refresh !== undefined) {
      void this.deps.store.refresh().then(apply).catch(() => {
        // Transient host read failure: keep polling.
      })
    } else {
      apply(this.deps.store.load())
    }
  }

  private persistAndNotify(): void {
    this.deps.store.save(this.tasks)
    this.notify()
  }

  private notify(): void {
    for (const fn of [...this.listeners]) fn()
  }
}

