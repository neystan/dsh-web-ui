/**
 * Host store tests: file persistence, validation, and task/todo CRUD against
 * a temp-dir store.
 */
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TaskBoardStore } from '../src/host/store.ts'
import { createTask } from '../src/core/tasks.ts'
import { createTodo } from '../src/core/todos.ts'

const NOW = 1_700_000_000_000

function makeStore(): { store: TaskBoardStore; dir: string; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-task-board-store-'))
  const path = join(dir, 'task-board.json')
  return { store: new TaskBoardStore(path), dir, path }
}

describe('TaskBoardStore', () => {
  it('starts empty when the file is absent', () => {
    const { store, dir } = makeStore()
    rmSync(dir, { recursive: true, force: true })
    expect(store.load()).toEqual({ version: 2, tasks: [], todos: [] })
  })

  it('persists tasks and todos atomically (tmp + rename)', () => {
    const { store, path, dir } = makeStore()
    const task = createTask({ title: '任务A', description: '', prompt: '干活' }, NOW, 't-1')
    task.workspacePath = 'C:/work/proj'
    store.putTask(task)
    const todo = createTodo({ title: '待办A', description: '' }, NOW, 'd-1')
    store.putTodo(todo)
    const doc = store.load()
    expect(doc.tasks).toHaveLength(1)
    expect(doc.tasks[0].workspacePath).toBe('C:/work/proj')
    expect(doc.todos).toHaveLength(1)
    // No temp file remains after the atomic write.
    expect(readFileSync(path, 'utf8')).toContain('"tasks"')
    expect(dir).toBeTruthy()
  })

  it('repairs corrupt or partial rows on load', () => {
    const { store, path } = makeStore()
    const good = createTask({ title: 'ok', description: '', prompt: 'p' }, NOW, 't-ok')
    const taskWithBadSchedule = { ...createTask({ title: 'bad-schedule', description: '', prompt: 'p' }, NOW, 't-bad'), schedule: { enabled: true, recurring: true, cron: 'not cron', nextRunAt: undefined, lastTriggeredAt: undefined } }
    const badRow = { id: 't-2' }
    store.save({ version: 2, tasks: [good, taskWithBadSchedule, badRow as never], todos: [] })
    const doc = store.load()
    // Structurally broken rows are dropped; a task with a broken schedule
    // keeps the row and drops the schedule alone (browser-store policy).
    expect(doc.tasks.map(t => t.id)).toEqual(['t-ok', 't-bad'])
    expect(doc.tasks[0].schedule).toBeUndefined()
    expect(doc.tasks[1].schedule).toBeUndefined()
    void path
  })

  it('loads corrupt JSON as an empty document', () => {
    const { store, path } = makeStore()
    const { writeFileSync } = require('node:fs') as typeof import('node:fs')
    writeFileSync(path, 'not json{', 'utf8')
    expect(store.load()).toEqual({ version: 2, tasks: [], todos: [] })
  })

  it('removes tasks and todos by id', () => {
    const { store } = makeStore()
    store.putTask(createTask({ title: 'a', description: '', prompt: '' }, NOW, 't-1'))
    store.putTask(createTask({ title: 'b', description: '', prompt: '' }, NOW, 't-2'))
    store.putTodo(createTodo({ title: 'x', description: '' }, NOW, 'd-1'))
    expect(store.removeTask('t-1')).toBe(true)
    expect(store.removeTask('t-1')).toBe(false)
    expect(store.removeTodo('d-1')).toBe(true)
    expect(store.load().tasks.map(t => t.id)).toEqual(['t-2'])
    expect(store.load().todos).toHaveLength(0)
  })

  it('replaceTasks validates rows (migration path)', () => {
    const { store } = makeStore()
    const good = createTask({ title: 'ok', description: '', prompt: 'p' }, NOW, 't-ok')
    store.replaceTasks([good, { id: 'junk' } as never])
    expect(store.load().tasks.map(t => t.id)).toEqual(['t-ok'])
  })

  it('migrates v1 schedule rows into the v2 discriminated shape', () => {
    const { store, path } = makeStore()
    const { writeFileSync } = require('node:fs') as typeof import('node:fs')
    const v1Recurring = { ...createTask({ title: 'rec', description: '', prompt: 'p' }, NOW, 't-rec'), schedule: { enabled: true, cron: '0 9 * * *', nextRunAt: NOW + 1000, lastTriggeredAt: NOW } }
    const v1Once = { ...createTask({ title: 'once', description: '', prompt: 'p' }, NOW, 't-once'), schedule: { enabled: true, cron: '', onceAt: NOW + 2000, nextRunAt: undefined, lastTriggeredAt: undefined } }
    writeFileSync(path, JSON.stringify({ version: 1, tasks: [v1Recurring, v1Once], todos: [] }), 'utf8')
    const doc = store.load()
    expect(doc.tasks[0].schedule).toEqual({ enabled: true, recurring: true, cron: '0 9 * * *', nextRunAt: NOW + 1000, lastTriggeredAt: NOW })
    expect(doc.tasks[1].schedule).toEqual({ enabled: true, recurring: false, cron: '', nextRunAt: NOW + 2000, lastTriggeredAt: undefined })
    // A v2 fired one-shot (consumed trigger) survives normalization.
    const v2Fired = { ...createTask({ title: 'fired', description: '', prompt: 'p' }, NOW, 't-fired'), schedule: { enabled: true, recurring: false, cron: '', nextRunAt: undefined, lastTriggeredAt: NOW } }
    writeFileSync(path, JSON.stringify({ version: 2, tasks: [v2Fired], todos: [] }), 'utf8')
    expect(store.load().tasks[0].schedule?.recurring).toBe(false)
    expect(store.load().tasks[0].schedule?.nextRunAt).toBeUndefined()
    expect(store.load().tasks[0].schedule?.lastTriggeredAt).toBe(NOW)
  })
})
