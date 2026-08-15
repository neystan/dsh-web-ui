/**
 * Board view: the multi-column kanban that replaces the middle column while
 * active, plus a todo strip above the columns (the durable todo ledger the
 * agent tools share). Cards open the task detail (never execute directly);
 * the header offers filter, new-task, and a back-to-chat escape.
 */
import { memo, useCallback, useEffect, useState } from 'react'
import { selectedTaskOf, type BoardController } from '../../core/controller.ts'
import { COLUMNS, type TaskRecord, type TaskStatus } from '../../core/tasks.ts'
import type { TodoRecord } from '../../core/todos.ts'
import { t, type TaskBoardKey } from '../locales.ts'
import css from '../board.module.css'
import { NewTaskModal } from './NewTaskModal.tsx'
import { TaskCard } from './TaskCard.tsx'
import { TaskDetail } from './TaskDetail.tsx'
import { formatTime } from './TaskCard.tsx'

/** Column status → locale key. */
const STATUS_KEY: Record<TaskStatus, TaskBoardKey> = {
  backlog: 'board.status.backlog',
  todo: 'board.status.todo',
  running: 'board.status.running',
  done: 'board.status.done',
  failed: 'board.status.failed',
}

/** Case-insensitive title/description match. */
function matchesFilter(task: TaskRecord, filter: string): boolean {
  if (filter.trim() === '') return true
  const needle = filter.trim().toLowerCase()
  return task.title.toLowerCase().includes(needle) || task.description.toLowerCase().includes(needle)
}

/** Whether a todo matches the shared filter. */
function todoMatchesFilter(todo: TodoRecord, filter: string): boolean {
  if (filter.trim() === '') return true
  const needle = filter.trim().toLowerCase()
  return todo.title.toLowerCase().includes(needle) || todo.description.toLowerCase().includes(needle)
}

/**
 * Memoized per-card adapter: with a stable `onOpen` from the board and an
 * immutable task record (only the changed card gets a new object ref), a card
 * re-renders only when its own task changes — not when a sibling card status,
 * the filter, or the selection moves.
 */
const MemoTaskCard = memo(function MemoTaskCard({ task, onOpen }: { task: TaskRecord; onOpen: (id: string) => void }) {
  const onClick = useCallback(() => { onOpen(task.id) }, [task.id, onOpen])
  return <TaskCard task={task} onClick={onClick} />
})

/** The todo strip: durable todos (agent-created ones included) with quick actions. */
function TodoStrip({ todos, controller }: { todos: readonly TodoRecord[]; controller: BoardController }) {
  const [draft, setDraft] = useState('')
  const open = todos.filter(todo => todo.status === 'open')
  const done = todos.filter(todo => todo.status === 'done')
  const submit = (): void => {
    if (draft.trim() === '') return
    controller.addTodo({ title: draft, description: '' })
    setDraft('')
  }
  return (
    <div className={css.todoStrip} data-dsh-taskboard-todos="">
      <header className={css.todoHeader}>
        <h3 className={css.todoTitle}>{t('todo.title')}</h3>
        <span className={css.columnCount}>{open.length}</span>
      </header>
      <div className={css.todoAddRow}>
        <input
          className={css.todoInput}
          type="text"
          placeholder={t('todo.addPlaceholder')}
          value={draft}
          onChange={event => { setDraft(event.target.value) }}
          onKeyDown={event => { if (event.key === 'Enter') submit() }}
          aria-label={t('todo.add')}
        />
        <button type="button" className={css.ghostButton} onClick={submit} disabled={draft.trim() === ''}>
          {t('todo.add')}
        </button>
      </div>
      {todos.length === 0 && <div className={css.todoEmpty}>{t('todo.empty')}</div>}
      {open.map(todo => (
        <div key={todo.id} className={css.todoRow} data-status="open">
          <button
            type="button"
            className={css.todoCheck}
            title={t('todo.done')}
            aria-label={t('todo.done')}
            onClick={() => { controller.toggleTodo(todo.id) }}
          />
          <span className={css.todoBody}>
            <span className={css.todoLabel}>{todo.title}</span>
            {todo.description !== '' && <span className={css.todoDescription}>{todo.description}</span>}
          </span>
          <span className={css.todoTime}>{formatTime(todo.createdAt)}</span>
          <button
            type="button"
            className={css.todoDelete}
            title="×"
            aria-label="×"
            onClick={() => { controller.deleteTodo(todo.id) }}
          >
            ×
          </button>
        </div>
      ))}
      {done.map(todo => (
        <div key={todo.id} className={css.todoRow} data-status="done">
          <button
            type="button"
            className={`${css.todoCheck} ${css.todoCheckDone}`}
            title={t('todo.open')}
            aria-label={t('todo.open')}
            onClick={() => { controller.toggleTodo(todo.id) }}
          />
          <span className={css.todoBody}>
            <span className={`${css.todoLabel} ${css.todoLabelDone}`}>{todo.title}</span>
            {todo.description !== '' && <span className={css.todoDescription}>{todo.description}</span>}
          </span>
          <span className={css.todoTime}>{formatTime(todo.createdAt)}</span>
          <button
            type="button"
            className={css.todoDelete}
            title="×"
            aria-label="×"
            onClick={() => { controller.deleteTodo(todo.id) }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

/** Board component; subscribes to the controller snapshot. */
export function TaskBoard({ controller }: { controller: BoardController }) {
  const [snapshot, setSnapshot] = useState(controller.getSnapshot())
  useEffect(
    () => controller.subscribe(() => setSnapshot(controller.getSnapshot())),
    [controller],
  )
  const [filter, setFilter] = useState('')
  const [showNew, setShowNew] = useState(false)
  const selected = selectedTaskOf(snapshot)
  const visible = snapshot.tasks.filter(task => matchesFilter(task, filter))
  const visibleTodos = snapshot.todos.filter(todo => todoMatchesFilter(todo, filter))
  const openTask = useCallback((id: string): void => { controller.openTask(id) }, [controller])

  return (
    <div className={css.board} data-dsh-taskboard-board="">
      <header className={css.boardHeader}>
        <h2 className={css.boardTitle}>{t('board.title')}</h2>
        <input
          className={css.search}
          type="search"
          placeholder={t('board.search')}
          value={filter}
          onChange={event => { setFilter(event.target.value) }}
          aria-label={t('board.search')}
        />
        <button
          type="button"
          className={css.primaryButton}
          onClick={() => { setShowNew(true) }}
        >
          + {t('board.new')}
        </button>
        <button
          type="button"
          className={css.ghostButton}
          onClick={() => { controller.closeBoard() }}
        >
          {t('board.close')}
        </button>
      </header>

      <TodoStrip todos={visibleTodos} controller={controller} />

      <div className={css.columns}>
        {COLUMNS.map(column => {
          const tasks = visible.filter(task => task.status === column.status)
          return (
            <section key={column.status} className={css.column} data-status={column.status}>
              <header className={css.columnHeader}>
                <span className={css.statusDot} data-status={column.status} aria-hidden="true" />
                <h3 className={css.columnTitle}>{t(STATUS_KEY[column.status])}</h3>
                <span className={css.columnCount}>{tasks.length}</span>
              </header>
              <div className={css.cards}>
                {tasks.map(task => (
                  <MemoTaskCard key={task.id} task={task} onOpen={openTask} />
                ))}
                {tasks.length === 0 && <div className={css.columnEmpty}>{t('board.empty')}</div>}
              </div>
            </section>
          )
        })}
      </div>

      {selected !== undefined && (
        <TaskDetail controller={controller} task={selected} />
      )}
      {showNew && (
        <NewTaskModal
          controller={controller}
          onClose={() => { setShowNew(false) }}
        />
      )}
    </div>
  )
}
