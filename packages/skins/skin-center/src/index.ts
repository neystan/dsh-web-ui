/**
 * Host half of the in-GUI skin center: mounts the `/api/skin-center/*` routes
 * the browser half uses for one-click apply / restore-official. Every switch
 * delegates to the `dsh-skin` CLI, which owns the `dsh-skin managed` section
 * of `~/.dsh/cordis.patch.yml` and the profile symlink; the DSH config
 * watcher hot-reloads the patch within seconds, so no restart is needed.
 * Try-on stays pure browser work (see src/client/try-on.ts).
 * @module @linxin666/dsh-client-ui-skin-center
 */

import { Context } from '@deepseek-ai/cordis'
import { dirname, join } from 'node:path'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from 'schemastery'
// Type-only: pulls the dsh-host-webserver service seat (ctx.webServer).
import type {} from '@deepseek-ai/dsh-host-webserver'
import { BackgroundAssetStore } from './background-store.ts'
import type { BackgroundMode } from './core/background.ts'
import { CUSTOM_THEME_NS, type PaletteConfig } from './core/theme.ts'
import { makeSkinCenterRoutes, SKIN_CENTER_API_PREFIX } from './routes.ts'
import { resolvePaths } from './skin-switch.ts'

export { makeSkinCenterRoutes, SKIN_CENTER_API_PREFIX } from './routes.ts'

/** Stable cordis plugin name (matches cordis.patch.yml insert id). */
export const name = 'ui-skin-center'

/** Services required before the skin-center can mount its routes. */
export const inject = ['webServer']

/**
 * Settings namespace for the main-interface background scrim, owned by the
 * skin center. The browser half spells the same string so it can bind the
 * scope without depending on this Host package.
 */
export const SKIN_BACKGROUND_NAMESPACE = settingsNamespace('skin-background')

/** Settings namespace for the compact official-default theme editor. */
export const CUSTOM_THEME_NAMESPACE = settingsNamespace(CUSTOM_THEME_NS)

const PaletteConfigSchema: z<PaletteConfig> = z.object({
  accent: z.string().pattern(/^#[0-9A-F]{6}$/),
  background: z.string().pattern(/^#[0-9A-F]{6}$/),
  foreground: z.string().pattern(/^#[0-9A-F]{6}$/),
  contrast: z.number().min(0).max(100).step(1),
})

export interface CustomThemeConfig {
  version?: number
  active?: boolean
  light?: PaletteConfig
  dark?: PaletteConfig
}

/** Runtime schema for the independently selectable custom theme. */
export const CustomThemeConfigSchema: z<CustomThemeConfig> = z.object({
  version: z.number().min(1).max(2).step(1).default(2),
  active: z.boolean().default(false),
  light: z.union([PaletteConfigSchema, z.const(undefined)]),
  dark: z.union([PaletteConfigSchema, z.const(undefined)]),
})

/** Plugin-configuration fields for the main-interface background. */
export interface SkinBackgroundConfig {
  version?: number
  mode?: BackgroundMode
  backgroundOpacity?: number
  imageRevision?: string
}

/** Runtime schema for SkinBackgroundConfig. */
export const SkinBackgroundConfigSchema: z<SkinBackgroundConfig> = z.object({
  version: z.number().min(1).max(1).step(1).default(1),
  mode: z.union([z.const('skin'), z.const('custom'), z.const('none')]).default('skin'),
  backgroundOpacity: z.number().min(0).max(100).step(5).default(0),
  imageRevision: z.union([z.string().pattern(/^[a-f0-9]{64}$/), z.const(undefined)]),
})

/**
 * Register the skin-center API routes.
 *
 * Failure policy: route mounting problems are logged, never thrown — the web
 * shell fails the whole boot when a plugin apply throws, and the skin center
 * must not take the GUI down.
 * @param ctx - cordis context.
 */
export function apply(ctx: Context): void {
  // Optional-settings wiring for the background scrim namespace. The browser
  // half binds the scope and applies the value to the body CSS variable;
  // this side just declares the namespace + schema so the value persists and
  // re-resolves across reloads. installSettingsSection is a no-op when no
  // settings service is mounted (pure skin-center installs skip it).
  installSettingsSection(ctx, SKIN_BACKGROUND_NAMESPACE, SkinBackgroundConfigSchema, {}, {
    setSource: () => { /* application is browser-side; value is read from the scope */ },
    onChange: () => { /* browser half re-applies on scope publish */ },
  })
  installSettingsSection(ctx, CUSTOM_THEME_NAMESPACE, CustomThemeConfigSchema, {}, {
    setSource: () => { /* application is browser-side; value is read from the scope */ },
    onChange: () => { /* browser half re-applies on scope publish */ },
  })

  let backgrounds: BackgroundAssetStore | undefined
  try {
    backgrounds = new BackgroundAssetStore(join(dirname(resolvePaths().patchPath), 'skin-center', 'assets'))
    void backgrounds.cleanupTempFiles().catch(() => {
      console.error('[ui-skin-center] background temp cleanup failed')
    })
  } catch {
    console.error('[ui-skin-center] background storage unavailable')
  }
  const routes = makeSkinCenterRoutes({ backgrounds })
  try {
    ctx.effect(() => {
      const disposers: Array<() => void> = []
      try {
        for (const route of routes) disposers.push(ctx.webServer.register(route))
      } catch (error) {
        // Roll back whatever registered before the failure so a partial
        // mount never leaves half a route family live; the outer catch logs.
        for (const dispose of disposers) dispose()
        throw error
      }
      return () => { for (const dispose of disposers) dispose() }
    }, 'ui-skin-center: routes')
  } catch (error) {
    console.error('[ui-skin-center] route registration failed:', error)
  }
}
