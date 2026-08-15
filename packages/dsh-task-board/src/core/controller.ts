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
import { createTodo, withTodoStatus, type NewTodoInput, type TodoRecord } from './todos.ts'
import { applyCreateTask } from './use-cases/task-create.ts'
import { applyDeleteTask } from './use-cases/task-delete.ts'
import { applySetSchedule } from './use-cases/task-schedule.ts'
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
  /** Poll cadence (ms) while the board is open; defaults to 2000. */
  pollMs?: number
}

/** Immutable controller snapshot for UI subscriptions. */
export interface ControllerSnapshot {
  tasks: readonly TaskRecord[]
  todos: readonly TodoRecord[]
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
  private todos: TodoRecord[] = []
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
  }

  // --- lifecycle -------------------------------------------------------------

  /** Load the persisted ledger and start the navigation subscription. */
  start(): void {
    this.tasks = this.deps.store.load()
    this.todos = this.deps.store.todos?.() ?? []
    // Leftover 'running' tasks (a run in flight when the page loaded) settle
    // through the host ledger; watch them until they settle.
    if (this.tasks.some(task => task.status === 'running')) this.startPolling()
    const unsubscribeExternal = this.deps.store.subscribeExternal?.(() => {
      this.tasks = this.deps.store.load()
      this.todos = this.deps.store.todos?.() ?? []
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
      todos: this.todos,
      boardOpen: this.boardOpen,
      selectedTaskId: this.selectedTaskId,
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  // --- todo mutations ----------------------------------------------------------

  /** Add a durable todo (persisted through the store). */
  addTodo(input: NewTodoInput): TodoRecord | undefined {
    if (input.title.trim() === '') return undefined
    const todo = createTodo(input, this.now(), this.uuid())
    this.todos = [...this.todos, todo]
    if (this.deps.store.putTodo !== undefined) {
      this.deps.store.putTodo(todo)
      this.notify()
      return todo
    }
    this.persistTodosAndNotify()
    return todo
  }

  /** Toggle a todo between open and done. */
  toggleTodo(id: string): void {
    const todo = this.todos.find(candidate => candidate.id === id)
    if (todo === undefined) return
    const changed = withTodoStatus(todo, todo.status === 'done' ? 'open' : 'done', this.now())
    this.todos = this.todos.map(candidate => candidate.id === id ? changed : candidate)
    if (this.deps.store.putTodo !== undefined) {
      this.deps.store.putTodo(changed)
      this.notify()
      return
    }
    this.persistTodosAndNotify()
  }

  /** Delete a todo. */
  deleteTodo(id: string): void {
    this.todos = this.todos.filter(todo => todo.id !== id)
    if (this.deps.store.deleteTodo !== undefined) {
      this.deps.store.deleteTodo(id)
      this.notify()
      return
    }
    this.persistTodosAndNotify()
  }

  /** Reload the todo ledger from the store (async when supported). */
  refreshTodos(): void {
    if (this.deps.store.refreshTodos !== undefined) {
      void this.deps.store.refreshTodos().then(todos => {
        this.todos = todos
        this.notify()
      }).catch(() => { /* transient read failure */ })
    } else {
      this.todos = this.deps.store.todos?.() ?? []
      this.notify()
    }
  }

  // --- view state -------------------------------------------------------------

  openBoard(): void {
    if (this.boardOpen) return
    // Baseline the selection the board opened against: the board stays open
    // until the user navigates (selection changes), never on mere status
    // updates of the already-selected session.
    this.lastCurrent = currentOf(this.deps.sessions)
    this.boardOpen = true
    // Fresh data on open, then keep polling while the board is visible so
    // agent-created tasks/todos appear without a page reload.
    this.refreshAll()
    this.startPolling()
    this.notify()
  }

  closeBoard(): void {
    if (!this.boardOpen) return
    this.boardOpen = false
    this.stopPolling()
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
    // Targeted upsert when the store supports it: a full-ledger save from a
    // stale snapshot could overwrite newer host state written by other
    // writers (the host runner, the scheduler, agent tools, sibling tabs).
    if (this.deps.store.putTask !== undefined) {
      this.deps.store.putTask(task)
      this.notify()
      return task
    }
    this.persistAndNotify()
    return task
  }

  updateTask(id: string, patch: Partial<Pick<TaskRecord, 'title' | 'description' | 'prompt' | 'workspacePath'>>): void {
    const updated = applyUpdateTask(this.tasks, id, patch, this.now())
    this.tasks = [...updated]
    // Field-level targeted update: an edit must never carry (and overwrite)
    // host-owned state such as execution records or the running status.
    if (this.deps.store.updateTask !== undefined) {
      this.deps.store.updateTask(id, patch, this.now())
      this.notify()
      return
    }
    if (this.deps.store.putTask !== undefined) {
      const changed = updated.find(task => task.id === id)
      if (changed !== undefined) {
        this.deps.store.putTask(changed)
        this.notify()
        return
      }
    }
    this.persistAndNotify()
  }

  moveTask(id: string, status: TaskStatus): void {
    this.tasks = this.tasks.map(task => task.id === id ? withStatus(task, status, this.now()) : task)
    if (this.deps.store.updateTask !== undefined) {
      this.deps.store.updateTask(id, { status }, this.now())
      this.notify()
      return
    }
    const changed = this.tasks.find(task => task.id === id)
    if (changed !== undefined && this.deps.store.putTask !== undefined) {
      this.deps.store.putTask(changed)
      this.notify()
      return
    }
    this.persistAndNotify()
  }

  deleteTask(id: string): void {
    const { tasks, selectionCleared } = applyDeleteTask(this.tasks, this.selectedTaskId, id)
    this.tasks = [...tasks]
    if (selectionCleared) this.selectedTaskId = undefined
    // Targeted delete when the store supports it: a full-ledger save from a
    // stale snapshot could otherwise erase tasks created by other writers
    // (agent tools, the host scheduler, sibling tabs).
    if (this.deps.store.deleteTask !== undefined) {
      this.deps.store.deleteTask(id)
      this.notify()
      return
    }
    this.persistAndNotify()
  }

  // --- scheduling ---------------------------------------------------------------

  /**
   * Update a task's schedule rule. A blank or invalid cron expression or a
   * missing one-shot trigger is rejected (returns false, state untouched).
   * When the rule ends up enabled the next run instant is computed
   * immediately (recurring) or restored from the trigger (one-shot); a
   * disabled rule carries no next-run instant — except a paused one-shot
   * keeps its trigger for later resume. Delegates the domain transition to
   * the schedule use case.
   * @param id - the task to schedule.
   * @param patch - fields to change (absent fields keep their current value).
   * @returns true when applied, false when rejected (invalid cron / missing trigger / unknown task).
   */
  setSchedule(id: string, patch: { enabled?: boolean; cron?: string; at?: number }): boolean {
    const { tasks, applied } = applySetSchedule(this.tasks, id, patch, this.now())
    if (!applied) return false
    this.tasks = [...tasks]
    if (this.deps.store.updateTask !== undefined) {
      this.deps.store.updateTask(id, { schedule: patch }, this.now())
      this.notify()
      return true
    }
    const changed = tasks.find(task => task.id === id)
    if (changed !== undefined && this.deps.store.putTask !== undefined) {
      this.deps.store.putTask(changed)
      this.notify()
      return true
    }
    this.persistAndNotify()
    return true
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
    // The host opened the execution and moved the task to 'running'; re-read
    // the FRESH host ledger (refresh when available — the sync load() face of
    // a host-backed store is only an in-memory mirror) and watch it settle.
    this.tasks = this.deps.store.refresh !== undefined
      ? await this.deps.store.refresh()
      : this.deps.store.load()
    this.notify()
    this.startPolling()
    return true
  }

  /**
   * Re-run a settled task: move it back to 'todo' in the UI, then execute.
   * The status flip is NOT persisted here — the host run path owns the
   * running/done transitions, and a full-ledger save from this snapshot
   * could race (and overwrite) the execution the host is about to write.
   */
  async rerunTask(id: string): Promise<void> {
    const task = this.tasks.find(candidate => candidate.id === id)
    if (task === undefined) return
    if (task.status !== 'running') {
      this.tasks = this.tasks.map(candidate => candidate.id === id ? withStatus(candidate, 'todo', this.now()) : candidate)
      this.notify()
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

  /** Poll timer while the board is open. */
  private pollTimer: ReturnType<typeof setInterval> | undefined = undefined
  private readonly pollMs: number

  /** Start polling the host ledger while the board is open (idempotent). */
  private startPolling(): void {
    if (this.pollTimer !== undefined) return
    this.pollTimer = setInterval(() => { this.pollTick() }, this.pollMs)
  }

  /** Stop the poll (idempotent). */
  private stopPolling(): void {
    if (this.pollTimer !== undefined) {
      clearInterval(this.pollTimer)
      this.pollTimer = undefined
    }
  }

  /** One poll pass: reload tasks + todos from the host (agent changes appear live). */
  private pollTick(): void {
    this.refreshAll()
  }

  /** Reload the task and todo ledgers (async when the store supports it). */
  private refreshAll(): void {
    if (this.deps.store.refresh !== undefined) {
      void this.deps.store.refresh().then(tasks => {
        this.tasks = tasks
        this.notify()
      }).catch(() => { /* transient host read failure */ })
    } else {
      this.tasks = this.deps.store.load()
      this.notify()
    }
    this.refreshTodos()
  }

  private persistAndNotify(): void {
    this.deps.store.save(this.tasks)
    this.notify()
  }

  private persistTodosAndNotify(): void {
    this.deps.store.saveTodos?.(this.todos)
    this.notify()
  }

  private notify(): void {
    for (const fn of [...this.listeners]) fn()
  }
}

