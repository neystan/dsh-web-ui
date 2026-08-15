/**
 * Host cron scheduler: a minute-granularity heartbeat in the host process
 * that triggers due scheduled tasks through the same execution path as the
 * manual Run button. Because the scheduler lives in the host, scheduled runs
 * keep firing while no GUI tab is open — the browser-side scheduler is
 * retired.
 *
 * Semantics mirror the retired browser scheduler: a task whose `nextRunAt`
 * is due is rolled forward to the next cron match (from the due instant,
 * never from the current instant) before triggering, so one tick can never
 * double-fire; a task still running at its due instant is skipped and waits
 * for the next cron match; missed runs are skipped, never queued.
 */

import { nextRunAtMs } from '../core/schedule.ts'
import type { TaskRecord } from '../core/tasks.ts'
import type { TaskBoardStore } from './store.ts'

/** Tick cadence (ms). */
export const TICK_MS = 60_000

/** The scheduler's trigger face (injected by the plugin root). */
export interface SchedulerDeps {
  /** Read the current task ledger. */
  tasks(): TaskRecord[]
  /** Clock; defaults to Date.now. */
  now?(): number
  /** Trigger one task's real execution; resolves true when accepted. */
  runTask(id: string): Promise<boolean>
  /** Persist a rolled-forward schedule (next due + trigger instant). */
  applyScheduleNextRun(id: string, nextRunAt: number | undefined, lastTriggeredAt: number | undefined): void
}

/**
 * The host schedule heartbeat. `start` arms a single interval guarded by an
 * idempotence check; `dispose` clears it. Framework-free: runtime access
 * flows through the injected faces, so tests drive ticks directly.
 */
export class CronScheduler {
  private timer: ReturnType<typeof setInterval> | undefined
  private disposed = false
  private started = false
  private readonly tickMs: number

  /** @param deps - tasks/trigger/apply faces. */
  constructor(private readonly deps: SchedulerDeps, tickMs = TICK_MS) {
    this.tickMs = tickMs
  }

  /** Start ticking (idempotent). */
  start(): void {
    if (this.disposed || this.started) return
    this.started = true
    // Immediate catch-up tick: schedules whose due instant passed while the
    // host was down are triggered as soon as the plugin mounts.
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

  /** One due-check pass. Public so tests drive a check without waiting. */
  tick(): void {
    if (this.disposed) return
    const now = this.deps.now?.() ?? Date.now()
    for (const task of this.deps.tasks()) {
      const schedule = task.schedule
      if (schedule === undefined || !schedule.enabled) continue
      if (schedule.nextRunAt === undefined || schedule.nextRunAt > now) continue
      // Roll forward first: from the DUE instant, so the same tick never
      // double-fires and the next match is relative to the missed due time.
      const next = nextRunAtMs(schedule.cron, schedule.nextRunAt)
      this.deps.applyScheduleNextRun(task.id, next, schedule.nextRunAt)
      void this.deps.runTask(task.id)
    }
  }
}
