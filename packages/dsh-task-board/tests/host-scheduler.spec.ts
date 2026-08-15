/**
 * Host scheduler + execution-service tests: due-tick triggering with
 * roll-forward, one-shot keep-until-run semantics, startup rebuild
 * reconciliation, and the open→run→settle orchestration against a stub
 * runner.
 */
import { describe, expect, it } from 'vitest'
import { CronScheduler } from '../src/host/scheduler.ts'
import { applyManualRunPolicy, finishExecution, openExecution } from '../src/host/execution-service.ts'
import { TaskRunner, lastTurnEndReason } from '../src/host/runner.ts'
import { createTask, type TaskRecord } from '../src/core/tasks.ts'
import { nextRunAtMs } from '../src/core/schedule.ts'

const NOW = 1_700_000_000_000

function scheduledTask(id: string, cron: string, nextRunAt: number, enabled = true): TaskRecord {
  const task = createTask({ title: id, description: '', prompt: 'prompt ' + id }, NOW, id)
  return { ...task, schedule: { enabled, recurring: true, cron, nextRunAt, lastTriggeredAt: undefined } }
}

function oneShotTask(id: string, nextRunAt: number | undefined, enabled = true, lastTriggeredAt?: number): TaskRecord {
  const task = createTask({ title: id, description: '', prompt: 'prompt ' + id }, NOW, id)
  return { ...task, schedule: { enabled, recurring: false, cron: '', nextRunAt, lastTriggeredAt } }
}

describe('lastTurnEndReason', () => {
  it('finds the last turn/end reason', () => {
    const events = [
      { type: 'turn/start', data: { turn: 1 } },
      { type: 'turn/end', data: { reason: { kind: 'error' } } },
    ]
    expect(lastTurnEndReason(events)).toBe('error')
  })

  it('returns undefined without a turn/end', () => {
    expect(lastTurnEndReason([{ type: 'user/message', data: {} }])).toBeUndefined()
  })
})

describe('CronScheduler', () => {
  /** Build a fake scheduler env: due batches land in `dispatched`, idle flag switchable. */
  function makeEnv(tasks: TaskRecord[]) {
    const dispatched: TaskRecord[][] = []
    let idle = true
    const applied: Array<{ id: string; next: number | undefined; last: number | undefined }> = []
    const removed: string[] = []
    const scheduler = new CronScheduler({
      tasks: () => tasks,
      now: () => NOW,
      dispatcherIdle: () => idle,
      notifyDispatcher: async due => { dispatched.push([...due]) },
      applyScheduleNextRun: (id, nextRunAt, lastTriggeredAt) => {
        applied.push({ id, next: nextRunAt, last: lastTriggeredAt })
        const task = tasks.find(candidate => candidate.id === id)
        if (task?.schedule !== undefined) task.schedule.nextRunAt = nextRunAt
      },
      removeTask: id => {
        removed.push(id)
        const index = tasks.findIndex(task => task.id === id)
        if (index >= 0) tasks.splice(index, 1)
      },
    }, 60_000)
    return { scheduler, dispatched, applied, removed, setIdle: (v: boolean) => { idle = v } }
  }

  it('dispatches due recurring tasks and rolls the schedule forward from the due instant', () => {
    const due = NOW
    const tasks: TaskRecord[] = [scheduledTask('t-1', '*/5 * * * *', due)]
    const env = makeEnv(tasks)
    env.scheduler.tick()
    expect(env.dispatched).toHaveLength(1)
    expect(env.dispatched[0].map(t => t.id)).toEqual(['t-1'])
    expect(env.applied).toHaveLength(1)
    expect(env.applied[0].last).toBe(due)
    expect(env.applied[0].next).toBe(nextRunAtMs('*/5 * * * *', due))
  })

  it('dispatches a due one-shot task WITHOUT touching its rule (consumed only when the run starts)', () => {
    const tasks: TaskRecord[] = [oneShotTask('t-1', NOW - 1_000)]
    const env = makeEnv(tasks)
    env.scheduler.tick()
    expect(env.dispatched).toHaveLength(1)
    // The rule stays armed with its trigger: a failed dispatch leaves the
    // task due so a later tick re-notifies it — no orphan.
    expect(env.applied).toHaveLength(0)
    expect(tasks[0].schedule?.nextRunAt).toBe(NOW - 1_000)
    expect(tasks[0].schedule?.enabled).toBe(true)
  })

  it('holds the batch while the dispatcher is busy', () => {
    const tasks: TaskRecord[] = [scheduledTask('t-1', '* * * * *', NOW - 1_000)]
    const env = makeEnv(tasks)
    env.setIdle(false)
    env.scheduler.tick()
    expect(env.dispatched).toHaveLength(0)
    expect(env.applied).toHaveLength(0)
  })

  it('skips tasks whose next run is in the future', () => {
    const tasks: TaskRecord[] = [scheduledTask('t-1', '* * * * *', NOW + 120_000)]
    const env = makeEnv(tasks)
    env.scheduler.tick()
    expect(env.dispatched).toHaveLength(0)
  })

  it('skips disabled schedules and tasks without a rule', () => {
    const tasks: TaskRecord[] = [
      scheduledTask('t-1', '* * * * *', NOW, false),
      createTask({ title: 't-2', description: '', prompt: '' }, NOW, 't-2'),
    ]
    const env = makeEnv(tasks)
    env.scheduler.tick()
    expect(env.dispatched).toHaveLength(0)
  })

  it('start reconciles deadlines: recurring rules roll past fires missed while down', () => {
    // t-1 was due while the host was down; the rebuild recomputes the next
    // match from NOW (missed fires are skipped, never dispatched late).
    const tasks: TaskRecord[] = [scheduledTask('t-1', '* * * * *', NOW - 3 * 60_000)]
    const env = makeEnv(tasks)
    env.scheduler.start()
    expect(env.dispatched).toHaveLength(0)
    expect(env.applied).toEqual([{ id: 't-1', next: nextRunAtMs('* * * * *', NOW), last: undefined }])
    env.scheduler.dispose()
  })

  it('start reconciliation drops an expired one-shot (never fired late)', () => {
    const tasks: TaskRecord[] = [oneShotTask('t-1', NOW - 60_000)]
    const env = makeEnv(tasks)
    env.scheduler.start()
    expect(env.removed).toEqual(['t-1'])
    expect(env.dispatched).toHaveLength(0)
    env.scheduler.dispose()
  })

  it('start reconciliation keeps a future one-shot and a fired (consumed) one-shot', () => {
    const tasks: TaskRecord[] = [
      oneShotTask('t-future', NOW + 60_000),
      oneShotTask('t-fired', undefined, true, NOW - 10_000),
    ]
    const env = makeEnv(tasks)
    env.scheduler.start()
    expect(env.removed).toEqual([])
    expect(env.dispatched).toHaveLength(0)
    env.scheduler.dispose()
  })

  it('start reconciliation rolls a rule due exactly now without dispatching it', () => {
    // The rebuild recomputes strictly-future matches (reference behavior):
    // a fire due at the activation instant counts as missed and is skipped.
    const tasks: TaskRecord[] = [scheduledTask('t-1', '* * * * *', NOW)]
    const env = makeEnv(tasks)
    env.scheduler.start()
    expect(env.dispatched).toHaveLength(0)
    expect(env.applied).toEqual([{ id: 't-1', next: nextRunAtMs('* * * * *', NOW), last: undefined }])
    env.scheduler.dispose()
  })

  it('dispose stops ticking', () => {
    const env = makeEnv([])
    env.scheduler.start()
    env.scheduler.dispose()
    expect(env.scheduler['disposed']).toBe(true)
  })
})

describe('execution orchestration', () => {
  class FakeStore {
    ledger: TaskRecord[] = []
    putTask(task: TaskRecord): void {
      const index = this.ledger.findIndex(t => t.id === task.id)
      if (index >= 0) this.ledger[index] = task
      else this.ledger.push(task)
    }
    tasks(): TaskRecord[] { return this.ledger }
    replaceTasks(tasks: readonly TaskRecord[]): void {
      this.ledger = tasks.map(t => ({ ...t }))
    }
  }

  const stubRunner = (outcome: { result: 'succeeded' | 'failed' | 'cancelled'; error?: string }) =>
    ({ run: async (_task: TaskRecord) => ({ ok: outcome.result === 'succeeded', sessionId: 's-1', result: outcome.result, error: outcome.error }) }) as unknown as TaskRunner

  it('openExecution rejects a running task', () => {
    const store = new FakeStore()
    const task = createTask({ title: 'a', description: '', prompt: '' }, NOW, 't-1')
    const opened = openExecution(store as never, task, NOW)
    expect(opened?.status).toBe('running')
    expect(openExecution(store as never, opened!, NOW)).toBeUndefined()
  })

  it('openExecution consumes an armed one-shot deadline (the run has started)', () => {
    const store = new FakeStore()
    const task = oneShotTask('t-1', NOW + 60_000)
    store.putTask(task)
    openExecution(store as never, task, NOW)
    const after = store.tasks()[0]
    expect(after.schedule?.recurring).toBe(false)
    expect(after.schedule?.enabled).toBe(true)
    expect(after.schedule?.nextRunAt).toBeUndefined()
    expect(after.schedule?.lastTriggeredAt).toBe(NOW)
  })

  it('openExecution leaves a recurring deadline untouched', () => {
    const store = new FakeStore()
    const task = scheduledTask('t-1', '* * * * *', NOW + 60_000)
    store.putTask(task)
    openExecution(store as never, task, NOW)
    expect(store.tasks()[0].schedule?.nextRunAt).toBe(NOW + 60_000)
    expect(store.tasks()[0].schedule?.lastTriggeredAt).toBeUndefined()
  })

  it('openExecution consuming a one-shot keeps every other task in the ledger', () => {
    const store = new FakeStore()
    const once = oneShotTask('t-once', NOW + 60_000)
    const recurring = scheduledTask('t-rec', '* * * * *', NOW + 60_000)
    store.putTask(recurring)
    store.putTask(once)
    openExecution(store as never, once, NOW)
    const ids = store.tasks().map(task => task.id).sort()
    expect(ids).toEqual(['t-once', 't-rec'])
    expect(store.tasks().find(task => task.id === 't-once')?.schedule?.nextRunAt).toBeUndefined()
    expect(store.tasks().find(task => task.id === 't-rec')?.schedule?.nextRunAt).toBe(NOW + 60_000)
  })

  it('finishExecution settles the freshest record', async () => {
    const store = new FakeStore()
    const task = createTask({ title: 'a', description: '', prompt: 'work' }, NOW, 't-1')
    const opened = openExecution(store as never, task, NOW)!
    const outcome = await finishExecution(store as never, stubRunner({ result: 'succeeded' }), opened)
    expect(outcome.run.result).toBe('succeeded')
    expect(store.tasks()[0].status).toBe('done')
  })

  it('finishExecution backfills the session id', async () => {
    const store = new FakeStore()
    const task = createTask({ title: 'a', description: '', prompt: 'work' }, NOW, 't-1')
    const opened = openExecution(store as never, task, NOW)!
    await finishExecution(store as never, stubRunner({ result: 'succeeded' }), opened)
    expect(store.tasks()[0].executions[0].sessionId).toBe('s-1')
  })
})

describe('manual run policy', () => {
  class FakeStore {
    ledger: TaskRecord[] = []
    putTask(task: TaskRecord): void {
      const index = this.ledger.findIndex(t => t.id === task.id)
      if (index >= 0) this.ledger[index] = task
      else this.ledger.push(task)
    }
    tasks(): TaskRecord[] { return this.ledger }
    removeTask(id: string): boolean {
      const next = this.ledger.filter(t => t.id !== id)
      if (next.length === this.ledger.length) return false
      this.ledger = next
      return true
    }
    replaceTasks(tasks: readonly TaskRecord[]): void {
      this.ledger = tasks.map(t => ({ ...t }))
    }
  }

  it('removes an armed one-shot task once its run settles (manual or scheduled)', async () => {
    for (const scheduled of [false, true]) {
      const store = new FakeStore()
      store.putTask(oneShotTask('t-1', NOW + 60_000))
      await applyManualRunPolicy(store as never, 't-1', { scheduled })
      expect(store.tasks()).toHaveLength(0)
    }
  })

  it('keeps an unscheduled task after a manual run (a plain Run must never delete the card)', async () => {
    const store = new FakeStore()
    store.putTask(createTask({ title: 'plain', description: '', prompt: 'p' }, NOW, 't-1'))
    await applyManualRunPolicy(store as never, 't-1')
    expect(store.tasks()).toHaveLength(1)
    expect(store.tasks()[0].schedule).toBeUndefined()
  })

  it('keeps a disabled-schedule task after a manual run (only armed one-shots are removed)', async () => {
    const store = new FakeStore()
    store.putTask(scheduledTask('t-1', '* * * * *', NOW, false))
    await applyManualRunPolicy(store as never, 't-1')
    expect(store.tasks()).toHaveLength(1)
    expect(store.tasks()[0].schedule?.enabled).toBe(false)
  })

  it('rolls a recurring task forward from now after a manual run', async () => {
    const store = new FakeStore()
    const task = scheduledTask('t-1', '*/5 * * * *', NOW - 60_000)
    store.putTask(task)
    const before = task.schedule!.nextRunAt
    await applyManualRunPolicy(store as never, 't-1')
    const after = store.tasks()[0]
    expect(after.status).toBe('todo')
    expect(after.schedule?.enabled).toBe(true)
    // The schedule rolls forward from NOW (the real clock), never backward.
    expect(after.schedule?.nextRunAt).not.toBe(before)
    expect(after.schedule?.nextRunAt).toBeGreaterThan(Date.now())
    expect(after.schedule?.lastTriggeredAt).toBeGreaterThanOrEqual(Date.now() - 2_000)
  })

  it('a manual run of one task never erases the other tasks in the ledger', async () => {
    // Regression: the roll-forward used to rebuild the host ledger from a
    // single-row array (replaceTasks), wiping every sibling task.
    const store = new FakeStore()
    const recurring = scheduledTask('t-rec', '*/2 * * * *', NOW + 120_000)
    const once = oneShotTask('t-once', NOW + 300_000)
    store.putTask(recurring)
    store.putTask(once)
    await applyManualRunPolicy(store as never, 't-rec')
    const ids = store.tasks().map(task => task.id).sort()
    expect(ids).toEqual(['t-once', 't-rec'])
    expect(store.tasks().find(task => task.id === 't-rec')?.schedule?.nextRunAt).toBeGreaterThan(Date.now())
    expect(store.tasks().find(task => task.id === 't-once')?.schedule?.nextRunAt).toBe(NOW + 300_000)
  })

  it('leaves a recurring task untouched after a scheduled (dispatcher) run', async () => {
    const store = new FakeStore()
    const task = scheduledTask('t-1', '*/5 * * * *', NOW - 60_000)
    store.putTask(task)
    await applyManualRunPolicy(store as never, 't-1', { scheduled: true })
    const after = store.tasks()[0]
    expect(after.schedule?.nextRunAt).toBe(NOW - 60_000)
    expect(after.schedule?.lastTriggeredAt).toBeUndefined()
  })

  it('leaves a running task untouched', async () => {
    const store = new FakeStore()
    const task = createTask({ title: 'x', description: '', prompt: 'p' }, NOW, 't-1')
    const running = { ...task, status: 'running' as const }
    store.putTask(running)
    await applyManualRunPolicy(store as never, 't-1')
    expect(store.tasks()).toHaveLength(1)
  })
})
