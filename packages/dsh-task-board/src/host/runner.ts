/**
 * Host task runner: executes a board task through a real dsh agent session —
 * the host-side counterpart of the retired browser ExecutionService.
 *
 * Each run creates a fresh agent session (cwd = the task's workspace path),
 * joins it to a preset composition (the parent agent's composition when the
 * caller supplies one, otherwise the deployment default preset), sends the
 * task prompt as a plugin-sourced user message, waits for the agent to go
 * idle, and settles the run from the last `turn/end` reason. The session is
 * disposed afterwards; its transcript stays in the session log.
 *
 * All runnable surfaces (scheduler ticks and the manual Run button) go
 * through this class, so a scheduled task keeps executing even while no GUI
 * tab is open — the host process owns the scheduling and the session.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { TaskRecord } from '../core/tasks.ts'
import type { TaskBoardStore } from './store.ts'

/** Outcome of one run. */
export interface TaskRunResult {
  ok: boolean
  /** The execution session id (filled when a session was created). */
  sessionId: string | undefined
  /** Settled outcome when the turn ended. */
  result: 'succeeded' | 'failed' | 'cancelled' | undefined
  /** Human failure text. */
  error?: string
}

/** Preset ids tried (in order) when no parent agent supplies a composition. */
const DEFAULT_PRESET_CANDIDATES = ['standard', 'minimal'] as const

/** Last turn/end reason kinds that count as success. */
const SUCCESS_REASONS = new Set(['completed'])

/** Whether a turn/end reason kind counts as a failure. */
function isFailureReason(kind: string): boolean {
  return kind === 'error' || kind === 'max-tokens' || kind === 'interrupted'
}

/** Find the last `turn/end` reason in a session's event log. */
export function lastTurnEndReason(events: readonly { type: string; data: unknown }[]): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]
    if (event?.type !== 'turn/end') continue
    const data = event.data as { reason?: { kind?: string } } | null | undefined
    return data?.reason?.kind
  }
  return undefined
}

/** The runner dependencies (the services the plugin injects). */
export interface RunnerDeps {
  /** The agents registry (`ctx.agents`). */
  agents: {
    create(options: unknown): Promise<{ agent: Agent; dispose(): Promise<void> }>
    get(id: string): Agent | undefined
    withoutInitiator<T>(operation: () => Promise<T>): Promise<T>
  }
  /** The agent-presets registry (`ctx.agentPresets`), optional on minimal deployments. */
  presets: {
    composeFrom(agentCtx: Context, parentCtx: Context): string | undefined
    recompose(agentCtx: Context, id: string): Promise<unknown>
  } | undefined
  /** Workspace registry (`ctx.workspaceRegistry`) used as the cwd fallback. */
  workspaces: { list(): { path: string }[] }
  /** Logging seam. */
  warn(message: string): void
}

/**
 * The task runner. One instance per plugin apply; disposed with the plugin.
 */
export class TaskRunner {
  /**
   * @param ctx - the host plugin context (agents / agentPresets / workspaceRegistry).
   * @param store - the host store (execution records land here).
   * @param deps - injected service faces (structural for tests).
   */
  constructor(
    private readonly ctx: Context,
    private readonly store: TaskBoardStore,
    private readonly deps: RunnerDeps,
  ) {}

  /** The cwd an execution session runs in: the task's workspace, else the first registered workspace. */
  resolveWorkspacePath(task: TaskRecord): string | undefined {
    if (task.workspacePath !== undefined && task.workspacePath !== '') return task.workspacePath
    return this.deps.workspaces.list()[0]?.path
  }

  /**
   * Run a task to completion (or to a settled failure). Never rejects: every
   * failure path is reported through the result.
   * @param task - the task being executed (its latest execution record is the
   *   run's target; the caller opens it before invoking).
   * @param parentSessionId - optional live session whose agent composition the
   *   execution session should join (the board passes the user's current
   *   session; scheduler ticks pass nothing).
   * @returns the run outcome.
   */
  async run(task: TaskRecord, parentSessionId?: string): Promise<TaskRunResult> {
    const cwd = this.resolveWorkspacePath(task)
    if (cwd === undefined) {
      return { ok: false, sessionId: undefined, result: 'cancelled', error: 'no workspace available to run the task in' }
    }
    const presets = this.deps.presets
    let presetReady: Promise<unknown> = Promise.resolve()
    const setup = (childCtx: Context): void => {
      if (presets === undefined) return
      // 1) Inherit a live parent's composition when one is available.
      if (parentSessionId !== undefined) {
        const parent = this.deps.agents.get(parentSessionId)
        if (parent !== undefined && presets.composeFrom(childCtx, parent.ctx) !== undefined) return
      }
      // 2) Otherwise mount the deployment default preset (first bind = mount).
      presetReady = presets.recompose(childCtx, DEFAULT_PRESET_CANDIDATES[0])
        .catch((error: unknown) => {
          this.deps.warn(`task-board: failed to compose the execution preset: ${String(error)}`)
        })
    }

    try {
      const handle = await this.deps.agents.withoutInitiator(async () => {
        const created = await this.deps.agents.create({
          meta: { cwd },
          agentOptions: {},
          setup,
        })
        // The preset composition is asynchronous (reads the roster + mounts);
        // wait for it before waking the agent so the first prompt assembly
        // already sees the composed tools.
        await presetReady
        created.agent.followup(createUserMessage({
          content: [{ type: 'text', text: task.prompt.trim() !== '' ? task.prompt : task.title }],
          source: { kind: 'plugin', plugin: 'task-board' },
        }))
        await created.agent.whenIdle()
        return created
      })
      const sessionId = handle.agent.id
      const reason = lastTurnEndReason(handle.agent.session.events)
      await handle.dispose().catch(() => { /* teardown is best effort */ })
      if (reason === undefined) {
        return { ok: true, sessionId, result: 'cancelled', error: 'execution session ended without a turn' }
      }
      if (SUCCESS_REASONS.has(reason)) {
        return { ok: true, sessionId, result: 'succeeded' }
      }
      return {
        ok: false,
        sessionId,
        result: isFailureReason(reason) ? 'failed' : 'cancelled',
        error: isFailureReason(reason) ? `agent turn ended with reason: ${reason}` : `agent turn ended with reason: ${reason}`,
      }
    } catch (error) {
      return {
        ok: false,
        sessionId: undefined,
        result: 'cancelled',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
