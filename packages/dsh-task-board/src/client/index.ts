/**
 * Task-board client plugin: wires the framework-free core (controller) to the
 * host task-board API and mounts the two DOM surfaces — the sidebar entry row
 * and the board view in the center column.
 *
 * The host owns persistence, scheduling, and execution: the browser store is
 * an API bridge, the scheduler is retired, and running a task triggers the
 * host runner while the board polls the ledger for the settled state.
 *
 * Failure policy: DOM mounting problems are logged, never thrown — the web
 * shell fails the whole boot when a plugin apply throws, and an external
 * plugin must not take the GUI down.
 */
import type { ClientContext, SessionId, SettingsScope, WorkspaceId } from '@deepseek-ai/dsh-client-runtime/client'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the locale plugin's Context merge (ctx.locale) and its
// LocaleNamespaceMap merge table.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the settings-surface Context merge (ctx.settingsScope).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import { BoardController } from '../core/controller.ts'
import { ApiTaskStore, TaskBoardApi } from './api.ts'
import { claimTaskboardApply, releaseTaskboardApply } from './apply-guard.ts'
import { mountBoard } from './board-mount.tsx'
import { mountSidebarEntry } from './sidebar-entry.ts'
import { TaskBoardSettingsCard, TaskBoardSettingsCardController, type TaskBoardSettings } from './TaskBoardSettingsCard.tsx'
import { en, zh, type TaskBoardKey } from './locales.ts'

/** Locale namespace this plugin owns. */
const NS = 'task-board'

/** Settings namespace the settings card edits (the Host plugin registers it). */
const TASK_BOARD_NS = 'task-board'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Task-board surface copy. */
    'task-board': TaskBoardKey
  }

  interface SlotMap {
    /**
     * The official rc.7 settings card slot. The key is the settings namespace
     * this card edits, so the settings-plugins tab can dispatch it safely.
     */
    'settings.plugin.item': { kind: 'keyed'; scope: 'root'; owner: SettingsPluginItemOwnerProps }
  }
}

/** Owner share of a plugin card (the section supplies nothing). */
export interface SettingsPluginItemOwnerProps {
  /** Marker field: card owner props are intentionally empty. */
  children?: never
}

/** Required services (fiber inject waiting — the runtime must be up first). */
export const inject = ['slots', 'sessions', 'workspaces', 'connection', 'settingsScope', 'locale', 'remote']

/**
 * Mount the task board.
 * @param ctx - client root context (services: sessions, workspaces).
 */
export function apply(ctx: ClientContext): void {
  // A duplicated client injection (module factory executed twice in one page
  // lifetime) would otherwise mount a second sidebar entry and board view.
  // First application wins; later calls become no-ops (see apply-guard.ts).
  if (!claimTaskboardApply()) return

  // Release the claim when this fiber unloads (the loader supports plugin
  // unloads / hot-reloads), so a rebuilt bundle can claim again in the same
  // page instead of being silently dropped.
  ctx.effect(() => releaseTaskboardApply, 'task-board: apply claim')

  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'task-board: dictionaries')

  // Plugin configuration card: one staged form over the `task-board` settings
  // namespace, contributed to the official rc.7 keyed settings slot.
  const settingsScope = ctx.settingsScope.bind<TaskBoardSettings>({ namespace: TASK_BOARD_NS })
  const settingsCard = new TaskBoardSettingsCardController(settingsScope)
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item',
    key: TASK_BOARD_NS,
    locale: NS,
    inject: () => settingsCard.inject(),
  }, TaskBoardSettingsCard))

  // The sidebar entry and board view mount once the settings scope settles;
  // while the scope is still loading, the composition default is unknown, so
  // nothing mounts yet. Only an unavailable scope (no settings surface served)
  // falls back to the composition default (enabled).
  let uiDisposer: (() => void) | undefined
  const mountUi = (): void => {
    if (uiDisposer !== undefined) return
    // The cordis Context `sessions` member is augmented by both the host
    // types (SessionStore) and the client types (ISessions) depending on
    // which packages the compilation graph pulls in; pin the client face the
    // board needs through a structural cast instead of relying on the merge.
    const sessions = ctx.sessions as unknown as {
      list: { getSnapshot(): { current: string | undefined }; subscribe(fn: () => void): () => void }
      open(id: string): void
    }
    const api = new TaskBoardApi()
    const store = new ApiTaskStore(api)

    // The board mounts once the host ledger is reachable (async initial load
    // includes the one-shot legacy localStorage migration).
    void store.refresh().then(() => {
      if (uiDisposer !== undefined) return
      const controller = new BoardController({
        store,
        exec: {
          run: (id, parentSessionId) => api.run(id, parentSessionId),
        },
        sessions: {
          list: sessions.list,
          open: id => sessions.open(id),
        },
      })
      controller.start()

      const disposers: Array<() => void> = []
      try {
        disposers.push(mountSidebarEntry(controller))
        disposers.push(mountBoard(controller))
      } catch (error) {
        // DOM failures degrade the board, never the GUI.
        console.error('[dsh-task-board] mount failed:', error)
      }

      uiDisposer = () => {
        for (const dispose of disposers.splice(0)) dispose()
        controller.dispose()
        uiDisposer = undefined
      }
    }).catch(error => {
      // The host API is unreachable (plugin host half not loaded): degrade
      // the board instead of failing the GUI boot.
      console.error('[dsh-task-board] host ledger unavailable; board disabled', error)
    })
  }
  const syncEnabled = (): void => {
    const snapshot = settingsScope.getSnapshot()
    const enabled = snapshot.status === 'ready'
      ? snapshot.value?.enabled ?? true
      : snapshot.status === 'unavailable'
    if (enabled) mountUi()
    else uiDisposer?.()
  }
  settingsScope.subscribe(syncEnabled)
  syncEnabled()
}
