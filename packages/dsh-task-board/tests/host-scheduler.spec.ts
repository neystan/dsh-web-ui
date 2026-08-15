/**
 * Host scheduler + execution-service tests: due-tick triggering with
 * roll-forward, running-task skipping, catch-up, and the open→run→settle
 * orchestration against a stub runner.
 */
import { describe, expect, it } from 'vitest'
import { CronScheduler } from '../src/host/scheduler.ts'
import { executeTask, finishExecution, openExecution } from '../src/host/execution-service.ts'
import { TaskRunner, lastTurnEndReason } from '../src/host/runner.ts'
import { createTask, type TaskRecord } from '../src/core/tasks.ts'
import { nextRunAtMs } from '../src/core/schedule.ts'

const NOW = 1_700_000_000_000

function scheduledTask(id: string, cron: string, nextRunAt: number, enabled = true): TaskRecord {
  const task = createTask({ title: id, description: '', prompt: 'prompt ' + id }, NOW, id)
  return { ...task, schedule: { enabled, cron, nextRunAt, lastTriggeredAt: undefined } }
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
  it('triggers due tasks and rolls the schedule forward from the due instant', () => {
    const due = NOW
    const tasks: TaskRecord[] = [scheduledTask('t-1', '*/5 * * * *', due)]
    const runCalls: string[] = []
    const applied: Array<{ id: string; next: number | undefined; last: number | undefined }> = []
    const scheduler = new CronScheduler({
      tasks: () => tasks,
      now: () => NOW + 60_000,
      runTask: async id => { runCalls.push(id); return true },
      applyScheduleNextRun: (id, nextRunAt, lastTriggeredAt) => {
        applied.push({ id, next: nextRunAt, last: lastTriggeredAt })
        const task = tasks.find(candidate => candidate.id === id)
        if (task?.schedule !== undefined) task.schedule.nextRunAt = nextRunAt
      },
    }, 60_000)
    scheduler.tick()
    expect(runCalls).toEqual(['t-1'])
    expect(applied).toHaveLength(1)
    expect(applied[0].last).toBe(due)
    expect(applied[0].next).toBe(nextRunAtMs('*/5 * * * *', due))
  })

  it('skips tasks whose next run is in the future', () => {
    const tasks: TaskRecord[] = [scheduledTask('t-1', '* * * * *', NOW + 120_000)]
    const runCalls: string[] = []
    const scheduler = new CronScheduler({
      tasks: () => tasks,
      now: () => NOW,
      runTask: async id => { runCalls.push(id); return true },
      applyScheduleNextRun: () => {},
    })
    scheduler.tick()
    expect(runCalls).toEqual([])
  })

  it('skips disabled schedules and tasks without a rule', () => {
    const tasks: TaskRecord[] = [
      scheduledTask('t-1', '* * * * *', NOW, false),
      createTask({ title: 't-2', description: '', prompt: '' }, NOW, 't-2'),
    ]
    const runCalls: string[] = []
    const scheduler = new CronScheduler({
      tasks: () => tasks,
      now: () => NOW + 10_000,
      runTask: async id => { runCalls.push(id); return true },
      applyScheduleNextRun: () => {},
    })
    scheduler.tick()
    expect(runCalls).toEqual([])
  })

  it('starts with a catch-up tick', () => {
    const tasks: TaskRecord[] = [scheduledTask('t-1', '* * * * *', NOW - 1_000)]
    const runCalls: string[] = []
    const scheduler = new CronScheduler({
      tasks: () => tasks,
      now: () => NOW,
      runTask: async id => { runCalls.push(id); return true },
      applyScheduleNextRun: () => {},
    })
    scheduler.start()
    expect(runCalls).toEqual(['t-1'])
    scheduler.dispose()
  })

  it('dispose stops ticking', () => {
    const tasks: TaskRecord[] = []
    const scheduler = new CronScheduler({
      tasks: () => tasks,
      now: () => NOW,
      runTask: async () => true,
      applyScheduleNextRun: () => {},
    }, 5)
    scheduler.start()
    scheduler.dispose()
    expect(scheduler['disposed']).toBe(true)
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

  it('executeTask opens, runs, and settles', async () => {
    const store = new FakeStore()
    const task = createTask({ title: 'a', description: '', prompt: 'work' }, NOW, 't-1')
    const outcome = await executeTask(store as never, stubRunner({ result: 'failed', error: 'boom' }), task)
    expect(outcome.run.result).toBe('failed')
    const settled = store.tasks()[0]
    expect(settled.status).toBe('failed')
    expect(settled.executions[0].result).toBe('failed')
    expect(settled.executions[0].error).toBe('boom')
  })

  it('finishExecution settles the freshest record', async () => {
    const store = new FakeStore()
    const task = createTask({ title: 'a', description: '', prompt: 'work' }, NOW, 't-1')
    const opened = openExecution(store as never, task, NOW)!
    const outcome = await finishExecution(store as never, stubRunner({ result: 'succeeded' }), opened)
    expect(outcome.run.result).toBe('succeeded')
    expect(store.tasks()[0].status).toBe('done')
  })
})
