/**
 * Task execution orchestration shared by the scheduler ticks and the manual
 * Run button: open an execution record on the task, hand the run to the
 * {@link TaskRunner}, settle the record from the runner outcome, and persist
 * every transition through the host store.
 */

import { randomUUID } from 'node:crypto'
import { settleExecution, startExecution, type TaskRecord } from '../core/tasks.ts'
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
 * @returns the task with the fresh running execution, or undefined when the
 *   task is already running (the caller reports the conflict).
 */
export function openExecution(store: TaskBoardStore, task: TaskRecord, now = Date.now()): TaskRecord | undefined {
  if (task.status === 'running') return undefined
  const { task: next } = startExecution(task, now, randomUUID())
  store.putTask(next)
  return next
}

/**
 * Run an already-opened execution to completion and settle it. Used by both
 * the awaited path ({@link executeTask}) and fire-and-forget manual runs.
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
  const settled = settleExecution(
    store.tasks().find(candidate => candidate.id === opened.id) ?? opened,
    execution.id,
    run.result ?? 'cancelled',
    Date.now(),
    run.error,
  )
  store.putTask(settled)
  return { executionId: execution.id, run }
}

/**
 * Execute one task end to end: open the execution, run it, settle it.
 * @param store - the host store.
 * @param runner - the host runner.
 * @param task - the task to execute (fresh from the store).
 * @param parentSessionId - optional parent session whose composition the run joins.
 * @returns the execution id and runner outcome.
 */
export async function executeTask(
  store: TaskBoardStore,
  runner: TaskRunner,
  task: TaskRecord,
  parentSessionId?: string,
): Promise<ExecuteOutcome> {
  const opened = openExecution(store, task)
  if (opened === undefined) {
    const running = task.executions[task.executions.length - 1]
    return {
      executionId: running?.id ?? 'unknown',
      run: { ok: false, sessionId: running?.sessionId, result: 'cancelled', error: 'task is already running' },
    }
  }
  return finishExecution(store, runner, opened, parentSessionId)
}
