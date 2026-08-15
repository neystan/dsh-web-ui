/**
 * Agent tools: the model-facing surfaces of the host task board. Every tool
 * talks to the same host store the board UI reads, so a task or todo created
 * by the agent is immediately visible on the board and vice versa. The cron
 * tools create scheduled tasks that the host scheduler fires even while no
 * GUI tab is open.
 */

import { defineTool, type GenericCallView } from '@deepseek-ai/dsh-tools'
import type { ContentBlock } from '@deepseek-ai/dsh-llm'
import { randomUUID } from 'node:crypto'
import { createTask, type TaskRecord } from '../core/tasks.ts'
import { createTodo, summarizeTodo, withTodoStatus, type TodoRecord } from '../core/todos.ts'
import { nextRunAtMs } from '../core/schedule.ts'
import { applySetSchedule } from '../core/use-cases/task-schedule.ts'
import { finishExecution, openExecution } from './execution-service.ts'
import type { TaskRunner } from './runner.ts'
import type { TaskBoardStore } from './store.ts'

/** One text content block (the only render shape these tools emit). */
function text(value: string): ContentBlock[] {
  return [{ type: 'text', text: value }]
}

/** A generic read/pending card for tool calls. */
function readCard(title: string, rawInput: unknown): GenericCallView {
  return { card: 'generic', title, kind: 'read', rawInput }
}

/** Task table render shared by list surfaces. */
function renderTaskTable(tasks: readonly TaskRecord[]): string {
  if (tasks.length === 0) return 'no tasks'
  const rows = tasks.map(task => {
    const schedule = task.schedule
    const next = schedule?.enabled === true && schedule.nextRunAt !== undefined
      ? new Date(schedule.nextRunAt).toLocaleString()
      : '-'
    return [
      task.id,
      task.title,
      task.status,
      schedule?.enabled === true ? schedule.cron : '-',
      next,
      task.workspacePath ?? '',
    ].join(' | ')
  })
  return ['id | title | status | cron | next run | workspace', '--- | --- | --- | --- | --- | ---', ...rows].join('\n')
}

/** Todo table render. */
function renderTodoTable(todos: readonly TodoRecord[]): string {
  if (todos.length === 0) return 'no todos'
  const rows = todos.map(todo => [todo.id, todo.title, todo.status].join(' | '))
  return ['id | title | status', '--- | --- | ---', ...rows].join('\n')
}

/** Tool deps. */
export interface TaskBoardToolDeps {
  store: TaskBoardStore
  runner: TaskRunner
  /** Clock. */
  now?(): number
}

/** Build every task-board agent tool. */
export function makeTools(deps: TaskBoardToolDeps) {
  const { store, runner } = deps
  const now = deps.now ?? (() => Date.now())

  /** Apply a schedule patch to a task (shared by cron_create/pause/resume). */
  const applySchedule = (id: string, patch: { enabled?: boolean; cron?: string }): { task?: TaskRecord; error?: string } => {
    const task = store.tasks().find(candidate => candidate.id === id)
    if (task === undefined) return { error: `task '${id}' not found` }
    const { tasks, applied } = applySetSchedule([task], id, patch, now())
    if (!applied) return { error: `invalid cron expression: ${patch.cron ?? task.schedule?.cron ?? ''}` }
    const next = tasks[0]
    store.putTask(next)
    return { task: next }
  }

  return [
    // ------------------------------------------------------------ cron_create
    defineTool({
      name: 'cron_create',
      description: 'Create a scheduled task on the host task board. The task runs on a real dsh agent session when its cron expression is due (the host scheduler fires it even while no GUI tab is open). ' +
        'Triggers: 定时任务 / 定时执行 / 每天/每周/每小时自动运行 / cron 调度 / schedule a task.',
      parameters: {
        name: { type: 'string', required: true, description: 'Task title.' },
        cron: { type: 'string', required: true, description: '5-field cron expression: `分 时 日 月 周` (e.g. "0 23 * * *" = daily 23:00).' },
        prompt: { type: 'string', required: true, description: 'The prompt the execution session runs.' },
        workspacePath: { type: 'string', description: 'Optional absolute workspace path the task executes in (defaults to the first registered workspace).' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            taskId: { type: 'string', required: true },
            title: { type: 'string', required: true },
            cron: { type: 'string', required: true },
            nextRunAt: { type: 'string' },
          },
        },
        render: (_args, value: { taskId: string; title: string; cron: string; nextRunAt?: string }) =>
          text(`created scheduled task ${value.taskId} "${value.title}" (${value.cron})${value.nextRunAt !== undefined ? `, next run: ${value.nextRunAt}` : ''}`),
      },
      async execute(args: { name: string; cron: string; prompt: string; workspacePath?: string }) {
        const task = createTask({ title: args.name, description: '', prompt: args.prompt }, now(), randomUUID())
        if (args.workspacePath !== undefined && args.workspacePath.trim() !== '') {
          task.workspacePath = args.workspacePath.trim()
        }
        const { tasks, applied } = applySetSchedule([task], task.id, { enabled: true, cron: args.cron }, now())
        if (!applied) {
          throw new Error(`invalid cron expression: ${args.cron}`)
        }
        store.putTask(tasks[0])
        const next = tasks[0].schedule?.nextRunAt
        return {
          taskId: task.id,
          title: task.title,
          cron: tasks[0].schedule?.cron ?? args.cron,
          ...(next !== undefined ? { nextRunAt: new Date(next).toLocaleString() } : {}),
        }
      },
      presentCall: (args) => readCard('Create scheduled task', args),
    }),

    // ------------------------------------------------------------ cron_list
    defineTool({
      name: 'cron_list',
      description: 'List all tasks on the host task board (id, title, status, cron schedule, next run, workspace). ' +
        'Triggers: 查看定时任务 / 任务列表 / 看板任务 / list tasks / list cron jobs.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            tasks: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  title: { type: 'string', required: true },
                  status: { type: 'string', required: true },
                  cron: { type: 'string' },
                  enabled: { type: 'boolean' },
                  nextRunAt: { type: 'number' },
                  lastTriggeredAt: { type: 'number' },
                  workspacePath: { type: 'string' },
                },
              },
            },
          },
        },
        render: (_args, value: { tasks: unknown[] }) => text(renderTaskTable(value.tasks as TaskRecord[])),
      },
      async execute() {
        return {
          tasks: store.tasks().map(task => ({
            id: task.id,
            title: task.title,
            status: task.status,
            ...(task.schedule?.cron !== undefined ? { cron: task.schedule.cron } : {}),
            ...(task.schedule?.enabled !== undefined ? { enabled: task.schedule.enabled } : {}),
            ...(task.schedule?.nextRunAt !== undefined ? { nextRunAt: task.schedule.nextRunAt } : {}),
            ...(task.schedule?.lastTriggeredAt !== undefined ? { lastTriggeredAt: task.schedule.lastTriggeredAt } : {}),
            ...(task.workspacePath !== undefined ? { workspacePath: task.workspacePath } : {}),
          })),
        }
      },
      presentCall: (args) => readCard('List tasks', args),
    }),

    // ------------------------------------------------------------ cron_pause
    defineTool({
      name: 'cron_pause',
      description: 'Pause a scheduled task: its cron rule stays but stops firing until cron_resume. ' +
        'Triggers: 暂停定时任务 / 停掉定时 / pause cron.',
      parameters: {
        id: { type: 'string', required: true, description: 'Task id from cron_list.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { ok: { type: 'boolean', required: true }, error: { type: 'string' } },
        },
        render: (_args, value: { ok: boolean; error?: string }) =>
          text(value.ok ? 'task schedule paused' : `failed: ${value.error ?? 'unknown'}`),
      },
      async execute(args: { id: string }) {
        const result = applySchedule(args.id, { enabled: false })
        if (result.error !== undefined) return { ok: false, error: result.error }
        return { ok: true }
      },
      presentCall: (args) => readCard('Pause scheduled task', args),
    }),

    // ------------------------------------------------------------ cron_resume
    defineTool({
      name: 'cron_resume',
      description: 'Resume a paused scheduled task and recompute its next run instant. ' +
        'Triggers: 恢复定时任务 / resume cron.',
      parameters: {
        id: { type: 'string', required: true, description: 'Task id from cron_list.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { ok: { type: 'boolean', required: true }, nextRunAt: { type: 'number' }, error: { type: 'string' } },
        },
        render: (_args, value: { ok: boolean; nextRunAt?: number; error?: string }) =>
          text(value.ok
            ? `task schedule resumed${value.nextRunAt !== undefined ? `, next run: ${new Date(value.nextRunAt).toLocaleString()}` : ''}`
            : `failed: ${value.error ?? 'unknown'}`),
      },
      async execute(args: { id: string }) {
        const task = store.tasks().find(candidate => candidate.id === args.id)
        if (task === undefined) return { ok: false, error: `task '${args.id}' not found` }
        const result = applySchedule(args.id, { enabled: true, cron: task.schedule?.cron })
        if (result.error !== undefined) return { ok: false, error: result.error }
        return { ok: true, ...(result.task?.schedule?.nextRunAt !== undefined ? { nextRunAt: result.task.schedule.nextRunAt } : {}) }
      },
      presentCall: (args) => readCard('Resume scheduled task', args),
    }),

    // ------------------------------------------------------------ cron_delete
    defineTool({
      name: 'cron_delete',
      description: 'Delete a task from the host task board (its schedule stops firing). ' +
        'Triggers: 删除任务 / 删除定时任务 / delete task / delete cron.',
      parameters: {
        id: { type: 'string', required: true, description: 'Task id from cron_list.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { ok: { type: 'boolean', required: true }, error: { type: 'string' } },
        },
        render: (_args, value: { ok: boolean; error?: string }) =>
          text(value.ok ? 'task deleted' : `failed: ${value.error ?? 'unknown'}`),
      },
      async execute(args: { id: string }) {
        if (!store.removeTask(args.id)) return { ok: false, error: `task '${args.id}' not found` }
        return { ok: true }
      },
      presentCall: (args) => readCard('Delete task', args),
    }),

    // ------------------------------------------------------------ cron_run
    defineTool({
      name: 'cron_run',
      description: 'Run a task now through a real dsh agent session (same path as the board Run button and the host scheduler). The run happens in the background; poll cron_list for the settled status. ' +
        'Triggers: 立即执行任务 / 现在跑 / run task now.',
      parameters: {
        id: { type: 'string', required: true, description: 'Task id from cron_list.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { ok: { type: 'boolean', required: true }, error: { type: 'string' } },
        },
        render: (_args, value: { ok: boolean; error?: string }) =>
          text(value.ok ? 'task run started in the background' : `failed: ${value.error ?? 'unknown'}`),
      },
      async execute(args: { id: string }) {
        const task = store.tasks().find(candidate => candidate.id === args.id)
        if (task === undefined) return { ok: false, error: `task '${args.id}' not found` }
        const opened = openExecution(store, task)
        if (opened === undefined) return { ok: false, error: 'task is already running' }
        void finishExecution(store, runner, opened).catch((error: unknown) => {
          const execution = opened.executions[opened.executions.length - 1]
          store.putTask({
            ...opened,
            status: 'failed',
            updatedAt: now(),
            executions: opened.executions.map(entry => entry.id === execution.id
              ? { ...entry, endedAt: now(), result: 'failed' as const, error: error instanceof Error ? error.message : String(error) }
              : entry),
          })
        })
        return { ok: true }
      },
      presentCall: (args) => readCard('Run task now', args),
    }),

    // ------------------------------------------------------------ todo_add
    defineTool({
      name: 'todo_add',
      description: 'Add a durable todo to the host todo ledger (visible in the task board). ' +
        'Triggers: 添加待办 / 记下待办 / 新增 todo / add todo.',
      parameters: {
        title: { type: 'string', required: true, description: 'Todo title.' },
        description: { type: 'string', description: 'Optional longer description.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { todoId: { type: 'string', required: true }, title: { type: 'string', required: true } },
        },
        render: (_args, value: { todoId: string; title: string }) => text(`added todo ${value.todoId} "${value.title}"`),
      },
      async execute(args: { title: string; description?: string }) {
        const todo = createTodo({ title: args.title, description: args.description ?? '' }, now(), randomUUID())
        store.putTodo(todo)
        return { todoId: todo.id, title: todo.title }
      },
      presentCall: (args) => readCard('Add todo', args),
    }),

    // ------------------------------------------------------------ todo_list
    defineTool({
      name: 'todo_list',
      description: 'List all durable todos (id, title, status). ' +
        'Triggers: 查看待办 / 待办列表 / 还有什么没做 / list todos.',
      parameters: {},
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            todos: {
              type: 'array',
              required: true,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string', required: true },
                  title: { type: 'string', required: true },
                  status: { type: 'string', required: true },
                  createdAt: { type: 'number', required: true },
                },
              },
            },
          },
        },
        render: (_args, value: { todos: unknown[] }) => text(renderTodoTable(value.todos as TodoRecord[])),
      },
      async execute() {
        return { todos: store.todos().map(summarizeTodo) }
      },
      presentCall: (args) => readCard('List todos', args),
    }),

    // ------------------------------------------------------------ todo_done
    defineTool({
      name: 'todo_done',
      description: 'Mark a todo as done. ' +
        'Triggers: 完成待办 / 待办已完成 / 标记完成 / done todo.',
      parameters: {
        id: { type: 'string', required: true, description: 'Todo id from todo_list.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { ok: { type: 'boolean', required: true }, error: { type: 'string' } },
        },
        render: (_args, value: { ok: boolean; error?: string }) =>
          text(value.ok ? 'todo marked done' : `failed: ${value.error ?? 'unknown'}`),
      },
      async execute(args: { id: string }) {
        const todo = store.todos().find(candidate => candidate.id === args.id)
        if (todo === undefined) return { ok: false, error: `todo '${args.id}' not found` }
        store.putTodo(withTodoStatus(todo, 'done', now()))
        return { ok: true }
      },
      presentCall: (args) => readCard('Mark todo done', args),
    }),

    // ------------------------------------------------------------ todo_delete
    defineTool({
      name: 'todo_delete',
      description: 'Delete a todo from the ledger. ' +
        'Triggers: 删除待办 / remove todo.',
      parameters: {
        id: { type: 'string', required: true, description: 'Todo id from todo_list.' },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: { ok: { type: 'boolean', required: true }, error: { type: 'string' } },
        },
        render: (_args, value: { ok: boolean; error?: string }) =>
          text(value.ok ? 'todo deleted' : `failed: ${value.error ?? 'unknown'}`),
      },
      async execute(args: { id: string }) {
        if (!store.removeTodo(args.id)) return { ok: false, error: `todo '${args.id}' not found` }
        return { ok: true }
      },
      presentCall: (args) => readCard('Delete todo', args),
    }),
  ]
}
