/**
 * Host task runner: executes a board task through a real dsh agent session —
 * the host-side counterpart of the retired browser ExecutionService.
 *
 * Every task owns ONE stable session (`cron-<taskId>`) inside a dedicated
 * cron workspace (`~/.dsh/cron-workspace`, auto-created on first use): the
 * session is reused across scheduled runs (live → persisted resume → fresh
 * create), its title is pinned to the task title, and the session is NOT
 * disposed so it stays visible in the workspace. Each run sends an
 * isolation preamble before the task prompt, so a recurring task executes
 * against a clean context every time — the history stays, but the agent is
 * told to ignore it.
 *
 * All runnable surfaces (scheduler ticks and the manual Run button) go
 * through this class, so a scheduled task keeps executing even while no GUI
 * tab is open — the host process owns the scheduling and the session.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
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

/** The deployment default preset mounted when no parent agent supplies a composition. */
const DEFAULT_PRESET_ID = 'standard'

/** The dedicated cron workspace path (under the harness home). */
export function cronWorkspacePath(): string {
  return join(homedir(), '.dsh', 'cron-workspace')
}

/** The dispatcher session id: the fixed session whose agent drives scheduled runs via the cron tool's run action. */
export const DISPATCHER_SESSION_ID = 'cron-dispatcher'

/** Short stable hash of a cwd, used to namespace task sessions per workspace. */
export function cwdHash(cwd: string): string {
  let hash = 5381
  for (let index = 0; index < cwd.length; index += 1) {
    hash = ((hash << 5) + hash + cwd.charCodeAt(index)) >>> 0
  }
  return hash.toString(36).slice(0, 8)
}

/**
 * Stable session id for one task's execution session, namespaced by the
 * workspace: `cron-<taskId>@<cwdHash8>`. Changing the workspace yields a
 * fresh session (each workspace keeps its own per-task session), and the
 * hash pins the cwd the session was created under.
 */
export function taskSessionId(taskId: string, cwd: string): string {
  return `cron-${taskId}@${cwdHash(cwd)}`
}

/**
 * The isolation preamble prepended to every run's prompt: a recurring task
 * must execute against a clean context even though it shares one session.
 */
export function isolationPreamble(title: string, prompt: string): string {
  return [
    `这是定时任务「${title}」的一次执行。请忽略本次执行之前的所有对话内容，不要引用历史消息，只根据下面的指令完成本次任务。`,
    '',
    prompt,
  ].join('\n')
}

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
    resume(options: unknown): Promise<{ agent: Agent; dispose(): Promise<void> }>
    get(id: string): Agent | undefined
    withoutInitiator<T>(operation: () => Promise<T>): Promise<T>
  }
  /** The agent-presets registry (`ctx.agentPresets`), optional on minimal deployments. */
  presets: {
    composeFrom(agentCtx: Context, parentCtx: Context): string | undefined
    recompose(agentCtx: Context, id: string): Promise<unknown>
  } | undefined
  /** Deployment default model (`ctx.agentDefaultModel`), optional on minimal deployments. */
  defaultModel: {
    currentSelection(): { provider: string; model: string; reasoningEffort?: string } | undefined
  } | undefined
  /** Workspace registry (`ctx.workspaceRegistry`). */
  workspaces: {
    list(): { path: string }[]
    create(path: string, title: string): Promise<unknown>
    /**
     * Attach an existing session to the workspace owning `cwd` (the registry
     * only accounts sessions attached through it — sessions created via the
     * agents registry are otherwise invisible to workspace grouping).
     */
    attachSession?(cwd: string, sessionId: string): Promise<unknown>
  }
  /** Session-title service (`ctx.sessionTitle`), optional. */
  sessionTitle: {
    rename(session: unknown, title: string): unknown
  } | undefined
  /** Logging seam. */
  warn(message: string): void
}

/**
 * The task runner. One instance per plugin apply; disposed with the plugin.
 */
export class TaskRunner {
  /** Whether the cron workspace was ensured this apply (canonical path once known). */
  private cronWorkspaceEnsured: string | undefined = undefined

  /**
   * @param ctx - the host plugin context.
   * @param store - the host store (execution records land here).
   * @param deps - injected service faces (structural for tests).
   */
  constructor(
    private readonly ctx: Context,
    private readonly store: TaskBoardStore,
    private readonly deps: RunnerDeps,
  ) {}

  /**
   * Ensure the dedicated cron workspace exists: create the directory first
   * (the workspace registry rejects a nonexistent path), then register it.
   * Returns the CANONICAL registered path (realpath-normalized by the
   * registry) so session cwds match the workspace identity byte for byte —
   * string-compared on Windows, a mismatched case would orphan sessions into
   * "未分组". A failure is NOT cached, so the next run retries.
   * @returns the canonical cron workspace path.
   */
  async ensureCronWorkspace(): Promise<string> {
    if (this.cronWorkspaceEnsured !== undefined) return this.cronWorkspaceEnsured
    const path = cronWorkspacePath()
    try {
      mkdirSync(path, { recursive: true })
      const known = this.deps.workspaces.list().some(workspace => workspace.path === path)
      if (!known) {
        await this.deps.workspaces.create(path, 'cron-workspace')
      }
      // Re-read the registry: the entity carries the canonical path (the
      // create input was realpath-normalized; reuse that exact spelling).
      const canonical = this.deps.workspaces.list().find(workspace => workspace.path === path)?.path ?? path
      this.cronWorkspaceEnsured = canonical
    } catch (error) {
      // A failed workspace creation is not fatal: the execution still runs
      // with the workspace path as its cwd, and the next run retries.
      this.deps.warn(`task-board: failed to ensure the cron workspace: ${String(error)}`)
    }
    return this.cronWorkspaceEnsured ?? path
  }

  /**
   * The cwd an execution session runs in: the task's workspace, else the
   * dedicated cron workspace (never an arbitrary first workspace).
   */
  async resolveWorkspacePath(task: TaskRecord): Promise<string> {
    if (task.workspacePath !== undefined && task.workspacePath !== '') return task.workspacePath
    return this.ensureCronWorkspace()
  }

  /**
   * The model options for an execution session: the parent agent's selection
   * when one is available, otherwise the deployment default model. The prompt
   * assembly interpolates `{{model}}` from the agent's selection, so an
   * empty agentOptions fails every assembly ("prompt variable {{model}} has
   * no value").
   */
  resolveModelOptions(parentSessionId: string | undefined): { provider?: string; model?: string; maxTokens?: number } {
    if (parentSessionId !== undefined) {
      const parent = this.deps.agents.get(parentSessionId)
      if (parent !== undefined) {
        const options = parent.options as { provider?: string; model?: string; maxTokens?: number }
        if (options.provider !== undefined && options.model !== undefined) {
          return { provider: options.provider, model: options.model, ...(options.maxTokens !== undefined ? { maxTokens: options.maxTokens } : {}) }
        }
      }
    }
    const fallback = this.deps.defaultModel
    // Defensive: the service face may resolve to a non-service object on
    // some deployments; only trust it when it actually carries the method.
    if (fallback !== undefined && typeof fallback.currentSelection === 'function') {
      try {
        const selection = fallback.currentSelection()
        if (selection !== undefined && selection.provider !== undefined && selection.model !== undefined) {
          return { provider: selection.provider, model: selection.model }
        }
      } catch (error) {
        this.deps.warn(`task-board: failed to read the default model: ${String(error)}`)
      }
    }
    return {}
  }

  /**
   * Acquire (live reuse → persisted resume → fresh create) the session for
   * one id, composing the preset and waiting for the composition to settle.
   * @param sessionId - the stable session id.
   * @param cwd - the session's working directory.
   * @param parentSessionId - optional live parent whose composition/model to inherit.
   * @returns the agent handle (never disposed by the runner — sessions persist).
   */
  private async acquireSession(
    sessionId: string,
    cwd: string,
    parentSessionId?: string,
  ): Promise<{ agent: Agent; dispose(): Promise<void> }> {
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
      presetReady = presets.recompose(childCtx, DEFAULT_PRESET_ID)
        .catch((error: unknown) => {
          this.deps.warn(`task-board: failed to compose the execution preset: ${String(error)}`)
        })
    }
    const agentOptions = this.resolveModelOptions(parentSessionId)

    return this.deps.agents.withoutInitiator(async () => {
      // 1) Reuse the live session when it is still mounted.
      const live = this.deps.agents.get(sessionId)
      if (live !== undefined) {
        await this.attachSession(cwd, sessionId)
        return { agent: live, dispose: async () => { /* kept mounted */ } }
      }
      // 2) Resume the persisted session (survives host restarts).
      try {
        const resumed = await this.deps.agents.resume({
          resumeSessionId: sessionId,
          agentOptions,
          setup,
        })
        await presetReady
        await this.attachSession(cwd, sessionId)
        return resumed
      } catch {
        // Never created (or persistence unavailable): create fresh below.
      }
      // 3) Create the session fresh.
      const created = await this.deps.agents.create({
        sessionId,
        meta: { cwd },
        agentOptions,
        setup,
      })
      await presetReady
      await this.attachSession(cwd, sessionId)
      return created
    })
  }

  /**
   * Register a task session with the workspace owning `cwd`. The workspace
   * registry only accounts sessions attached through it (the HTTP API does
   * this on its own creation path; sessions created through the agents
   * registry — ours — are otherwise invisible to workspace grouping, i.e.
   * they never show up under the cron workspace in the UI). Idempotent, and
   * failures only warn: a session that cannot be attached stays usable, it
   * just falls back to ungrouped display.
   */
  private async attachSession(cwd: string, sessionId: string): Promise<void> {
    const attach = this.deps.workspaces.attachSession
    if (attach === undefined) return
    try {
      await attach(cwd, sessionId)
    } catch (error) {
      this.deps.warn(`task-board: failed to attach session '${sessionId}' to workspace '${cwd}': ${String(error)}`)
    }
  }

  /**
   * Ensure the dispatcher session exists (the fixed session whose agent
   * decides scheduled runs by calling the cron tool's run action). Title
   * pinned and kept mounted like every task session.
   */
  async ensureDispatcherSession(): Promise<void> {
    const cwd = await this.ensureCronWorkspace()
    try {
      const handle = await this.acquireSession(DISPATCHER_SESSION_ID, cwd)
      if (this.deps.sessionTitle !== undefined) {
        try {
          this.deps.sessionTitle.rename(handle.agent.session, '定时调度器')
        } catch {
          /* title pinning is cosmetic */
        }
      }
    } catch (error) {
      this.deps.warn(`task-board: failed to ensure the dispatcher session: ${String(error)}`)
    }
  }

  /**
   * Whether the dispatcher agent is idle (a previous dispatch has settled),
   * so a new due batch can be handed over without stacking inbox messages.
   */
  dispatcherIdle(): boolean {
    const dispatcher = this.deps.agents.get(DISPATCHER_SESSION_ID)
    return dispatcher === undefined || dispatcher.status === 'idle'
  }

  /**
   * Hand a batch of due tasks to the dispatcher agent: one message listing
   * every due task; the dispatcher LLM executes each by calling the cron
   * tool's run action.
   */
  async notifyDispatcher(due: readonly TaskRecord[]): Promise<void> {
    const dispatcher = this.deps.agents.get(DISPATCHER_SESSION_ID)
    if (dispatcher === undefined) {
      await this.ensureDispatcherSession()
    }
    const agent = this.deps.agents.get(DISPATCHER_SESSION_ID)
    if (agent === undefined) {
      this.deps.warn('task-board: dispatcher session unavailable; due tasks wait for the next tick')
      return
    }
    const lines = due.map(task => {
      const kind = task.schedule?.recurring === true ? '周期任务' : '一次性任务'
      return `- ${task.title}（id: ${task.id}，${kind}）`
    })
    agent.followup(createUserMessage({
      content: [{
        type: 'text',
        text: `以下定时任务已到期，请逐个调用 cron 工具执行（action=run，参数 id 使用任务 id），不要遗漏：\n${lines.join('\n')}`,
      }],
      source: { kind: 'plugin', plugin: 'task-board' },
    }))
  }

  /**
   * Run a task to completion (or to a settled failure). Never rejects: every
   * failure path is reported through the result.
   * @param task - the task being executed (its latest execution record is the
   *   run's target; the caller opens it before invoking).
   * @param parentSessionId - optional live session whose agent composition and
   *   model the execution session should inherit (the board passes the user's
   *   current session; scheduler ticks pass nothing).
   * @returns the run outcome.
   */
  async run(task: TaskRecord, parentSessionId?: string): Promise<TaskRunResult> {
    const cwd = await this.resolveWorkspacePath(task)
    const sessionId = taskSessionId(task.id, cwd)

    try {
      const handle = await this.acquireSession(sessionId, cwd, parentSessionId)

      // Pin the session title to the task title (each task owns one session).
      if (this.deps.sessionTitle !== undefined) {
        try {
          this.deps.sessionTitle.rename(handle.agent.session, task.title)
        } catch {
          /* title pinning is cosmetic */
        }
      }

      // One message per run: the isolation preamble + the task prompt, so a
      // recurring task executes against a clean context every time.
      const prompt = task.prompt.trim() !== '' ? task.prompt : task.title
      handle.agent.followup(createUserMessage({
        content: [{ type: 'text', text: isolationPreamble(task.title, prompt) }],
        source: { kind: 'plugin', plugin: 'task-board' },
      }))
      await handle.agent.whenIdle()

      const reason = lastTurnEndReason(handle.agent.session.events)
      // The session stays mounted (per-task stable session); only the run
      // outcome is reported. The caller settles the execution record.
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
        error: `agent turn ended with reason: ${reason}`,
      }
    } catch (error) {
      return {
        ok: false,
        sessionId,
        result: 'cancelled',
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
}
