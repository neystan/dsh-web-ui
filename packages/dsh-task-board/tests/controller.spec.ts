/**
 * Controller tests: orchestration — persistence, view state, navigation
 * awareness, and the host-run loop (run triggers the host runner, the board
 * polls the ledger until the host settles the task).
 */
import { describe, expect, it, vi } from 'vitest'
import { BoardController, type ControllerDeps } from '../src/core/controller.ts'
import { InMemoryTaskStore } from '../src/core/store.ts'
import { createTask, type TaskRecord } from '../src/core/tasks.ts'

const NOW = 1_700_000_000_000
let nextId = 0
const uuid = (): string => { nextId += 1; return `id-${nextId}` }

/** Flush pending microtasks (async controller paths). */
const flush = (): Promise<void> => new Promise(resolve => { setTimeout(resolve, 0) })

/** Sleep for a short real interval (poll cadence is 2ms in these tests). */
const sleep = (ms: number): Promise<void> => new Promise(resolve => { setTimeout(resolve, ms) })

/** Controllable sessions face (selection + open). */
class FakeSessions {
  current: string | undefined = undefined
  openCalls: string[] = []
  private listeners = new Set<() => void>()
  list = {
    getSnapshot: (): { current: string | undefined } => ({ current: this.current }),
    subscribe: (fn: () => void): (() => void) => {
      this.listeners.add(fn)
      return () => { this.listeners.delete(fn) }
    },
  }
  open(id: string): void {
    this.openCalls.push(id)
    this.setCurrent(id)
  }
  setCurrent(id: string | undefined): void {
    this.current = id
    for (const fn of [...this.listeners]) fn()
  }
}

/** Controllable host-runner stub: captures run ids; simulates host-side ledger writes on demand. */
class StubRunner {
  runCalls: string[] = []
  /** Whether run() accepts (true) or reports a conflict (false). */
  accept = true
  /** When set, run() writes this ledger transition first (the host opens the execution). */
  onRun?: (store: InMemoryTaskStore, taskId: string) => void
  async run(id: string): Promise<boolean> {
    this.runCalls.push(id)
    if (!this.accept) return false
    if (this.onRun !== undefined) this.onRun(this.store, id)
    return true
  }
  constructor(private readonly store: InMemoryTaskStore) {}
}

/** Mark a task running with a fresh execution (the host's openExecution shape). */
function hostOpen(store: InMemoryTaskStore, taskId: string): void {
  const task = store.load().find(candidate => candidate.id === taskId)
  if (task === undefined) return
  store.save([{
    ...task,
    status: 'running',
    updatedAt: NOW,
    executions: [...task.executions, {
      id: 'host-exec-1', sessionId: 's-1', startedAt: NOW, endedAt: undefined, result: undefined, error: undefined,
    }],
  }])
}

/** Settle a running task the way the host does (end the execution, move the column). */
function hostSettle(store: InMemoryTaskStore, taskId: string, result: 'succeeded' | 'failed' | 'cancelled', error?: string): void {
  const task = store.load().find(candidate => candidate.id === taskId)
  if (task === undefined) return
  const executions = task.executions.map(entry =>
    entry.endedAt === undefined ? { ...entry, endedAt: NOW, result, error } : entry)
  store.save([{
    ...task,
    status: result === 'succeeded' ? 'done' : result === 'failed' ? 'failed' : 'todo',
    updatedAt: NOW,
    executions,
  }])
}

function makeController(runner?: StubRunner) {
  const sessions = new FakeSessions()
  const store = new InMemoryTaskStore()
  const stub = runner ?? new StubRunner(store)
  const deps: ControllerDeps = {
    store,
    exec: stub,
    sessions,
    now: () => NOW,
    uuid,
    pollMs: 2,
  }
  const controller = new BoardController(deps)
  controller.start()
  return { controller, sessions, store, stub }
}

function seedTask(store: InMemoryTaskStore, overrides: Partial<Parameters<typeof createTask>[0] & { id: string }> = {}) {
  const task = createTask(
    { title: '任务A', description: '描述', prompt: 'prompt A', ...overrides },
    NOW,
    overrides.id ?? 'task-a',
  )
  store.save([task])
  return task
}

describe('BoardController lifecycle', () => {
  it('loads the persisted ledger on start', () => {
    const { controller, store } = makeController()
    seedTask(store)
    const reloaded = new BoardController({
      store, exec: new StubRunner(store),
      sessions: new FakeSessions(), now: () => NOW, uuid,
    })
    reloaded.start()
    expect(reloaded.getSnapshot().tasks.map(task => task.id)).toEqual(['task-a'])
  })

  it('dispose unsubscribes (no more notifications)', () => {
    const { controller, sessions } = makeController()
    let count = 0
    controller.subscribe(() => { count += 1 })
    controller.dispose()
    sessions.setCurrent('s-1')
    expect(count).toBe(0)
  })
})

describe('task mutations', () => {
  it('creates, persists, and rejects blank titles', () => {
    const { controller, store } = makeController()
    const task = controller.createTask({ title: ' 新任务 ', description: '', prompt: '' })
    expect(task).toBeDefined()
    expect(controller.getSnapshot().tasks).toHaveLength(1)
    expect(store.load()[0].title).toBe('新任务')
    expect(controller.createTask({ title: '   ', description: '', prompt: '' })).toBeUndefined()
  })

  it('deletes and clears the selection when the selected task is removed', () => {
    const { controller, store } = makeController()
    const task = controller.createTask({ title: 'x', description: '', prompt: '' })!
    controller.openTask(task.id)
    controller.deleteTask(task.id)
    expect(controller.getSnapshot().tasks).toHaveLength(0)
    expect(controller.getSnapshot().selectedTaskId).toBeUndefined()
    expect(store.load()).toEqual([])
  })

  it('updates and moves tasks with persistence', () => {
    const { controller, store } = makeController()
    const task = controller.createTask({ title: 'x', description: '', prompt: '' })!
    controller.updateTask(task.id, { title: 'y' })
    controller.moveTask(task.id, 'backlog')
    const persisted = store.load()[0]
    expect(persisted.title).toBe('y')
    expect(persisted.status).toBe('backlog')
  })
})

describe('view state', () => {
  it('toggles the board and reflects it in the snapshot', () => {
    const { controller } = makeController()
    expect(controller.getSnapshot().boardOpen).toBe(false)
    controller.openBoard()
    expect(controller.getSnapshot().boardOpen).toBe(true)
    controller.openBoard() // idempotent
    expect(controller.getSnapshot().boardOpen).toBe(true)
    controller.closeBoard()
    expect(controller.getSnapshot().boardOpen).toBe(false)
    controller.toggleBoard()
    expect(controller.getSnapshot().boardOpen).toBe(true)
  })

  it('closes the board when the user navigates to a session', () => {
    const { controller, sessions } = makeController()
    sessions.setCurrent('s-1')
    controller.openBoard()
    expect(controller.getSnapshot().boardOpen).toBe(true)
    sessions.setCurrent('s-2')
    expect(controller.getSnapshot().boardOpen).toBe(false)
  })

  it('closes the board when a new session is started (selection cleared)', () => {
    const { controller, sessions } = makeController()
    sessions.setCurrent('s-1')
    controller.openBoard()
    sessions.setCurrent(undefined)
    expect(controller.getSnapshot().boardOpen).toBe(false)
  })

  it('stays open on unrelated session-list changes (status updates of the same selection)', () => {
    const { controller, sessions } = makeController()
    sessions.setCurrent('s-1')
    controller.openBoard()
    // A notification with an unchanged selection must not close the board.
    for (const fn of [...(sessions as unknown as { listeners: Set<() => void> }).listeners]) fn()
    expect(controller.getSnapshot().boardOpen).toBe(true)
  })

  it('openTask/closeTask manage the selection', () => {
    const { controller } = makeController()
    const task = controller.createTask({ title: 'x', description: '', prompt: '' })!
    controller.openTask(task.id)
    expect(controller.getSnapshot().selectedTaskId).toBe(task.id)
    controller.closeTask()
    expect(controller.getSnapshot().selectedTaskId).toBeUndefined()
  })

  it('openSession selects the session on the runtime', () => {
    const { controller, sessions } = makeController()
    controller.openSession('exec-session')
    expect(sessions.openCalls).toEqual(['exec-session'])
  })
})

describe('run loop', () => {
  it('runTask triggers the host runner and reflects the settled ledger', async () => {
    const { controller, store, stub } = makeController()
    stub.onRun = hostOpen
    const task = controller.createTask({ title: '任务A', description: '', prompt: '干活' })!
    await controller.runTask(task.id)
    expect(stub.runCalls).toEqual([task.id])
    // The host opened the execution; the board reloaded the ledger.
    expect(controller.getSnapshot().tasks[0].status).toBe('running')
    // The host settles the run; the board poll notices it.
    hostSettle(store, task.id, 'succeeded')
    await sleep(15)
    expect(controller.getSnapshot().tasks[0].status).toBe('done')
    expect(store.load()[0].executions[0].result).toBe('succeeded')
  })

  it('rejects a second run while the task is running', async () => {
    const { controller, store, stub } = makeController()
    stub.onRun = hostOpen
    const task = controller.createTask({ title: '任务A', description: '', prompt: '干活' })!
    await controller.runTask(task.id)
    expect(await controller.runTask(task.id)).toBe(false)
    expect(stub.runCalls).toHaveLength(1)
  })

  it('settles failed tasks into the failed column', async () => {
    const { controller, store, stub } = makeController()
    stub.onRun = hostOpen
    const task = controller.createTask({ title: '任务A', description: '', prompt: '干活' })!
    await controller.runTask(task.id)
    hostSettle(store, task.id, 'failed', 'boom')
    await sleep(15)
    expect(store.load()[0].status).toBe('failed')
    expect(store.load()[0].executions[0].error).toBe('boom')
  })

  it('rerunTask re-plans a settled task to todo before running again', async () => {
    const { controller, store, stub } = makeController()
    stub.onRun = hostOpen
    const task = controller.createTask({ title: '任务A', description: '', prompt: '干活' })!
    await controller.runTask(task.id)
    hostSettle(store, task.id, 'failed', 'boom')
    await sleep(15)
    expect(controller.getSnapshot().tasks[0].status).toBe('failed')
    await controller.rerunTask(task.id)
    expect(controller.getSnapshot().tasks[0].status).toBe('running')
    expect(stub.runCalls).toHaveLength(2)
  })

  it('polls a running task left over from a previous load until the host settles it', async () => {
    const { controller, store } = makeController()
    const task = seedTask(store, { id: 'task-a' })
    hostOpen(store, task.id)
    const reloaded = new BoardController({
      store, exec: new StubRunner(store),
      sessions: new FakeSessions(), now: () => NOW, uuid, pollMs: 2,
    })
    reloaded.start()
    expect(reloaded.getSnapshot().tasks[0].status).toBe('running')
    hostSettle(store, 'task-a', 'cancelled', 'gone')
    await sleep(15)
    expect(reloaded.getSnapshot().tasks[0].status).toBe('todo')
  })

  it('keeps a running task visible while the host has not settled it', async () => {
    const { controller, store, stub } = makeController()
    stub.onRun = hostOpen
    const task = controller.createTask({ title: 'x', description: '', prompt: '' })!
    await controller.runTask(task.id)
    expect(store.load()[0].status).toBe('running')
    // The host is still executing: the board keeps polling without settling.
    await sleep(10)
    expect(controller.getSnapshot().tasks[0].status).toBe('running')
    hostSettle(store, task.id, 'succeeded')
    await sleep(15)
    expect(controller.getSnapshot().tasks[0].status).toBe('done')
  })
})
describe('todos', () => {
  it('addTodo/toggleTodo/deleteTodo round-trip through the snapshot and store', () => {
    const { controller, store } = makeController()
    const todo = controller.addTodo({ title: '上厕所', description: '' })!
    expect(todo.status).toBe('open')
    expect(controller.getSnapshot().todos).toHaveLength(1)
    expect(store.todos()).toHaveLength(1)
    controller.toggleTodo(todo.id)
    expect(controller.getSnapshot().todos[0].status).toBe('done')
    expect(store.todos()[0].status).toBe('done')
    controller.toggleTodo(todo.id)
    expect(controller.getSnapshot().todos[0].status).toBe('open')
    controller.deleteTodo(todo.id)
    expect(controller.getSnapshot().todos).toHaveLength(0)
    expect(store.todos()).toHaveLength(0)
  })

  it('rejects a blank todo title', () => {
    const { controller } = makeController()
    expect(controller.addTodo({ title: '   ', description: '' })).toBeUndefined()
    expect(controller.getSnapshot().todos).toHaveLength(0)
  })

  it('loads persisted todos on start', () => {
    const { controller, store } = makeController()
    store.saveTodos([{ id: 'd-1', title: '已存在', description: '', status: 'open', createdAt: NOW, updatedAt: NOW }])
    const reloaded = new BoardController({
      store, exec: new StubRunner(store),
      sessions: new FakeSessions(), now: () => NOW, uuid,
    })
    reloaded.start()
    expect(reloaded.getSnapshot().todos.map(t => t.id)).toEqual(['d-1'])
  })
})

describe('scheduling', () => {
  it('setSchedule enables a rule and computes the next run instant', () => {
    const { controller, store } = makeController()
    const task = controller.createTask({ title: 'x', description: '', prompt: '' })!
    expect(controller.setSchedule(task.id, { enabled: true, cron: '* * * * *' })).toBe(true)
    const persisted = store.load()[0]
    expect(persisted.schedule?.enabled).toBe(true)
    expect(persisted.schedule?.cron).toBe('* * * * *')
    expect(persisted.schedule?.nextRunAt).toBeDefined()
  })

  it('setSchedule arms a one-shot rule via `at` and keeps the trigger across toggle', () => {
    const { controller, store } = makeController()
    const task = controller.createTask({ title: 'x', description: '', prompt: '' })!
    expect(controller.setSchedule(task.id, { enabled: true, at: NOW + 60_000 })).toBe(true)
    const persisted = store.load()[0]
    expect(persisted.schedule?.recurring).toBe(false)
    expect(persisted.schedule?.cron).toBe('')
    expect(persisted.schedule?.nextRunAt).toBe(NOW + 60_000)
    // Pause keeps the trigger; re-arm restores it.
    controller.setSchedule(task.id, { enabled: false })
    expect(store.load()[0].schedule?.nextRunAt).toBe(NOW + 60_000)
    expect(controller.setSchedule(task.id, { enabled: true })).toBe(true)
    expect(store.load()[0].schedule?.enabled).toBe(true)
    expect(store.load()[0].schedule?.nextRunAt).toBe(NOW + 60_000)
  })

  it('rejects blank or invalid cron expressions without touching state', () => {
    const { controller, store } = makeController()
    const task = controller.createTask({ title: 'x', description: '', prompt: '' })!
    expect(controller.setSchedule(task.id, { enabled: true, cron: 'not a cron' })).toBe(false)
    expect(controller.setSchedule(task.id, { enabled: true, cron: '   ' })).toBe(false)
    expect(controller.setSchedule(task.id, { enabled: true })).toBe(false) // no existing cron → blank → rejected
    expect(store.load()[0].schedule).toBeUndefined()
  })

  it('disabling a rule clears the next run instant but keeps the cron', () => {
    const { controller, store } = makeController()
    const task = controller.createTask({ title: 'x', description: '', prompt: '' })!
    controller.setSchedule(task.id, { enabled: true, cron: '* * * * *' })
    expect(controller.setSchedule(task.id, { enabled: false })).toBe(true)
    const persisted = store.load()[0]
    expect(persisted.schedule?.enabled).toBe(false)
    expect(persisted.schedule?.cron).toBe('* * * * *')
    expect(persisted.schedule?.nextRunAt).toBeUndefined()
  })

  it('recomputes the next run when the cron changes while enabled', () => {
    const { controller, store } = makeController()
    const task = controller.createTask({ title: 'x', description: '', prompt: '' })!
    controller.setSchedule(task.id, { enabled: true, cron: '* * * * *' })
    const first = store.load()[0].schedule?.nextRunAt
    controller.setSchedule(task.id, { cron: '*/5 * * * *' })
    const second = store.load()[0].schedule?.nextRunAt
    expect(second).toBeDefined()
    expect(second).not.toBe(first)
  })
})

/** Store that can simulate a sibling tab writing the ledger. */
class ExternalAwareStore extends InMemoryTaskStore {
  listeners = new Set<() => void>()
  subscribeExternal(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  /** Simulate another tab persisting a new ledger document. */
  writeFromElsewhere(tasks: readonly TaskRecord[]): void {
    this.save(tasks)
    for (const listener of [...this.listeners]) listener()
  }
}

describe('external (cross-tab) ledger changes', () => {
  function makeWithExternalStore() {
    const sessions = new FakeSessions()
    const store = new ExternalAwareStore()
    const controller = new BoardController({
      store,
      exec: new StubRunner(store),
      sessions,
      now: () => NOW,
      uuid,
    })
    controller.start()
    return { controller, sessions, store }
  }

  it('reloads the ledger when a sibling tab deletes a task', () => {
    const { controller, store } = makeWithExternalStore()
    const task = controller.createTask({ title: 'x', description: '', prompt: '' })!
    expect(controller.getSnapshot().tasks.map(t => t.id)).toEqual([task.id])
    // Another tab deletes the task and persists; this tab must drop it too,
    // so its scheduler can never fire (or write back) the deleted task.
    store.writeFromElsewhere([])
    expect(controller.getSnapshot().tasks).toHaveLength(0)
    expect(store.load()).toEqual([])
  })

  it('reloads a task created in a sibling tab', () => {
    const { controller, store } = makeWithExternalStore()
    expect(controller.getSnapshot().tasks).toHaveLength(0)
    const task = createTask({ title: '从别的标签页创建', description: '', prompt: '' }, NOW, 'other-tab')
    store.writeFromElsewhere([task])
    expect(controller.getSnapshot().tasks.map(t => t.id)).toEqual(['other-tab'])
  })


  it('stops reacting to external changes after dispose', () => {
    const { controller, store } = makeWithExternalStore()
    let notified = 0
    controller.subscribe(() => { notified += 1 })
    controller.dispose()
    store.writeFromElsewhere([])
    expect(notified).toBe(0)
  })
})
