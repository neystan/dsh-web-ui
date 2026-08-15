/**
 * dsh-task-board — host half. Mounts the host task store (`~/.dsh/task-board.json`),
 * the host task runner (real agent sessions), the host cron scheduler (fires
 * due tasks even without a GUI tab), the /api/task-board route family, the
 * agent tools (cron_create / cron_list / cron_pause / cron_resume /
 * cron_delete / cron_run + todo_add / todo_list / todo_done / todo_delete),
 * and a system-prompt announcement. The browser half (./client) renders the
 * board UI against the host ledger.
 *
 * The retired browser-side scheduler and localStorage ledger are replaced by
 * this host plane: scheduled runs survive tab closes, and tasks/todos are
 * shared between the board and every agent.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-system-prompt'
import type {} from '@deepseek-ai/dsh-tools'
import { applyScheduleNextRun } from './core/use-cases/task-schedule.ts'
import { CronScheduler } from './host/scheduler.ts'
import { executeTask } from './host/execution-service.ts'
import { TaskRunner } from './host/runner.ts'
import { makeRoutes } from './host/routes.ts'
import { TaskBoardStore } from './host/store.ts'
import { makeTools } from './host/tools.ts'

/** Stable cordis plugin name. */
export const name = 'task-board'

/** Services required before the host surfaces can mount. */
export const inject = ['webServer', 'tools', 'systemPrompt', 'agents', 'agentPresets', 'workspaceRegistry', 'settings']

/** Settings namespace of the board's announcement capability. */
export const TASK_BOARD_SETTINGS_NAMESPACE = settingsNamespace('task-board')

/** Plugin config, validated by the same-named schemastery schema. */
export interface Config {
  /** When true (default), a system-prompt section announces the board to every agent. */
  announceToAgent?: boolean
  /** Master switch for the plugin (host surfaces + browser half). */
  enabled?: boolean
  /** Cron tick cadence in ms (defaults to 60000). */
  schedulerTickMs?: number
}

export const Config: z<Config> = z.object({
  announceToAgent: z.boolean().default(true),
  enabled: z.boolean().default(true),
  schedulerTickMs: z.number().step(1).min(5_000).default(60_000),
})

/** Schema default, re-read for hand-built test contexts. */
const DEFAULT_ANNOUNCE = true

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 200

/** Model-facing announcement: plugin presence, capabilities, and limits. */
export const TASK_BOARD_GUIDANCE = '本机已安装 dsh-task-board 插件（DSH 任务看板 + 定时任务 + 待办）：侧边栏「任务看板」入口；数据与调度均在宿主进程（~/.dsh/task-board.json，关标签页照常执行）。能力：cron_create 创建定时任务（5 段 cron，如 0 23 * * *）、cron_list/cron_pause/cron_resume/cron_delete/cron_run 管理任务（真实 agent 会话执行，工作区为任务绑定路径）；todo_add/todo_list/todo_done/todo_delete 维护持久待办。限制：任务执行消耗 API 额度；cron 表达式须为 5 段（分 时 日 月 周）；执行会话使用部署默认预设（standard）。用户提到「任务看板 / 看板 / 定时任务 / cron / 待办 / todo」时即指本插件，请据此协作。'

/** The injected agents service surface (structural). */
interface AgentsService {
  create(options: unknown): Promise<{ agent: Agent; dispose(): Promise<void> }>
  get(id: string): Agent | undefined
  withoutInitiator<T>(operation: () => Promise<T>): Promise<T>
}

/** The injected agent-presets service surface (optional on minimal deployments). */
interface PresetsService {
  composeFrom(agentCtx: Context, parentCtx: Context): string | undefined
  recompose(agentCtx: Context, id: string): Promise<unknown>
}

/**
 * Mount the host surfaces: store, runner, scheduler, routes, tools, and the
 * announcement section.
 * @param ctx - host plugin context.
 * @param config - resolved plugin config.
 */
export function apply(ctx: Context, config?: Config): void {
  let current: () => Config = () => config ?? {}
  const resolve = (): Config => ({
    announceToAgent: current().announceToAgent ?? DEFAULT_ANNOUNCE,
    enabled: current().enabled ?? true,
    schedulerTickMs: current().schedulerTickMs ?? 60_000,
  })

  const store = new TaskBoardStore()
  const agents = ctx.get('agents') as AgentsService
  const presets = ctx.get('agentPresets') as PresetsService | undefined
  const runner = new TaskRunner(ctx, store, {
    agents: {
      create: options => agents.create(options),
      get: id => agents.get(id),
      withoutInitiator: operation => agents.withoutInitiator(operation),
    },
    presets: presets === undefined ? undefined : {
      composeFrom: (agentCtx, parentCtx) => presets.composeFrom(agentCtx, parentCtx),
      recompose: (agentCtx, id) => presets.recompose(agentCtx, id),
    },
    workspaces: {
      list: () => (ctx.get('workspaceRegistry') as { list(): { path: string }[] }).list(),
    },
    warn: message => ctx.logger?.warn?.(message),
  })

  const tools = makeTools({ store, runner })
  const routes = makeRoutes({ store, runner })

  let disposeScheduler: (() => void) | undefined
  let disposeRoutes: (() => void) | undefined
  let disposeTools: (() => void) | undefined
  let disposeSection: (() => void) | undefined

  /** Trigger one task through the shared orchestration (scheduler + tools share this). */
  const runTask = async (id: string): Promise<boolean> => {
    const task = store.tasks().find(candidate => candidate.id === id)
    if (task === undefined || task.status === 'running') return false
    void executeTask(store, runner, task)
    return true
  }

  /** Sync every surface to the current source (settings edits take effect live). */
  const sync = (): void => {
    disposeSection?.(); disposeSection = undefined
    disposeRoutes?.(); disposeRoutes = undefined
    disposeTools?.(); disposeTools = undefined
    disposeScheduler?.(); disposeScheduler = undefined
    const value = resolve()
    if (!value.enabled) return
    if (value.announceToAgent) {
      disposeSection = ctx.systemPrompt.section({
        name: 'plugin:task-board',
        order: SECTION_ORDER,
        text: TASK_BOARD_GUIDANCE,
      })
    }
    disposeRoutes = ctx.effect(
      () => {
        const disposers = routes.map(route => ctx.webServer.register(route))
        return () => { for (const dispose of disposers) dispose() }
      },
      'dsh-task-board: routes',
    )
    disposeTools = ctx.effect(
      () => {
        const disposers = tools.map(tool => ctx.tools.register(tool))
        return () => { for (const dispose of disposers) dispose() }
      },
      'dsh-task-board: tools',
    )
    const scheduler = new CronScheduler({
      tasks: () => store.tasks(),
      runTask,
      applyScheduleNextRun: (id, nextRunAt, lastTriggeredAt) => {
        store.replaceTasks(applyScheduleNextRun(store.tasks(), id, nextRunAt, lastTriggeredAt, Date.now()))
      },
    }, value.schedulerTickMs)
    scheduler.start()
    disposeScheduler = () => { scheduler.dispose() }
  }

  installSettingsSection(ctx, TASK_BOARD_SETTINGS_NAMESPACE, Config, config ?? {}, {
    setSource: (source) => {
      current = source
      sync()
    },
    onChange: sync,
  })

  // Initial registration from the composition entry.
  sync()

  ctx.effect(() => () => {
    disposeScheduler?.()
    disposeRoutes?.()
    disposeTools?.()
    disposeSection?.()
  }, 'dsh-task-board: surfaces')
}
