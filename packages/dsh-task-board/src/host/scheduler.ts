/**
 * Host cron scheduler: a minute-granularity heartbeat in the host process
 * that hands due scheduled tasks to the dispatcher agent (which executes
 * each via the cron tool's `run` action — every scheduled run goes through
 * the LLM). Because the scheduler lives in the host, scheduled runs keep
 * firing while no GUI tab is open.
 *
 * Semantics (aligned with the reference CronManager / Linux `at` model):
 * - recurring (cron) tasks are rolled forward from their due instant at
 *   dispatch, so one tick can never double-fire and missed fires are
 *   skipped (standard cron semantics);
 * - one-shot tasks keep their trigger instant until an execution ACTUALLY
 *   starts (the run path consumes it) — a failed dispatch never orphans the
 *   task, and the rule survives until the run settles (the task is then
 *   removed);
 * - startup reconciliation: recurring rules roll forward past fires missed
 *   while the host was down, and expired one-shot entries are dropped
 *   (never fired late);
 * - while the dispatcher agent is busy, the batch waits (no stacking).
 */

import { nextRunAtMs } from '../core/schedule.ts'
import type { TaskRecord } from '../core/tasks.ts'

/** Tick cadence (ms). */
export const TICK_MS = 60_000

/** The scheduler's trigger face (injected by the plugin root). */
export interface SchedulerDeps {
  /** Read the current task ledger. */
  tasks(): TaskRecord[]
  /** Clock; defaults to Date.now. */
  now?(): number
  /** Whether the dispatcher agent can accept a new batch right now. */
  dispatcherIdle(): boolean
  /** Hand a batch of due tasks to the dispatcher agent (LLM-driven execution). */
  notifyDispatcher(due: readonly TaskRecord[]): Promise<void>
  /**
   * Persist a rolled-forward/consumed schedule (next due + trigger instant).
   * Recurring dispatch passes the next cron match; one-shot runs pass
   * undefined to consume the trigger (see the run path).
   */
  applyScheduleNextRun(id: string, nextRunAt: number | undefined, lastTriggeredAt: number | undefined): void
  /** Remove a task entirely (expired one-shot dropped on startup rebuild). */
  removeTask(id: string): void
}

/**
 * The host schedule heartbeat. `start` reconciles persisted deadlines once,
 * arms a single interval guarded by an idempotence check; `dispose` clears
 * it. Framework-free: runtime access flows through the injected faces, so
 * tests drive ticks directly.
 */
export class CronScheduler {
  private timer: ReturnType<typeof setInterval> | undefined
  private disposed = false
  private started = false
  private readonly tickMs: number

  /** @param deps - tasks/dispatcher faces. */
  constructor(private readonly deps: SchedulerDeps, tickMs = TICK_MS) {
    this.tickMs = tickMs
  }

  /** Start ticking (idempotent). */
  start(): void {
    if (this.disposed || this.started) return
    this.started = true
    // Startup reconciliation (reference pattern): recompute recurring
    // deadlines from NOW (fires missed while the host was down are skipped),
    // and drop expired one-shot entries (never fired late). Then the
    // immediate tick hands over anything still due.
    this.rebuildDeadlines()
    this.tick()
    this.timer = setInterval(() => { this.tick() }, this.tickMs)
    this.timer.unref?.()
  }

  /** Stop ticking (idempotent). */
  dispose(): void {
    if (this.disposed && this.timer === undefined) return
    this.disposed = true
    this.started = false
    if (this.timer !== undefined) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  /**
   * Reconcile persisted deadlines once per start (reference
   * `_rebuild_deadlines`): enabled recurring rules get their next match
   * computed from now (persisted when it changed); enabled one-shot rules
   * whose trigger has already passed are dropped (the entry never fires
   * late); fired one-shots (consumed) and disabled rules are left alone.
   */
  private rebuildDeadlines(): void {
    const now = this.deps.now?.() ?? Date.now()
    for (const task of this.deps.tasks()) {
      const schedule = task.schedule
      if (schedule === undefined || !schedule.enabled) continue
      if (schedule.recurring) {
        const next = nextRunAtMs(schedule.cron, now)
        // An impossible cron (no match within a year) stays inert rather
        // than dropping the task.
        if (next !== undefined && next !== schedule.nextRunAt) {
          this.deps.applyScheduleNextRun(task.id, next, schedule.lastTriggeredAt)
        }
        continue
      }
      // One-shot: fired (consumed) entries are awaiting their run's settle;
      // expired entries are dropped.
      if (schedule.nextRunAt === undefined) continue
      if (schedule.nextRunAt <= now) this.deps.removeTask(task.id)
    }
  }

  /** One due-check pass. Public so tests drive a check without waiting. */
  tick(): void {
    if (this.disposed) return
    const now = this.deps.now?.() ?? Date.now()
    const due: TaskRecord[] = []
    for (const task of this.deps.tasks()) {
      const schedule = task.schedule
      if (schedule === undefined || !schedule.enabled) continue
      if (schedule.nextRunAt === undefined || schedule.nextRunAt > now) continue
      due.push(task)
    }
    if (due.length === 0) return
    // The dispatcher executes each due task through the cron tool's run
    // action; while it is still busy with a previous batch, hold this one
    // (no inbox stacking).
    if (!this.deps.dispatcherIdle()) return
    for (const task of due) {
      const schedule = task.schedule
      if (schedule === undefined) continue
      if (schedule.recurring) {
        // Roll forward from the DUE instant, so the same tick never
        // double-fires and the next match is relative to the missed due time.
        const next = nextRunAtMs(schedule.cron, schedule.nextRunAt ?? now)
        this.deps.applyScheduleNextRun(task.id, next, schedule.nextRunAt)
      } else {
        // One-shot: the trigger is consumed when the run actually starts
        // (the run path), NOT here — a failed dispatch must leave the task
        // due so a later tick re-notifies it. The rule survives until the
        // run settles (the execution policy then removes the task).
      }
    }
    void this.deps.notifyDispatcher(due).catch(() => { /* next tick retries */ })
  }
}
