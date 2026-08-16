/** Settings-backed inline theme layer for the official default surface. */

import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import {
  OFFICIAL_THEME_PRESETS,
  THEME_TOKEN_ALLOWLIST,
  deriveThemeTokens,
  normalizeCustomThemeSettings,
  normalizePalette,
  type CustomThemeSettings,
  type PaletteConfig,
  type ThemeMode,
  type ThemeTokenName,
} from '../core/theme.ts'

export interface CustomThemeSnapshot {
  status: 'loading' | 'ready' | 'unavailable'
  settings: CustomThemeSettings
  draft?: { mode: ThemeMode; palette: PaletteConfig }
  officialActive: boolean
  suspended: boolean
  writable: boolean
}

export interface CustomThemeHandle {
  getSnapshot(): CustomThemeSnapshot
  subscribe(listener: () => void): () => void
  setOfficialActive(active: boolean): void
  setActive(active: boolean): Promise<void>
  startTrial(mode: ThemeMode): void
  endTrial(): void
  preview(mode: ThemeMode, palette?: PaletteConfig): void
  save(mode: ThemeMode, palette: PaletteConfig): Promise<void>
  restoreDefaults(): Promise<void>
  suspend(): void
  resume(): void
  dispose(): void
}

interface InlineValue {
  value: string
  priority: string
}

function samePalette(left?: PaletteConfig, right?: PaletteConfig): boolean {
  if (left === undefined || right === undefined) return left === right
  return left.accent === right.accent
    && left.background === right.background
    && left.foreground === right.foreground
    && left.contrast === right.contrast
}

/** Owns every inline token it writes and restores the exact pre-controller values. */
export class CustomThemeController implements CustomThemeHandle {
  private readonly listeners = new Set<() => void>()
  private readonly originals = new Map<ThemeTokenName, InlineValue>()
  private canvasOriginal?: InlineValue
  private readonly unsubscribeScope: () => void
  private readonly observer?: MutationObserver
  private settings: CustomThemeSettings
  private draft?: { mode: ThemeMode; palette: PaletteConfig }
  private trialMode?: ThemeMode
  private officialActive: boolean
  private suspended = false
  private disposed = false
  private snapshot: CustomThemeSnapshot

  constructor(
    private readonly scope: SettingsScope<CustomThemeSettings>,
    private readonly body: HTMLElement = document.body,
    officialActive = false,
  ) {
    this.officialActive = officialActive
    this.settings = normalizeCustomThemeSettings(scope.getSnapshot().value)
    this.snapshot = this.makeSnapshot()
    this.unsubscribeScope = scope.subscribe(() => {
      this.settings = normalizeCustomThemeSettings(scope.getSnapshot().value)
      this.render()
    })
    const Observer = body.ownerDocument.defaultView?.MutationObserver
    if (Observer !== undefined) {
      this.observer = new Observer(() => this.render())
      this.observer.observe(body, {
        attributes: true,
        attributeFilter: ['data-ds-dark-theme'],
      })
    }
    this.render()
  }

  getSnapshot(): CustomThemeSnapshot { return this.snapshot }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  setOfficialActive(active: boolean): void {
    if (this.officialActive === active) return
    this.officialActive = active
    this.render()
  }

  async setActive(active: boolean): Promise<void> {
    const previous = this.settings
    try {
      await this.scope.set('version', 2)
      await this.scope.set('active', active)
    } catch {
      await this.rollback(previous)
      throw new Error('theme-settings-write-failed')
    }
    const published = normalizeCustomThemeSettings(this.scope.getSnapshot().value)
    if (published.active !== active) {
      await this.rollback(previous)
      throw new Error('theme-settings-write-failed')
    }
    this.settings = published
    this.render()
  }

  startTrial(mode: ThemeMode): void {
    this.trialMode = mode
    this.render()
  }

  endTrial(): void {
    if (this.trialMode === undefined && this.draft === undefined) return
    this.trialMode = undefined
    this.draft = undefined
    this.render()
  }

  preview(mode: ThemeMode, palette?: PaletteConfig): void {
    const normalized = palette === undefined ? undefined : normalizePalette(palette)
    this.draft = normalized === undefined ? undefined : { mode, palette: normalized }
    if (this.trialMode !== undefined) this.trialMode = mode
    this.render()
  }

  async save(mode: ThemeMode, palette: PaletteConfig): Promise<void> {
    const normalized = normalizePalette(palette)
    if (normalized === undefined) throw new Error('invalid-palette')
    const previous = this.settings
    try {
      await this.scope.set('version', 2)
      await this.scope.set('active', previous.active)
      await this.scope.set(mode, normalized)
    } catch {
      await this.rollback(previous)
      throw new Error('theme-settings-write-failed')
    }
    const published = normalizeCustomThemeSettings(this.scope.getSnapshot().value)
    if (!samePalette(published[mode], normalized)) {
      await this.rollback(previous)
      throw new Error('theme-settings-write-failed')
    }
    this.settings = published
    this.draft = undefined
    this.render()
  }

  async restoreDefaults(): Promise<void> {
    const previous = this.settings
    try {
      await this.scope.set('version', 2)
      await this.scope.set('active', previous.active)
      await this.scope.set('light', OFFICIAL_THEME_PRESETS.light)
      await this.scope.set('dark', OFFICIAL_THEME_PRESETS.dark)
    } catch {
      await this.rollback(previous)
      throw new Error('theme-settings-write-failed')
    }
    const published = normalizeCustomThemeSettings(this.scope.getSnapshot().value)
    if (!samePalette(published.light, OFFICIAL_THEME_PRESETS.light)
      || !samePalette(published.dark, OFFICIAL_THEME_PRESETS.dark)) {
      await this.rollback(previous)
      throw new Error('theme-settings-write-failed')
    }
    this.settings = published
    this.draft = undefined
    this.render()
  }

  suspend(): void {
    if (this.suspended) return
    this.suspended = true
    this.render()
  }

  resume(): void {
    if (!this.suspended) return
    this.suspended = false
    this.render()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribeScope()
    this.observer?.disconnect()
    this.restore()
    this.listeners.clear()
  }

  private mode(): ThemeMode {
    return this.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light'
  }

  private palette(): PaletteConfig | undefined {
    const mode = this.mode()
    if (this.draft?.mode === mode) return this.draft.palette
    if (this.settings.active || this.trialMode !== undefined) {
      return this.settings[mode] ?? OFFICIAL_THEME_PRESETS[mode]
    }
    return undefined
  }

  private capture(): void {
    if (this.originals.size !== 0) return
    this.canvasOriginal = {
      value: this.body.style.getPropertyValue('background-color'),
      priority: this.body.style.getPropertyPriority('background-color'),
    }
    for (const token of THEME_TOKEN_ALLOWLIST) {
      this.originals.set(token, {
        value: this.body.style.getPropertyValue(token),
        priority: this.body.style.getPropertyPriority(token),
      })
    }
  }

  private apply(palette: PaletteConfig): void {
    this.capture()
    const tokens = deriveThemeTokens(palette)
    this.body.style.setProperty('background-color', palette.background)
    for (const token of THEME_TOKEN_ALLOWLIST) this.body.style.setProperty(token, tokens[token])
  }

  private restore(): void {
    if (this.canvasOriginal !== undefined) {
      if (this.canvasOriginal.value === '') this.body.style.removeProperty('background-color')
      else this.body.style.setProperty('background-color', this.canvasOriginal.value, this.canvasOriginal.priority)
    }
    for (const [token, original] of this.originals) {
      if (original.value === '') this.body.style.removeProperty(token)
      else this.body.style.setProperty(token, original.value, original.priority)
    }
  }

  private async rollback(previous: CustomThemeSettings): Promise<void> {
    try {
      await this.scope.set('version', 2)
      await this.scope.set('active', previous.active)
      for (const mode of ['light', 'dark'] as const) {
        const palette = previous[mode]
        if (palette === undefined) await this.scope.unset(mode)
        else await this.scope.set(mode, palette)
      }
    } catch { /* expose the last published snapshot without masking the original failure */ }
    this.settings = normalizeCustomThemeSettings(this.scope.getSnapshot().value)
    this.render()
  }

  private render(): void {
    if (this.disposed) return
    const palette = this.palette()
    if (this.officialActive && !this.suspended && palette !== undefined) this.apply(palette)
    else this.restore()
    this.snapshot = this.makeSnapshot()
    for (const listener of this.listeners) listener()
  }

  private makeSnapshot(): CustomThemeSnapshot {
    const scope: SettingsScopeSnapshot<CustomThemeSettings> = this.scope.getSnapshot()
    const status = scope.status === 'ready' ? 'ready' : scope.status === 'unavailable' ? 'unavailable' : 'loading'
    return {
      status,
      settings: this.settings,
      ...(this.draft === undefined ? {} : { draft: this.draft }),
      officialActive: this.officialActive,
      suspended: this.suspended,
      writable: scope.writable,
    }
  }
}
