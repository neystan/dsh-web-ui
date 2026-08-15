/**
 * Schedule use case: arm/disarm a task's schedule rule — recurring (cron)
 * or one-shot (a trigger instant, selected by the `recurring` discriminant)
 * — and roll/consume a rule forward. Pure ledger transitions (no persistence
 * or notify — the controller orchestrates those). Validation and next-run
 * computation live here, sharing the core cron parser (schedule.ts) and the
 * withSchedule transition.
 */
import { isValidCron, nextRunAtMs } from '../schedule.ts'
import { withSchedule, type ScheduleRule, type TaskRecord } from '../tasks.ts'

/** Fields the schedule use case may change on a rule. */
export interface SetSchedulePatch {
  enabled?: boolean
  /** Recurring cron expression; a non-blank value switches the rule to recurring. */
  cron?: string
  /**
   * One-shot trigger instant (ms epoch); providing it switches the rule to
   * one-shot. Absent on a one-shot rule, the current trigger is kept (re-arm).
   */
  at?: number
}

/** Result of arming/disarming a rule. */
export interface SetScheduleResult {
  /** The next ledger; unchanged reference when rejected. */
  tasks: readonly TaskRecord[]
  /** Whether the rule was applied (false on unknown task / invalid cron / missing trigger). */
  applied: boolean
}

/**
 * Set a task's schedule rule.
 *
 * The mode is selected by the effective rule, not by the patch shape:
 * - a non-blank `cron` → recurring mode (next run computed immediately);
 * - otherwise → one-shot mode, whose trigger is `patch.at` or the rule's
 *   current trigger instant (re-arming a paused one-shot keeps its time).
 *
 * A disabled rule never carries a next-run instant — except that pausing a
 * one-shot KEEPS its trigger (resume restores it; the trigger is only
 * consumed when an execution actually starts). Rejected (state untouched)
 * when the task is unknown, the cron is invalid, or a one-shot has no
 * trigger and none is known (a fired one-shot keeps its consumed state).
 * @param tasks - current ledger.
 * @param id - the task to schedule.
 * @param patch - rule fields to change (absent fields keep their current value).
 * @param now - clock instant (ms epoch).
 */
export function applySetSchedule(
  tasks: readonly TaskRecord[],
  id: string,
  patch: SetSchedulePatch,
  now: number,
): SetScheduleResult {
  const task = tasks.find(candidate => candidate.id === id)
  if (task === undefined) return { tasks, applied: false }
  const current = task.schedule
  const cron = (patch.cron ?? current?.cron ?? '').trim()
  const enabled = patch.enabled ?? current?.enabled ?? false

  if (cron !== '') {
    // Recurring mode.
    if (!isValidCron(cron)) return { tasks, applied: false }
    const nextRunAt = enabled ? nextRunAtMs(cron, now) : undefined
    return {
      tasks: tasks.map(candidate =>
        candidate.id === id
          ? withSchedule(candidate, { enabled, recurring: true, cron, nextRunAt }, now)
          : candidate),
      applied: true,
    }
  }
  // One-shot mode.
  const at = patch.at ?? current?.nextRunAt
  const alreadyConsumed = current?.recurring === false && current.nextRunAt === undefined
  if (at === undefined && !alreadyConsumed) return { tasks, applied: false }
  const rule: Partial<ScheduleRule> = { enabled, recurring: false, cron: '' }
  if (at !== undefined) {
    // Keep the trigger whether arming or pausing: pausing a one-shot must
    // not forget its time (resume restores it), and the trigger is only
    // consumed when an execution actually starts. A fired one-shot
    // (at undefined) keeps its consumed state untouched.
    rule.nextRunAt = at
  }
  return {
    tasks: tasks.map(candidate =>
      candidate.id === id ? withSchedule(candidate, rule, now) : candidate),
    applied: true,
  }
}

/**
 * Roll a task's schedule rule forward (scheduler/run callback): persist the
 * next due instant and the trigger instant. Passing `nextRunAt: undefined`
 * CONSUMES the rule's deadline (one-shot fired): the rule survives in the
 * fired state until the run settles and the task is removed. No-op for tasks
 * without a rule (deleted mid-tick, for example).
 * @param tasks - current ledger.
 * @param id - the task to roll forward.
 * @param nextRunAt - next due instant (may be undefined to consume/clear).
 * @param lastTriggeredAt - the trigger instant of this run.
 * @param now - clock instant (ms epoch).
 */
export function applyScheduleNextRun(
  tasks: readonly TaskRecord[],
  id: string,
  nextRunAt: number | undefined,
  lastTriggeredAt: number | undefined,
  now: number,
): readonly TaskRecord[] {
  return tasks.map(task =>
    task.id === id && task.schedule !== undefined
      ? withSchedule(task, { nextRunAt, lastTriggeredAt }, now)
      : task)
}
