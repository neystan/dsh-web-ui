/**
 * Host tool tests: cron_* and todo_* agent tools against an in-memory store
 * and a stub runner.
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeTools } from '../src/host/tools.ts'
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

describe('cron tools', () => {
  it('cron_create creates an enabled scheduled task', async () => {
    const { store, byName, dir } = makeToolsForTest()
    const result = await exec<{ taskId: string; title: string; cron: string }>(
      byName.get('cron_create')! as never,
      { name: '周报', cron: '0 9 * * 1', prompt: '生成周报', workspacePath: 'C:/work' },
    )
    expect(result.title).toBe('周报')
    const task = store.load().tasks.find(t => t.id === result.taskId)
    expect(task?.schedule?.enabled).toBe(true)
    expect(task?.schedule?.cron).toBe('0 9 * * 1')
    expect(task?.workspacePath).toBe('C:/work')
    expect(task?.schedule?.nextRunAt).toBeDefined()
    rmSync(dir, { recursive: true, force: true })
  })

  it('cron_create rejects an invalid cron', async () => {
    const { byName, dir } = makeToolsForTest()
    await expect(exec(byName.get('cron_create')! as never, { name: 'x', cron: 'nope', prompt: 'p' }))
      .rejects.toThrow(/invalid cron/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('cron_list renders the ledger', async () => {
    const { byName, dir } = makeToolsForTest()
    await exec(byName.get('cron_create')! as never, { name: '任务', cron: '* * * * *', prompt: 'p' })
    const result = await exec<{ tasks: unknown[] }>(byName.get('cron_list')! as never, {})
    expect(result.tasks).toHaveLength(1)
    const row = result.tasks[0] as Record<string, unknown>
    expect(row.title).toBe('任务')
    expect(row.enabled).toBe(true)
    expect(typeof row.nextRunAt).toBe('number')
    rmSync(dir, { recursive: true, force: true })
  })

  it('cron_pause/resume toggle the schedule', async () => {
    const { store, byName, dir } = makeToolsForTest()
    const created = await exec<{ taskId: string }>(byName.get('cron_create')! as never, { name: 'x', cron: '* * * * *', prompt: 'p' })
    await exec(byName.get('cron_pause')! as never, { id: created.taskId })
    expect(store.load().tasks[0].schedule?.enabled).toBe(false)
    const resumed = await exec<{ ok: boolean }>(byName.get('cron_resume')! as never, { id: created.taskId })
    expect(resumed.ok).toBe(true)
    expect(store.load().tasks[0].schedule?.enabled).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('cron_delete removes the task', async () => {
    const { store, byName, dir } = makeToolsForTest()
    const created = await exec<{ taskId: string }>(byName.get('cron_create')! as never, { name: 'x', cron: '* * * * *', prompt: 'p' })
    await exec(byName.get('cron_delete')! as never, { id: created.taskId })
    expect(store.load().tasks).toHaveLength(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('cron_run opens an execution on the host', async () => {
    const { store, byName, dir } = makeToolsForTest()
    const created = await exec<{ taskId: string }>(byName.get('cron_create')! as never, { name: 'x', cron: '* * * * *', prompt: 'p' })
    const run = await exec<{ ok: boolean }>(byName.get('cron_run')! as never, { id: created.taskId })
    expect(run.ok).toBe(true)
    // The host opened an execution; with the stub runner the run settles
    // immediately (done), while a real runner would leave it running.
    const task = store.load().tasks[0]
    expect(task.executions).toHaveLength(1)
    expect(task.executions[0].startedAt).toBeDefined()
    expect(task.status).toBe('done')
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('todo tools', () => {
  it('todo_add/list/done/delete round-trip', async () => {
    const { store, byName, dir } = makeToolsForTest()
    const added = await exec<{ todoId: string }>(byName.get('todo_add')! as never, { title: '买牛奶', description: '楼下便利店' })
    expect(store.load().todos[0].description).toBe('楼下便利店')
    const listed = await exec<{ todos: Array<{ id: string; title: string; status: string }> }>(byName.get('todo_list')! as never, {})
    expect(listed.todos).toEqual([{ id: added.todoId, title: '买牛奶', status: 'open', createdAt: NOW }])
    await exec(byName.get('todo_done')! as never, { id: added.todoId })
    expect(store.load().todos[0].status).toBe('done')
    await exec(byName.get('todo_delete')! as never, { id: added.todoId })
    expect(store.load().todos).toHaveLength(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('todo_done on an unknown id fails gracefully', async () => {
    const { byName, dir } = makeToolsForTest()
    const result = await exec<{ ok: boolean; error?: string }>(byName.get('todo_done')! as never, { id: 'missing' })
    expect(result.ok).toBe(false)
    expect(result.error).toContain('not found')
    rmSync(dir, { recursive: true, force: true })
  })
})
