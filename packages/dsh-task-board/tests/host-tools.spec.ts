/**
 * Host tool tests: the single `cron` tool and the single `todo` tool
 * (action dispatch) against an in-memory store and a stub runner.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeTools, parseDelaySeconds, parseNextRunAt } from '../src/host/tools.ts'
import { TaskBoardStore } from '../src/host/store.ts'
import type { TaskRunner } from '../src/host/runner.ts'

const NOW = 1_700_000_000_000

function makeToolsForTest() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-task-board-tools-'))
  const store = new TaskBoardStore(join(dir, 'task-board.json'))
  const runner = { run: async () => ({ ok: true, sessionId: 's-1', result: 'succeeded' as const }) } as unknown as TaskRunner
  const tools = makeTools({ store, runner, now: () => NOW })
  const byName = new Map(tools.map(tool => [tool.name, tool]))
  return { store, byName, dir }
}

async function exec<T>(tool: { execute(args: unknown): Promise<T> }, args: unknown): Promise<T> {
  return tool.execute(args)
}

describe('parseNextRunAt', () => {
  it('accepts ISO instants with an explicit UTC offset, strictly in the future', () => {
    expect(parseNextRunAt('2026-08-16T09:00:00+08:00', NOW)).toBe(Date.parse('2026-08-16T09:00:00+08:00'))
    expect(parseNextRunAt('2026-08-16T01:00:00Z', NOW)).toBe(Date.parse('2026-08-16T01:00:00Z'))
  })

  it('rejects offset-less, past, and unparseable instants', () => {
    expect(parseNextRunAt('2026-08-16T09:00:00', NOW)).toBeUndefined() // no offset
    expect(parseNextRunAt('2020-01-01T00:00:00Z', NOW)).toBeUndefined() // past
    expect(parseNextRunAt('not a time', NOW)).toBeUndefined()
    expect(parseNextRunAt(undefined, NOW)).toBeUndefined()
  })
})

describe('parseDelaySeconds', () => {
  it('converts a positive delay into an instant', () => {
    expect(parseDelaySeconds(30, NOW)).toBe(NOW + 30_000)
    expect(parseDelaySeconds(0.5, NOW)).toBe(NOW + 500)
  })

  it('rejects non-positive or non-numeric delays', () => {
    expect(parseDelaySeconds(0, NOW)).toBeUndefined()
    expect(parseDelaySeconds(-5, NOW)).toBeUndefined()
    expect(parseDelaySeconds('30', NOW)).toBeUndefined()
    expect(parseDelaySeconds(undefined, NOW)).toBeUndefined()
  })
})

describe('cron tool', () => {
  it('create: recurring cron task', async () => {
    const { store, byName, dir } = makeToolsForTest()
    const result = await exec<{ taskId: string; title: string; recurring: boolean; cron: string }>(
      byName.get('cron')! as never,
      { action: 'create', name: '周报', recurring: true, cron: '0 9 * * 1', prompt: '生成周报', workspacePath: 'C:/work' },
    )
    expect(result.title).toBe('周报')
    expect(result.recurring).toBe(true)
    const task = store.load().tasks.find(t => t.id === result.taskId)
    expect(task?.schedule?.enabled).toBe(true)
    expect(task?.schedule?.recurring).toBe(true)
    expect(task?.schedule?.cron).toBe('0 9 * * 1')
    expect(task?.workspacePath).toBe('C:/work')
    expect(task?.schedule?.nextRunAt).toBeDefined()
    rmSync(dir, { recursive: true, force: true })
  })

  it('create: rejects an invalid cron and missing name/prompt', async () => {
    const { byName, dir } = makeToolsForTest()
    await expect(exec(byName.get('cron')! as never, { action: 'create', name: 'x', recurring: true, cron: 'nope', prompt: 'p' }))
      .rejects.toThrow(/invalid cron/)
    await expect(exec(byName.get('cron')! as never, { action: 'create', recurring: true, cron: '* * * * *', prompt: 'p' }))
      .rejects.toThrow(/name is required/)
    await expect(exec(byName.get('cron')! as never, { action: 'create', name: 'x', recurring: true, cron: '* * * * *' }))
      .rejects.toThrow(/prompt is required/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('create: rejects recurring + nextRunAt/delaySeconds together', async () => {
    const { byName, dir } = makeToolsForTest()
    await expect(exec(byName.get('cron')! as never, { action: 'create', name: 'x', recurring: true, cron: '* * * * *', nextRunAt: '2026-08-16T09:00:00Z', prompt: 'p' }))
      .rejects.toThrow(/cannot set nextRunAt/)
    await expect(exec(byName.get('cron')! as never, { action: 'create', name: 'x', recurring: true, cron: '* * * * *', delaySeconds: 60, prompt: 'p' }))
      .rejects.toThrow(/cannot set nextRunAt or delaySeconds/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('create: one-shot via nextRunAt (ISO with UTC offset)', async () => {
    const { store, byName, dir } = makeToolsForTest()
    const result = await exec<{ taskId: string; recurring: boolean; nextRunAt: number }>(
      byName.get('cron')! as never,
      { action: 'create', name: '一次性', recurring: false, nextRunAt: '2026-08-16T09:00:00+08:00', prompt: '跑一次' },
    )
    const task = store.load().tasks.find(t => t.id === result.taskId)
    expect(task?.schedule?.recurring).toBe(false)
    expect(task?.schedule?.enabled).toBe(true)
    expect(task?.schedule?.cron).toBe('')
    expect(task?.schedule?.nextRunAt).toBe(Date.parse('2026-08-16T09:00:00+08:00'))
    rmSync(dir, { recursive: true, force: true })
  })

  it('create: one-shot via delaySeconds (relative delay, no ISO needed)', async () => {
    const { store, byName, dir } = makeToolsForTest()
    const result = await exec<{ taskId: string; nextRunAt: number }>(
      byName.get('cron')! as never,
      { action: 'create', name: '稍后', recurring: false, delaySeconds: 30, prompt: '跑一次' },
    )
    expect(result.nextRunAt).toBe(NOW + 30_000)
    expect(store.load().tasks[0].schedule?.nextRunAt).toBe(NOW + 30_000)
    rmSync(dir, { recursive: true, force: true })
  })

  it('create: rejects a one-shot without a trigger, with a past/offset-less time, or with cron', async () => {
    const { byName, dir } = makeToolsForTest()
    await expect(exec(byName.get('cron')! as never, { action: 'create', name: 'x', recurring: false, prompt: 'p' }))
      .rejects.toThrow(/require nextRunAt or delaySeconds/)
    await expect(exec(byName.get('cron')! as never, { action: 'create', name: 'x', recurring: false, nextRunAt: '2020-01-01T00:00:00Z', prompt: 'p' }))
      .rejects.toThrow(/invalid nextRunAt/)
    await expect(exec(byName.get('cron')! as never, { action: 'create', name: 'x', recurring: false, nextRunAt: '2026-08-16T09:00:00', prompt: 'p' }))
      .rejects.toThrow(/invalid nextRunAt/)
    await expect(exec(byName.get('cron')! as never, { action: 'create', name: 'x', recurring: false, cron: '* * * * *', delaySeconds: 60, prompt: 'p' }))
      .rejects.toThrow(/cannot set cron/)
    await expect(exec(byName.get('cron')! as never, { action: 'create', name: 'x', recurring: false, nextRunAt: '2026-08-16T09:00:00Z', delaySeconds: 60, prompt: 'p' }))
      .rejects.toThrow(/mutually exclusive/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('list: renders recurring and one-shot rows', async () => {
    const { byName, dir } = makeToolsForTest()
    await exec(byName.get('cron')! as never, { action: 'create', name: '周期', recurring: true, cron: '* * * * *', prompt: 'p' })
    await exec(byName.get('cron')! as never, { action: 'create', name: '一次性', recurring: false, delaySeconds: 3600, prompt: 'p' })
    const result = await exec<{ tasks: Array<{ title: string; recurring?: boolean; cron?: string; nextRunAt?: number; enabled?: boolean }> }>(
      byName.get('cron')! as never,
      { action: 'list' },
    )
    expect(result.tasks).toHaveLength(2)
    const recurring = result.tasks.find(row => row.title === '周期')!
    expect(recurring.recurring).toBe(true)
    expect(recurring.cron).toBe('* * * * *')
    const once = result.tasks.find(row => row.title === '一次性')!
    expect(once.recurring).toBe(false)
    expect(once.cron).toBeUndefined()
    expect(once.nextRunAt).toBe(NOW + 3_600_000)
    rmSync(dir, { recursive: true, force: true })
  })

  it('pause/resume toggle a recurring schedule and recompute the next run', async () => {
    const { store, byName, dir } = makeToolsForTest()
    const created = await exec<{ taskId: string }>(byName.get('cron')! as never, { action: 'create', name: 'x', recurring: true, cron: '* * * * *', prompt: 'p' })
    await exec(byName.get('cron')! as never, { action: 'pause', id: created.taskId })
    const paused = store.load().tasks[0]
    expect(paused.schedule?.enabled).toBe(false)
    expect(paused.schedule?.nextRunAt).toBeUndefined()
    const resumed = await exec<{ ok: boolean; nextRunAt?: number }>(byName.get('cron')! as never, { action: 'resume', id: created.taskId })
    expect(resumed.ok).toBe(true)
    expect(resumed.nextRunAt).toBeDefined()
    expect(store.load().tasks[0].schedule?.enabled).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('pause/resume keep a one-shot trigger across the toggle', async () => {
    const { store, byName, dir } = makeToolsForTest()
    const created = await exec<{ taskId: string }>(byName.get('cron')! as never, { action: 'create', name: 'x', recurring: false, delaySeconds: 3600, prompt: 'p' })
    await exec(byName.get('cron')! as never, { action: 'pause', id: created.taskId })
    expect(store.load().tasks[0].schedule?.nextRunAt).toBe(NOW + 3_600_000) // trigger kept
    const resumed = await exec<{ ok: boolean; nextRunAt?: number }>(byName.get('cron')! as never, { action: 'resume', id: created.taskId })
    expect(resumed.ok).toBe(true)
    expect(resumed.nextRunAt).toBe(NOW + 3_600_000)
    expect(store.load().tasks[0].schedule?.enabled).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('resume of a fired one-shot fails with a clear message', async () => {
    const { store, byName, dir } = makeToolsForTest()
    const created = await exec<{ taskId: string }>(byName.get('cron')! as never, { action: 'create', name: 'x', recurring: false, delaySeconds: 3600, prompt: 'p' })
    // Simulate the run having started: consume the trigger in the store.
    const task = store.load().tasks[0]
    store.putTask({ ...task, schedule: { ...task.schedule!, nextRunAt: undefined, lastTriggeredAt: NOW } })
    const resumed = await exec<{ ok: boolean; error?: string }>(byName.get('cron')! as never, { action: 'resume', id: created.taskId })
    expect(resumed.ok).toBe(false)
    expect(resumed.error).toContain('already fired')
    rmSync(dir, { recursive: true, force: true })
  })

  it('delete removes the task', async () => {
    const { store, byName, dir } = makeToolsForTest()
    const created = await exec<{ taskId: string }>(byName.get('cron')! as never, { action: 'create', name: 'x', recurring: true, cron: '* * * * *', prompt: 'p' })
    await exec(byName.get('cron')! as never, { action: 'delete', id: created.taskId })
    expect(store.load().tasks).toHaveLength(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('run opens an execution; a one-shot is consumed and then removed once settled', async () => {
    const { store, byName, dir } = makeToolsForTest()
    const created = await exec<{ taskId: string }>(byName.get('cron')! as never, { action: 'create', name: '一次性', recurring: false, delaySeconds: 3600, prompt: 'p' })
    const run = await exec<{ ok: boolean }>(byName.get('cron')! as never, { action: 'run', id: created.taskId })
    expect(run.ok).toBe(true)
    // The stub runner settles immediately; the one-shot has served its
    // purpose → the task is removed.
    expect(store.load().tasks).toHaveLength(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('run on a recurring task settles it and keeps the task', async () => {
    const { store, byName, dir } = makeToolsForTest()
    const created = await exec<{ taskId: string }>(byName.get('cron')! as never, { action: 'create', name: '周期', recurring: true, cron: '* * * * *', prompt: 'p' })
    const run = await exec<{ ok: boolean }>(byName.get('cron')! as never, { action: 'run', id: created.taskId })
    expect(run.ok).toBe(true)
    const task = store.load().tasks[0]
    expect(task.executions).toHaveLength(1)
    expect(task.executions[0].startedAt).toBeDefined()
    expect(task.status).toBe('done')
    rmSync(dir, { recursive: true, force: true })
  })

  it('unknown actions and unknown ids fail gracefully', async () => {
    const { byName, dir } = makeToolsForTest()
    // The action enum is enforced at the schema layer, before execute runs.
    await expect(exec(byName.get('cron')! as never, { action: 'nope' }))
      .rejects.toThrow(/must be one of/)
    const run = await exec<{ ok: boolean; error?: string }>(byName.get('cron')! as never, { action: 'run', id: 'missing' })
    expect(run.ok).toBe(false)
    expect(run.error).toContain('not found')
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('todo tool', () => {
  it('add/list/done/delete round-trip through the action field', async () => {
    const { store, byName, dir } = makeToolsForTest()
    const added = await exec<{ todoId: string }>(byName.get('todo')! as never, { action: 'add', title: '买牛奶', description: '楼下便利店' })
    expect(store.load().todos[0].description).toBe('楼下便利店')
    const listed = await exec<{ todos: Array<{ id: string; title: string; status: string }> }>(byName.get('todo')! as never, { action: 'list' })
    expect(listed.todos).toEqual([{ id: added.todoId, title: '买牛奶', status: 'open', createdAt: NOW }])
    const done = await exec<{ ok: boolean }>(byName.get('todo')! as never, { action: 'done', id: added.todoId })
    expect(done.ok).toBe(true)
    expect(store.load().todos[0].status).toBe('done')
    const deleted = await exec<{ ok: boolean }>(byName.get('todo')! as never, { action: 'delete', id: added.todoId })
    expect(deleted.ok).toBe(true)
    expect(store.load().todos).toHaveLength(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('add requires a title; done/delete on unknown or missing ids fail gracefully', async () => {
    const { byName, dir } = makeToolsForTest()
    await expect(exec(byName.get('todo')! as never, { action: 'add', title: '   ' }))
      .rejects.toThrow(/title is required/)
    const done = await exec<{ ok: boolean; error?: string }>(byName.get('todo')! as never, { action: 'done', id: 'missing' })
    expect(done.ok).toBe(false)
    expect(done.error).toContain('not found')
    const noId = await exec<{ ok: boolean; error?: string }>(byName.get('todo')! as never, { action: 'delete' })
    expect(noId.ok).toBe(false)
    expect(noId.error).toContain('id is required')
    rmSync(dir, { recursive: true, force: true })
  })

  it('unknown todo actions are rejected at the schema layer', async () => {
    const { byName, dir } = makeToolsForTest()
    await expect(exec(byName.get('todo')! as never, { action: 'nope' }))
      .rejects.toThrow(/must be one of/)
    rmSync(dir, { recursive: true, force: true })
  })
})
