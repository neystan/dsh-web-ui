/**
 * ApiTaskStore tests: the host-backed board store. The critical contract is
 * that board mutations are TARGETED writes: a stale snapshot save must never
 * erase tasks the board does not know about, and must never overwrite newer
 * host state (a running/settled execution) that other writers (agent tools,
 * the host scheduler, sibling tabs) produced for the same task.
 */
import { describe, expect, it, vi } from 'vitest'
import { ApiTaskStore, TaskBoardApi } from '../src/client/api.ts'
import { createTask, type TaskRecord } from '../src/core/tasks.ts'
import { createTodo, type TodoRecord } from '../src/core/todos.ts'
import type { TaskUpdatePatch } from '../src/core/store.ts'

const NOW = 1_700_000_000_000

function task(id: string, title = id): TaskRecord {
  return createTask({ title, description: '', prompt: 'p' }, NOW, id)
}

/** A stub host: an in-memory ledger behind the TaskBoardApi surface. */
class FakeApi {
  ledger: TaskRecord[] = []
  todoLedger: TodoRecord[] = []
  deleteCalls: string[] = []
  putCalls: string[] = []
  async tasks(): Promise<TaskRecord[]> {
    return this.ledger.map(t => ({ ...t, executions: [...t.executions] }))
  }
  async replaceTasks(tasks: readonly TaskRecord[]): Promise<TaskRecord[]> {
    this.ledger = tasks.map(t => ({ ...t, executions: [...t.executions] }))
    return this.ledger
  }
  async deleteTask(id: string): Promise<boolean> {
    this.deleteCalls.push(id)
    this.ledger = this.ledger.filter(t => t.id !== id)
    return true
  }
  async putTask(task: TaskRecord): Promise<TaskRecord | undefined> {
    this.putCalls.push(task.id)
    const index = this.ledger.findIndex(t => t.id === task.id)
    if (index >= 0) this.ledger[index] = { ...task, executions: [...task.executions] }
    else this.ledger.push({ ...task, executions: [...task.executions] })
    return this.ledger.find(t => t.id === task.id)
  }
  async patchTask(id: string, patch: TaskUpdatePatch): Promise<TaskRecord | undefined> {
    const index = this.ledger.findIndex(t => t.id === id)
    if (index < 0) return undefined
    const current = this.ledger[index]
    const next: TaskRecord = { ...current }
    if (patch.title !== undefined) next.title = patch.title
    if (patch.description !== undefined) next.description = patch.description
    if (patch.prompt !== undefined) next.prompt = patch.prompt
    if (patch.workspacePath !== undefined) next.workspacePath = patch.workspacePath
    if (patch.status !== undefined) next.status = patch.status
    if (patch.schedule !== undefined) {
      next.schedule = {
        ...(next.schedule ?? { enabled: false, recurring: false, cron: '', nextRunAt: undefined, lastTriggeredAt: undefined }),
        ...patch.schedule,
      }
    }
    next.updatedAt = Date.now()
    this.ledger[index] = next
    return next
  }
  async todos(): Promise<TodoRecord[]> {
    return [...this.todoLedger]
  }
  async putTodo(todo: TodoRecord): Promise<TodoRecord | undefined> {
    const index = this.todoLedger.findIndex(t => t.id === todo.id)
    if (index >= 0) this.todoLedger[index] = { ...todo }
    else this.todoLedger.push({ ...todo })
    return this.todoLedger.find(t => t.id === todo.id)
  }
  async deleteTodo(id: string): Promise<boolean> {
    this.todoLedger = this.todoLedger.filter(t => t.id !== id)
    return true
  }
  async replaceTodos(todos: readonly TodoRecord[]): Promise<TodoRecord[]> {
    this.todoLedger = [...todos]
    return this.todoLedger
  }
}

function makeStore(api: FakeApi): ApiTaskStore {
  const store = new ApiTaskStore(api as unknown as TaskBoardApi)
  return store
}

describe('ApiTaskStore.putTask (targeted upsert)', () => {
  it('adds a new task and replaces an existing one, touching nothing else', async () => {
    const api = new FakeApi()
    const store = makeStore(api)
    api.ledger = [task('existing')]
    store.putTask(task('brand-new'))
    await vi.waitFor(() => {
      expect(api.ledger.map(t => t.id).sort()).toEqual(['brand-new', 'existing'])
    })
    const edited = task('existing')
    edited.title = 'edited'
    store.putTask(edited)
    await vi.waitFor(() => {
      expect(api.ledger.find(t => t.id === 'existing')?.title).toBe('edited')
    })
    expect(api.ledger).toHaveLength(2)
  })
})

describe('ApiTaskStore.updateTask (field-level targeted update)', () => {
  it('an edit never overwrites the host execution record or running status', async () => {
    const api = new FakeApi()
    const store = makeStore(api)
    // Host state moves forward: a run opened and settled.
    const settled = task('a')
    settled.status = 'done'
    settled.executions = [{ id: 'exec-1', sessionId: 's-1', startedAt: NOW, endedAt: NOW + 1, result: 'succeeded', error: undefined }]
    api.ledger = [settled]
    // The board renames the task from a STALE snapshot (todo, no executions).
    store.updateTask('a', { title: 'renamed' })
    await vi.waitFor(() => {
      expect(api.ledger.find(t => t.id === 'a')?.title).toBe('renamed')
    })
    const host = api.ledger[0]
    // The rename landed, but the host execution record and settled status
    // survived: the targeted PATCH carried only the edited field.
    expect(host.title).toBe('renamed')
    expect(host.executions).toHaveLength(1)
    expect(host.status).toBe('done')
  })

  it('a status move patches only the status', async () => {
    const api = new FakeApi()
    const store = makeStore(api)
    api.ledger = [task('a')]
    store.updateTask('a', { status: 'backlog' })
    await vi.waitFor(() => {
      expect(api.ledger[0].status).toBe('backlog')
    })
  })
})

describe('ApiTaskStore.putTodo / deleteTodo (targeted todo writes)', () => {
  it('upserts and deletes single todos', async () => {
    const api = new FakeApi()
    const store = makeStore(api)
    store.putTodo(createTodo({ title: '买牛奶', description: '' }, NOW, 'd-1'))
    await vi.waitFor(() => {
      expect(api.todoLedger.map(t => t.id)).toEqual(['d-1'])
    })
    const done = { ...api.todoLedger[0], status: 'done' as const }
    store.putTodo(done)
    await vi.waitFor(() => {
      expect(api.todoLedger[0].status).toBe('done')
    })
    store.deleteTodo('d-1')
    await vi.waitFor(() => {
      expect(api.todoLedger).toHaveLength(0)
    })
  })
})

describe('ApiTaskStore.save (merge semantics)', () => {
  it('keeps host rows the snapshot does not know about', async () => {
    const api = new FakeApi()
    const store = makeStore(api)
    // Host already holds tasks created by OTHER writers (agent tools, the
    // host scheduler, a sibling tab) that the board snapshot has not seen.
    api.ledger = [task('host-1'), task('host-2')]
    // The board edits one task and saves its (stale) snapshot.
    const edited = task('host-1')
    edited.title = 'edited'
    store.save([edited])
    await vi.waitFor(() => {
      expect(api.ledger.map(t => t.id).sort()).toEqual(['host-1', 'host-2'])
    })
    expect(api.ledger.find(t => t.id === 'host-1')?.title).toBe('edited')
    expect(api.ledger.find(t => t.id === 'host-2')).toBeDefined()
  })

  it('overwrites host twins with snapshot rows', async () => {
    const api = new FakeApi()
    const store = makeStore(api)
    api.ledger = [task('a', 'old-title')]
    const fresh = task('a', 'new-title')
    store.save([fresh])
    await vi.waitFor(() => {
      expect(api.ledger.find(t => t.id === 'a')?.title).toBe('new-title')
    })
  })

  it('adds snapshot-only rows to the host', async () => {
    const api = new FakeApi()
    const store = makeStore(api)
    api.ledger = []
    store.save([task('new-1')])
    await vi.waitFor(() => {
      expect(api.ledger.map(t => t.id)).toEqual(['new-1'])
    })
  })
})

describe('ApiTaskStore.deleteTask (targeted delete)', () => {
  it('deletes exactly one task on the host and updates the local cache', async () => {
    const api = new FakeApi()
    const store = makeStore(api)
    api.ledger = [task('a'), task('b')]
    await store.refresh()
    store.deleteTask('a')
    await vi.waitFor(() => {
      expect(api.ledger.map(t => t.id)).toEqual(['b'])
    })
    expect(api.deleteCalls).toEqual(['a'])
    expect(store.load().map(t => t.id)).toEqual(['b'])
  })

  it('a later stale-snapshot save cannot resurrect a deleted task', async () => {
    const api = new FakeApi()
    const store = makeStore(api)
    api.ledger = [task('a'), task('b')]
    await store.refresh()
    store.deleteTask('a')
    // The board's next save comes from a snapshot taken before the delete
    // landed — the merge must NOT bring 'a' back.
    store.save([task('a'), task('b')])
    await vi.waitFor(() => {
      expect(api.ledger.map(t => t.id).sort()).toEqual(['b'])
    })
  })
})
