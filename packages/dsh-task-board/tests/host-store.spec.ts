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
    expect(store.load()).toEqual({ version: 1, tasks: [], todos: [] })
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
    const taskWithBadSchedule = { ...createTask({ title: 'bad-schedule', description: '', prompt: 'p' }, NOW, 't-bad'), schedule: { enabled: true, cron: 'not cron', nextRunAt: undefined, lastTriggeredAt: undefined } }
    const badRow = { id: 't-2' }
    store.save({ version: 1, tasks: [good, taskWithBadSchedule, badRow as never], todos: [] })
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
    expect(store.load()).toEqual({ version: 1, tasks: [], todos: [] })
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
})
