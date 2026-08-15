/**
 * Task execution orchestration shared by the scheduler ticks and the manual
 * Run button: open an execution record on the task, hand the run to the
 * {@link TaskRunner}, settle the record from the runner outcome, and persist
 * every transition through the host store.
 */

import { randomUUID } from 'node:crypto'
import { settleExecution, startExecution, type TaskRecord } from '../core/tasks.ts'
import { nextRunAtMs } from '../core/schedule.ts'
import { applyScheduleNextRun } from '../core/use-cases/task-schedule.ts'
import type { TaskRunner, TaskRunResult } from './runner.ts'
import type { TaskBoardStore } from './store.ts'

/** Result of one orchestrated execution. */
export interface ExecuteOutcome {
  /** The opened execution record id. */
  executionId: string
  /** The runner's outcome. */
  run: TaskRunResult
}

/**
 * Open an execution on a task and persist it (no-op when the task is running).
 * A one-shot schedule is CONSUMED the moment its run actually starts (the
 * trigger has been served): the rule survives in the fired state until the
 * run settles (the policy then removes the task), and a failed dispatch
 * never orphans the task — while still due it stays in later scheduler
 * batches.
 * @returns the task with the fresh running execution, or undefined when the
 *   task is already running (the caller reports the conflict).
 */
export function openExecution(store: TaskBoardStore, task: TaskRecord, now = Date.now()): TaskRecord | undefined {
  if (task.status === 'running') return undefined
  const { task: next } = startExecution(task, now, randomUUID())
  store.putTask(next)
  const schedule = task.schedule
  if (schedule !== undefined && schedule.enabled && !schedule.recurring) {
    // Consume the one-shot trigger by updating ONLY this task (putTask):
    // a full-ledger replace would race other writers (agent tools, the
    // scheduler, sibling tabs) and could erase their tasks.
    const current = store.tasks().find(candidate => candidate.id === task.id)
    if (current?.schedule !== undefined) {
      const [updated] = applyScheduleNextRun([current], task.id, undefined, now, now)
      store.putTask(updated)
    }
  }
  return next
}

/**
 * Run an already-opened execution to completion and settle it (the only
 * awaited path; every surface — board Run, cron tool run, scheduler batch —
 * opens first via {@link openExecution} then finishes here).
 * @param store - the host store.
 * @param runner - the host runner.
 * @param opened - the task with its running execution (from {@link openExecution}).
 * @param parentSessionId - optional parent session whose composition the run joins.
 */
export async function finishExecution(
  store: TaskBoardStore,
  runner: TaskRunner,
  opened: TaskRecord,
  parentSessionId?: string,
): Promise<ExecuteOutcome> {
  const execution = opened.executions[opened.executions.length - 1]
  const run = await runner.run(opened, parentSessionId)
  // Re-read the freshest task: a concurrent mutation (another run, a delete)
  // must not resurrect a stale copy.
  const fresh = store.tasks().find(candidate => candidate.id === opened.id) ?? opened
  // Attach the session id before settling so "查看会话" works; the runner
  // reports it only after the session is established.
  const withSession = run.sessionId !== undefined && fresh.executions.some(entry => entry.id === execution.id && entry.sessionId === undefined)
    ? { ...fresh, executions: fresh.executions.map(entry =>
        entry.id === execution.id ? { ...entry, sessionId: run.sessionId } : entry) }
    : fresh
  const settled = settleExecution(
    withSession,
    execution.id,
    run.result ?? 'cancelled',
    Date.now(),
    run.error,
  )
  store.putTask(settled)
  return { executionId: execution.id, run }
}

/**
 * Post-execution policy applied once a run settles (reference `_finish_job`):
 * - an armed one-shot task is REMOVED — its single purpose has been served
 *   (the trigger was consumed when the run started);
 * - a MANUAL call (user/board) rolls a recurring task forward from NOW so the
 *   next run lands a full period after the manual run instead of firing
 *   again immediately;
 * - a SCHEDULED call (the dispatcher LLM) leaves a recurring task untouched —
 *   the scheduler already rolled it forward at dispatch time;
 * - unscheduled and disabled-schedule tasks are kept untouched (a plain Run
 *   of a board card must never delete the card).
 * @param store - the host store.
 * @param taskId - the executed task.
 * @param options - `scheduled: true` when the call came from the dispatcher.
 */
export async function applyManualRunPolicy(
  store: TaskBoardStore,
  taskId: string,
  options: { scheduled?: boolean } = {},
): Promise<void> {
  const fresh = store.tasks().find(candidate => candidate.id === taskId)
  if (fresh === undefined) return
  if (fresh.status === 'running') return
  const schedule = fresh.schedule
  if (schedule === undefined || !schedule.enabled) return
  if (schedule.recurring) {
    if (options.scheduled === true) return
    const now = Date.now()
    const nextRunAt = nextRunAtMs(schedule.cron, now)
    // Update ONLY this task: a full-ledger replace built from a single row
    // would erase every other task in the host ledger.
    const [updated] = applyScheduleNextRun([fresh], taskId, nextRunAt, now, now)
    store.putTask(updated)
    return
  }
  // Armed one-shot: the run settled — the task has served its purpose.
  store.removeTask(taskId)
}
