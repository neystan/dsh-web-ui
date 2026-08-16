/** Settings-backed global background mode, scrim, and skin-art suppression. */

import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import {
  BACKGROUND_REVISION,
  normalizeBackgroundSettings,
  type BackgroundMode,
  type BackgroundSettings,
} from '../core/background.ts'

export const SKIN_BACKGROUND_NS = 'skin-background'
export const OPACITY_FIELD = 'backgroundOpacity'
export const SCRIM_VAR = '--dsw-skin-scrim'

const BACKDROP_PROPS = [
  'background-image',
  'background-position',
  'background-size',
  'background-attachment',
  'background-repeat',
] as const

const ART_SELECTOR = '[data-skin-chrome="backdrop"], [data-skin-chrome="stage"]'
const API = '/api/skin-center/background'

interface InlineValue {
  value: string
  priority: string
}

export interface BackgroundSnapshot {
  settings: BackgroundSettings
  status: 'loading' | 'ready' | 'unavailable'
  writable: boolean
  missingImage: boolean
}

export interface BackgroundHandle {
  getSnapshot(): BackgroundSnapshot
  subscribe(listener: () => void): () => void
  setMode(mode: BackgroundMode): Promise<void>
  setOpacity(value: number): Promise<void>
  commitRevision(revision: string): Promise<void>
  deleteRevision(): Promise<void>
  reportMissingRevision(revision: string): void
  suspend(): void
  resume(): void
  reapply(): void
  dispose(): void
}

export class BackgroundController implements BackgroundHandle {
  private readonly listeners = new Set<() => void>()
  private readonly backdropOriginals = new Map<string, InlineValue>()
  private readonly artOriginals = new Map<HTMLElement, InlineValue>()
  private readonly scrimOriginal: InlineValue
  private readonly unsubscribeScope: () => void
  private readonly observer?: MutationObserver
  private settings: BackgroundSettings
  private missingRevision?: string
  private suspended = false
  private disposed = false
  private snapshot: BackgroundSnapshot

  constructor(
    private readonly scope: SettingsScope<BackgroundSettings>,
    private readonly body: HTMLElement = document.body,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.settings = normalizeBackgroundSettings(scope.getSnapshot().value)
    this.scrimOriginal = {
      value: body.style.getPropertyValue(SCRIM_VAR),
      priority: body.style.getPropertyPriority(SCRIM_VAR),
    }
    this.snapshot = this.makeSnapshot()
    this.unsubscribeScope = scope.subscribe(() => {
      this.settings = normalizeBackgroundSettings(scope.getSnapshot().value)
      if (this.settings.imageRevision !== this.missingRevision) this.missingRevision = undefined
      this.render(false)
    })
    const Observer = body.ownerDocument.defaultView?.MutationObserver
    if (Observer !== undefined) {
      this.observer = new Observer(() => this.render(true))
      this.observeBody()
    }
    this.render(false)
  }

  getSnapshot(): BackgroundSnapshot { return this.snapshot }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  async setMode(mode: BackgroundMode): Promise<void> {
    this.settings = { ...this.settings, mode }
    this.render(false)
    await this.scope.set('mode', mode)
  }

  async setOpacity(value: number): Promise<void> {
    const backgroundOpacity = Math.max(0, Math.min(100, Math.round(value)))
    this.settings = { ...this.settings, backgroundOpacity }
    this.render(false)
    await this.scope.set(OPACITY_FIELD, backgroundOpacity)
  }

  async commitRevision(revision: string): Promise<void> {
    if (!BACKGROUND_REVISION.test(revision)) throw new Error('invalid-background-revision')
    const previous = this.settings
    let published: BackgroundSettings
    try {
      published = await this.writeImageSettings(revision, 'custom')
    } catch {
      await this.rollbackImageSettings(previous, revision)
      throw new Error('background-settings-write-failed')
    }
    if (published.imageRevision !== revision || published.mode !== 'custom') {
      await this.rollbackImageSettings(previous, revision)
      throw new Error('background-settings-write-failed')
    }
    this.settings = published
    this.missingRevision = undefined
    this.render(false)
    if (previous.imageRevision !== undefined && previous.imageRevision !== revision) {
      await this.deleteAsset(previous.imageRevision, true)
    }
  }

  async deleteRevision(): Promise<void> {
    const previous = this.settings
    const revision = previous.imageRevision
    let published: BackgroundSettings
    try {
      published = await this.writeImageSettings(undefined, 'skin')
    } catch {
      await this.rollbackImageSettings(previous)
      throw new Error('background-settings-write-failed')
    }
    if (published.imageRevision !== undefined || published.mode !== 'skin') {
      await this.rollbackImageSettings(previous)
      throw new Error('background-settings-write-failed')
    }
    if (revision !== undefined) {
      try {
        await this.deleteAsset(revision, false)
      } catch (error) {
        // Keep the asset reachable so the user can retry deletion.
        await this.rollbackImageSettings(previous)
        throw error
      }
    }
    this.settings = published
    this.missingRevision = undefined
    this.render(false)
  }

  reportMissingRevision(revision: string): void {
    if (revision !== this.settings.imageRevision) return
    this.missingRevision = revision
    this.render(false)
  }

  suspend(): void {
    if (this.suspended) return
    this.suspended = true
    this.render(false)
  }

  resume(): void {
    if (!this.suspended) return
    this.suspended = false
    this.render(false)
  }

  reapply(): void { this.render(true) }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribeScope()
    this.observer?.disconnect()
    this.restoreBackdrop()
    this.restoreArt()
    this.restoreOn(this.body, SCRIM_VAR, this.scrimOriginal)
    this.listeners.clear()
  }

  private effectiveMode(): BackgroundMode {
    if (this.settings.mode === 'custom'
      && (this.settings.imageRevision === undefined || this.settings.imageRevision === this.missingRevision)) return 'skin'
    return this.settings.mode
  }

  private desiredBackdrop(mode: 'custom' | 'none'): ReadonlyMap<string, string> {
    if (mode === 'none') return new Map([['background-image', 'none']])
    const revision = this.settings.imageRevision as string
    const image = `url("${API}/${revision}.webp")`
    return new Map([
      ['background-image', `linear-gradient(rgba(0, 0, 0, var(${SCRIM_VAR})), rgba(0, 0, 0, var(${SCRIM_VAR}))), ${image}`],
      ['background-position', 'center'],
      ['background-size', 'cover'],
      ['background-attachment', 'fixed'],
      ['background-repeat', 'no-repeat'],
    ])
  }

  private render(observed: boolean): void {
    if (this.disposed) return
    // Edge 131 reports CSSOM writes even when the serialized value is
    // unchanged. Pause observation around controller-owned writes so they
    // cannot recursively schedule another render forever.
    this.observer?.disconnect()
    try {
      if (this.suspended) {
        this.restoreBackdrop()
        this.restoreArt()
        this.restoreOn(this.body, SCRIM_VAR, this.scrimOriginal)
      } else {
        const mode = this.effectiveMode()
        if (mode === 'skin') {
          this.restoreBackdrop()
          this.restoreArt()
          this.body.style.setProperty(SCRIM_VAR, String(this.settings.backgroundOpacity / 100))
        } else {
          const desired = this.desiredBackdrop(mode)
          if (this.backdropOriginals.size === 0) this.captureBackdrop()
          else if (observed) this.captureExternalBackdropWrites(desired)
          for (const [property, value] of desired) this.body.style.setProperty(property, value)
          if (mode === 'custom') this.body.style.setProperty(SCRIM_VAR, String(this.settings.backgroundOpacity / 100))
          else this.restoreOn(this.body, SCRIM_VAR, this.scrimOriginal)
          this.hideArt()
        }
      }
    } finally {
      if (!this.disposed) this.observeBody()
    }
    this.snapshot = this.makeSnapshot()
    for (const listener of this.listeners) listener()
  }

  private observeBody(): void {
    this.observer?.observe(this.body, {
      attributes: true,
      attributeFilter: ['style', 'data-ds-dark-theme'],
      childList: true,
    })
  }

  private captureBackdrop(): void {
    for (const property of BACKDROP_PROPS) {
      this.backdropOriginals.set(property, {
        value: this.body.style.getPropertyValue(property),
        priority: this.body.style.getPropertyPriority(property),
      })
    }
  }

  private captureExternalBackdropWrites(desired: ReadonlyMap<string, string>): void {
    for (const [property, expected] of desired) {
      const current = this.body.style.getPropertyValue(property)
      if (current !== expected) {
        this.backdropOriginals.set(property, {
          value: current,
          priority: this.body.style.getPropertyPriority(property),
        })
      }
    }
  }

  private restoreBackdrop(): void {
    for (const [property, original] of this.backdropOriginals) this.restoreOn(this.body, property, original)
    this.backdropOriginals.clear()
  }

  private hideArt(): void {
    for (const element of this.body.querySelectorAll<HTMLElement>(ART_SELECTOR)) {
      if (!this.artOriginals.has(element)) {
        this.artOriginals.set(element, {
          value: element.style.getPropertyValue('display'),
          priority: element.style.getPropertyPriority('display'),
        })
      }
      element.style.setProperty('display', 'none', 'important')
    }
  }

  private restoreArt(): void {
    for (const [element, original] of this.artOriginals) this.restoreOn(element, 'display', original)
    this.artOriginals.clear()
  }

  private restoreOn(element: HTMLElement, property: string, original: InlineValue): void {
    if (original.value === '') element.style.removeProperty(property)
    else element.style.setProperty(property, original.value, original.priority)
  }

  private async deleteAsset(revision: string, bestEffort: boolean): Promise<void> {
    try {
      const response = await this.fetcher(`${API}/${revision}.webp`, { method: 'DELETE' })
      if (!response.ok && !bestEffort) throw new Error('background-delete-failed')
    } catch {
      if (!bestEffort) throw new Error('background-delete-failed')
    }
  }

  private async writeImageSettings(
    revision: string | undefined,
    mode: BackgroundMode,
  ): Promise<BackgroundSettings> {
    if (revision === undefined) await this.scope.unset('imageRevision')
    else await this.scope.set('imageRevision', revision)
    await this.scope.set('mode', mode)
    return normalizeBackgroundSettings(this.scope.getSnapshot().value)
  }

  private async rollbackImageSettings(
    previous: BackgroundSettings,
    uploadedRevision?: string,
  ): Promise<void> {
    try {
      await this.writeImageSettings(previous.imageRevision, previous.mode)
    } catch { /* keep the last published snapshot and preserve any referenced asset */ }
    const rolledBack = normalizeBackgroundSettings(this.scope.getSnapshot().value)
    if (uploadedRevision !== undefined && rolledBack.imageRevision !== uploadedRevision) {
      await this.deleteAsset(uploadedRevision, true)
    }
    this.settings = rolledBack
    this.render(false)
  }

  private makeSnapshot(): BackgroundSnapshot {
    const scope: SettingsScopeSnapshot<BackgroundSettings> = this.scope.getSnapshot()
    const status = scope.status === 'ready' ? 'ready' : scope.status === 'unavailable' ? 'unavailable' : 'loading'
    return {
      settings: this.settings,
      status,
      writable: scope.writable,
      missingImage: this.settings.imageRevision !== undefined && this.settings.imageRevision === this.missingRevision,
    }
  }
}
