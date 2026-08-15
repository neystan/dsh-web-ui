/**
 * Task detail: the full view of one task — content, prompt, execution
 * history — and the only place execution can be triggered. Also offers
 * delete (with confirmation), manual status moves, and a jump to the
 * execution's session transcript.
 */
import { useEffect, useState } from 'react'
import type { BoardController } from '../../core/controller.ts'
import { isValidCron } from '../../core/schedule.ts'
import { MANUAL_STATUSES, type ExecutionRecord, type TaskRecord, type TaskStatus } from '../../core/tasks.ts'
import { t, type TaskBoardKey } from '../locales.ts'
import css from '../board.module.css'
import { ConfirmDialog } from './ConfirmDialog.tsx'
import { formatTime } from './TaskCard.tsx'

/** Execution outcome → locale key. */
const RESULT_KEY: Record<NonNullable<ExecutionRecord['result']>, TaskBoardKey> = {
  succeeded: 'detail.result.succeeded',
  failed: 'detail.result.failed',
  cancelled: 'detail.result.cancelled',
}

/** Status → locale key (detail badge). */
const STATUS_KEY: Record<TaskStatus, TaskBoardKey> = {
  backlog: 'board.status.backlog',
  todo: 'board.status.todo',
  running: 'board.status.running',
  done: 'board.status.done',
  failed: 'board.status.failed',
}

/** One execution-history row. */
function ExecutionRow({ execution, onOpen }: { execution: ExecutionRecord; onOpen: (sessionId: string) => void }) {
  const result = execution.result
  return (
    <li className={css.executionRow} data-result={result}>
      <span className={css.executionBadge} data-result={result}>
        {result === undefined ? t('detail.result.running') : t(RESULT_KEY[result])}
      </span>
      <span className={css.executionTimes}>
        {t('detail.executionStarted')} {formatTime(execution.startedAt)}
        {execution.endedAt !== undefined && ` · ${t('detail.executionEnded')} ${formatTime(execution.endedAt)}`}
      </span>
      {execution.sessionId !== undefined && (
        <button
          type="button"
          className={css.linkButton}
          onClick={() => { onOpen(execution.sessionId as string) }}
          title={execution.sessionId}
        >
          {t('detail.viewSession')} ⌁
        </button>
      )}
      {execution.error !== undefined && execution.error !== '' && (
        <span className={css.executionError}>{execution.error}</span>
      )}
    </li>
  )
}

/** Common scheduled-run presets (cron → locale label). */
const SCHEDULE_PRESETS: ReadonlyArray<{ cron: string; label: TaskBoardKey }> = [
  { cron: '0 9 * * *', label: 'detail.schedule.preset.daily9' },
  { cron: '0 * * * *', label: 'detail.schedule.preset.hourly' },
  { cron: '*/10 * * * *', label: 'detail.schedule.preset.tenMin' },
  { cron: '0 9 * * 1', label: 'detail.schedule.preset.weeklyMon9' },
]

/** ms epoch → `<input type="datetime-local">` value (local time). */
function toLocalInput(ms: number): string {
  const date = new Date(ms)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** `<input type="datetime-local">` value → ms epoch (parsed as local time). */
function parseLocalInput(value: string): number | undefined {
  if (value.trim() === '') return undefined
  const ms = new Date(value).getTime()
  return Number.isNaN(ms) ? undefined : ms
}

/**
 * The scheduled-runs editor: enable toggle, mode switch (recurring cron /
 * one-shot trigger), the mode-specific editor (cron input + presets, or a
 * local-time picker), and next/last-run info. The mode switch persists
 * immediately (with the current editor value), so the ledger never drifts
 * from what the editor shows.
 */
function ScheduleSection({ controller, task }: { controller: BoardController; task: TaskRecord }) {
  const schedule = task.schedule
  const [mode, setMode] = useState<'recurring' | 'once'>(schedule?.recurring === false ? 'once' : 'recurring')
  const [cron, setCron] = useState(schedule?.cron !== '' ? (schedule?.cron ?? '0 9 * * *') : '0 9 * * *')
  const [onceTime, setOnceTime] = useState(() => toLocalInput(schedule?.nextRunAt ?? Date.now() + 60 * 60_000))
  const [enabled, setEnabled] = useState(schedule?.enabled ?? false)
  const [nextRunAt, setNextRunAt] = useState<number | undefined>(schedule?.nextRunAt)
  const [lastTriggeredAt, setLastTriggeredAt] = useState<number | undefined>(schedule?.lastTriggeredAt)
  const [error, setError] = useState<string | undefined>(undefined)

  // Keep the editor in sync when the task record changes underneath (the
  // schedule rolls forward as runs trigger, or the mode switch persists).
  useEffect(() => {
    const current = task.schedule
    setMode(current?.recurring === false ? 'once' : 'recurring')
    setCron(current?.cron !== '' ? (current?.cron ?? '0 9 * * *') : '0 9 * * *')
    setEnabled(current?.enabled ?? false)
    setNextRunAt(current?.nextRunAt)
    setLastTriggeredAt(current?.lastTriggeredAt)
    setError(undefined)
  }, [task.id, task.schedule?.enabled, task.schedule?.recurring, task.schedule?.cron, task.schedule?.nextRunAt, task.schedule?.lastTriggeredAt])

  /** Validate + persist the current cron text (Enter or blur). */
  const saveCron = (value: string): void => {
    const trimmed = value.trim()
    setCron(trimmed)
    if (trimmed === '' || !isValidCron(trimmed)) {
      setError(t('detail.schedule.invalid'))
      return
    }
    setError(undefined)
    controller.setSchedule(task.id, { cron: trimmed })
  }

  /** Validate + persist the current one-shot trigger time (Enter or blur). */
  const saveOnce = (value: string): void => {
    const ms = parseLocalInput(value)
    if (ms === undefined || ms <= Date.now()) {
      setError(t('detail.schedule.onceInvalid'))
      return
    }
    setError(undefined)
    controller.setSchedule(task.id, { at: ms })
  }

  /** Switch the editor (and the persisted rule) between recurring and one-shot. */
  const switchMode = (next: 'recurring' | 'once'): void => {
    setMode(next)
    if (next === 'recurring') {
      const trimmed = cron.trim()
      if (trimmed === '' || !isValidCron(trimmed)) {
        setError(t('detail.schedule.invalid'))
        return
      }
      setError(undefined)
      controller.setSchedule(task.id, { cron: trimmed })
      return
    }
    const ms = parseLocalInput(onceTime)
    if (ms === undefined || ms <= Date.now()) {
      setError(t('detail.schedule.onceInvalid'))
      return
    }
    setError(undefined)
    controller.setSchedule(task.id, { at: ms })
  }

  /** Arm/disarm the schedule (arming first persists the current editor value). */
  const toggleEnabled = (next: boolean): void => {
    if (next) {
      if (mode === 'recurring') {
        const trimmed = cron.trim()
        if (trimmed === '' || !isValidCron(trimmed)) {
          setError(t('detail.schedule.invalid'))
          return
        }
        if (trimmed !== schedule?.cron) controller.setSchedule(task.id, { cron: trimmed })
      } else {
        const ms = parseLocalInput(onceTime)
        if (ms === undefined || ms <= Date.now()) {
          setError(t('detail.schedule.onceInvalid'))
          return
        }
        const currentTrigger = schedule?.recurring === false ? schedule.nextRunAt : undefined
        if (ms !== currentTrigger) controller.setSchedule(task.id, { at: ms })
      }
    }
    setError(undefined)
    if (controller.setSchedule(task.id, { enabled: next })) setEnabled(next)
  }

  const applyPreset = (preset: string): void => {
    if (preset === '') return
    setCron(preset)
    setError(undefined)
    controller.setSchedule(task.id, { cron: preset })
  }

  const nextLabel = !enabled || nextRunAt === undefined
    ? t('detail.schedule.notScheduled')
    : nextRunAt <= Date.now()
      ? t('detail.schedule.dueSoon')
      : new Date(nextRunAt).toLocaleString()
  const lastLabel = lastTriggeredAt === undefined ? '—' : new Date(lastTriggeredAt).toLocaleString()
  const fired = mode === 'once' && enabled && nextRunAt === undefined && lastTriggeredAt !== undefined

  return (
    <section className={css.detailSection}>
      <h4>{t('detail.schedule')}</h4>
      <label className={css.scheduleToggle}>
        <input
          type="checkbox"
          checked={enabled}
          onChange={event => { toggleEnabled(event.target.checked) }}
        />
        <span>{t('detail.schedule.enable')}</span>
      </label>
      <div className={css.scheduleRow}>
        <select
          className={css.schedulePreset}
          value={mode}
          aria-label={t('detail.schedule.mode')}
          onChange={event => { switchMode(event.target.value as 'recurring' | 'once') }}
        >
          <option value="recurring">{t('detail.schedule.mode.recurring')}</option>
          <option value="once">{t('detail.schedule.mode.once')}</option>
        </select>
        {mode === 'recurring' ? (
          <>
            <input
              className={`${css.input} ${css.scheduleInput}${error !== undefined ? ` ${css.scheduleInputInvalid}` : ''}`}
              value={cron}
              placeholder="0 9 * * *"
              spellCheck={false}
              aria-label={t('detail.schedule.cron')}
              onChange={event => { setCron(event.target.value); setError(undefined) }}
              onBlur={() => { saveCron(cron) }}
              onKeyDown={event => { if (event.key === 'Enter') saveCron(cron) }}
            />
            <select
              className={css.schedulePreset}
              value=""
              aria-label={t('detail.schedule.presets')}
              onChange={event => { applyPreset(event.target.value) }}
            >
              <option value="">{t('detail.schedule.presets')}…</option>
              {SCHEDULE_PRESETS.map(preset => (
                <option key={preset.cron} value={preset.cron}>{t(preset.label)}</option>
              ))}
            </select>
          </>
        ) : (
          <>
            <input
              className={`${css.input} ${css.scheduleInput}${error !== undefined ? ` ${css.scheduleInputInvalid}` : ''}`}
              type="datetime-local"
              value={onceTime}
              aria-label={t('detail.schedule.onceAt')}
              onChange={event => { setOnceTime(event.target.value); setError(undefined) }}
              onBlur={() => { saveOnce(onceTime) }}
              onKeyDown={event => { if (event.key === 'Enter') saveOnce(onceTime) }}
            />
            <p className={css.scheduleMeta}>{t('detail.schedule.onceHint')}</p>
          </>
        )}
      </div>
      {error !== undefined && <p className={css.formError}>{error}</p>}
      <p className={css.scheduleMeta}>
        {t('detail.schedule.nextRun')} {nextLabel}
        {' · '}{t('detail.schedule.lastTriggered')} {lastLabel}
      </p>
      {fired && <p className={css.scheduleMeta}>{t('detail.schedule.onceFired')}</p>}
    </section>
  )
}

/** Task detail overlay. */
export function TaskDetail({ controller, task }: { controller: BoardController; task: TaskRecord }) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [workspace, setWorkspace] = useState(task.workspacePath ?? '')
  const running = task.status === 'running'

  // Keep the overlay in sync if the task record changes underneath.
  const [latest, setLatest] = useState(task)
  useEffect(() => { setLatest(task) }, [task])
  useEffect(() => { setWorkspace(task.workspacePath ?? '') }, [task.workspacePath])
  const current = latest

  /** Persist the workspace path (blank clears it back to the cron workspace). */
  const saveWorkspace = (): void => {
    const trimmed = workspace.trim()
    if (trimmed === (current.workspacePath ?? '')) return
    controller.updateTask(current.id, { workspacePath: trimmed })
  }

  return (
    <div className={css.modalBackdrop} onMouseDown={event => { if (event.target === event.currentTarget) controller.closeTask() }}>
      <div className={css.detail} role="dialog" aria-label={t('detail.title')}>
        <header className={css.detailHeader}>
          <h2 className={css.detailTitle}>{current.title}</h2>
          <span className={css.statusBadge} data-status={current.status}>{t(STATUS_KEY[current.status])}</span>
          <button
            type="button"
            className={css.iconButton}
            aria-label={t('detail.close')}
            onClick={() => { controller.closeTask() }}
          >
            ×
          </button>
        </header>

        <div className={css.detailBody}>
          <section className={css.detailSection}>
            <h4>{t('detail.description')}</h4>
            <p className={css.detailText}>{current.description !== '' ? current.description : '—'}</p>
          </section>

          <section className={css.detailSection}>
            <h4>{t('detail.prompt')}</h4>
            <pre className={css.promptBlock}>{current.prompt !== '' ? current.prompt : current.title}</pre>
          </section>

          <ScheduleSection controller={controller} task={current} />

          <section className={css.detailSection}>
            <h4>{t('detail.workspace')}</h4>
            <input
              className={css.input}
              value={workspace}
              placeholder={t('detail.workspacePlaceholder')}
              spellCheck={false}
              aria-label={t('detail.workspace')}
              onChange={event => { setWorkspace(event.target.value) }}
              onBlur={saveWorkspace}
              onKeyDown={event => { if (event.key === 'Enter') saveWorkspace() }}
            />
            <p className={css.scheduleMeta}>{t('detail.workspaceHint')}</p>
          </section>

          <section className={css.detailSection}>
            <h4>{t('detail.execution')}</h4>
            {current.executions.length === 0 ? (
              <p className={css.detailText}>{t('detail.noExecution')}</p>
            ) : (
              <ul className={css.executionList}>
                {[...current.executions].reverse().map(execution => (
                  <ExecutionRow
                    key={execution.id}
                    execution={execution}
                    onOpen={sessionId => { controller.openSession(sessionId) }}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className={css.detailSection}>
            <h4>{t('board.status')}</h4>
            <div className={css.moveRow}>
              {MANUAL_STATUSES.map(status => (
                <button
                  key={status}
                  type="button"
                  className={css.ghostButton}
                  disabled={current.status === status || running}
                  onClick={() => { controller.moveTask(current.id, status) }}
                >
                  {t(`status.move.${status}` as TaskBoardKey)}
                </button>
              ))}
            </div>
          </section>
        </div>

        <footer className={css.detailFooter}>
          <button
            type="button"
            className={css.primaryButton}
            disabled={running}
            onClick={() => {
              // Running kicks off a real agent session; close the detail so
              // the whole board stays visible while the task executes.
              controller.closeTask()
              void controller.rerunTask(current.id)
            }}
          >
            {current.executions.length === 0 ? t('detail.run') : t('detail.rerun')}
          </button>
          <button
            type="button"
            className={css.dangerButton}
            onClick={() => { setConfirmDelete(true) }}
          >
            {t('detail.delete')}
          </button>
          <span className={css.detailMeta}>
            {t('board.created')} {formatTime(current.createdAt)}
          </span>
        </footer>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title={t('delete.title')}
          message={t('delete.confirm', { name: current.title })}
          confirmLabel={t('delete.ok')}
          danger
          onCancel={() => { setConfirmDelete(false) }}
          onConfirm={() => {
            setConfirmDelete(false)
            controller.deleteTask(current.id)
            controller.closeTask()
          }}
        />
      )}
    </div>
  )
}
