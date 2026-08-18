/**
 * Browser half of the describe-image plugin: no composer chrome of its own.
 * The shell's input box has no image entry for text-only models, so image
 * sends are rewritten at submit time (installSendHook) into describe-image
 * references before they reach the model — the way a text-only model gets an
 * image to analyze without the shell's vision pipeline. The settings card is
 * rendered by the web GUI's built-in plugin config page from the host-side
 * `describe-image` section.
 *
 * Failure policy: every DOM/runtime wiring failure is logged, never thrown —
 * the web shell fails the whole boot when a plugin apply throws.
 * @module @neystan/dsh-tool-describe-image/client
 */

import type { ClientContext, SettingsScope } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { installSendHook } from './send-hook.ts'
import { DescribeImageSettingsCard, DescribeImageSettingsCardController, type DescribeImageSettings } from './DescribeImageSettingsCard.tsx'
import { dictionaries, setLanguage, type DescribeImageClientKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The describe-image attach button copy. */
    'describe-image': DescribeImageClientKey
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

/** Locale namespace of the browser half. */
export const NS = 'describe-image' as const

/** Required services: slots for the settings card, conversation for the send hook, settings scope and locale for the card copy. */
export const inject = ['slots', 'conversation', 'settingsScope', 'locale']

/** Apply the browser half. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, dictionaries), 'dsh-tool-describe-image: dictionaries')
  ctx.effect(() => {
    // Mirror the shell language into the module-level dictionary switch.
    const sync = (): void => {
      const lang = document.documentElement.lang
      setLanguage(lang === 'zh' || lang.startsWith('zh-') ? 'zh' : 'en')
    }
    sync()
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] })
    return () => observer.disconnect()
  }, 'dsh-tool-describe-image: language mirror')

  ctx.inject(['slots', 'conversation'], (scope: ClientContext) => {
    const conversation = scope.conversation
    const slots = scope.slots

    // Text-only models reject image blocks at submit: rewrite image-bearing
    // sends into describe-image references before they reach the model.
    installSendHook(conversation)

    // The settings card: bound to the describe-image namespace through the
    // family bridge when the official scope does not expose it.
    ctx.inject(['settingsScope'], (settingsCtx: ClientContext) => {
      const settingsScope = settingsCtx.settingsScope.bind<DescribeImageSettings>({ namespace: NS })
      const settingsCard = new DescribeImageSettingsCardController(settingsScope)
      slots.inject('settings.plugin.item', () =>
        slots.register({
          name: 'settings.plugin.item',
          key: NS,
          locale: NS,
          inject: () => settingsCard.inject(),
        }, DescribeImageSettingsCard))
    })
  })
}
