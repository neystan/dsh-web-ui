/**
 * The skin-center plugin card: one disclosure card inside the Web UI plugin
 * group (插件配置 → Web UI 插件), listing every installed skin plus the
 * official stock look. Live try-on executes the real bundle inside the GUI
 * (light/dark preview, full restore on exit); Apply is one click — the host
 * half runs `dsh-skin use` through /api/skin-center/apply, the config
 * watcher hot-reloads the patch, and the page reloads into the new skin.
 * Copy rides the standard `t` seat; the theme preview control drives the
 * official theme service (persisted, same as the Appearance row).
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ThemeSnapshot } from '@deepseek-ai/dsh-client-ui-theme/client'
import {
  CUSTOM_THEME_ID,
  OFFICIAL_THEME_ID,
  OFFICIAL_THEME_PRESETS,
  resolveActiveThemeId,
  themeApplyTarget,
  type ThemeMode,
} from '../core/theme.ts'
import { SKIN_CENTER_ENTRIES, type SkinCenterEntry } from './generated/skins.ts'
import { manifestHasSkin } from './manifest.ts'
import type { BackgroundHandle } from './background.ts'
import type { CustomThemeHandle } from './custom-theme.ts'
import { BackgroundEditor } from './BackgroundEditor.tsx'
import { CustomThemeEditor } from './CustomThemeEditor.tsx'
import { activeSkinEntry, TryOnController } from './try-on.ts'
import css from './skin-center.module.css'

/** Business face the skin-center apply() injects into the card. */
export interface SkinCenterInjected {
  controller: TryOnController
  customTheme: CustomThemeHandle
  theme: {
    getTheme(): ThemeSnapshot
    subscribe(listener: () => void): () => void
    setTheme(id: 'light' | 'dark'): void
  }
  background: BackgroundHandle
}

/** Plugin-card component props: group-item runtime share + locale seat + injected face. */
export type SkinCenterComponentProps =
  PropsRuntime<'web-ui.plugin.item'> & PropsLocale<'skinCenter'> & SkinCenterInjected

/** Bring the editor into view without scrolling the settings dialog header away. */
export function revealThemeEditor(root: Document = document): void {
  const title = root.getElementById('skin-center-theme-title')
  title?.scrollIntoView({ block: 'nearest' })
  title?.focus({ preventScroll: true })
}

export type AppearanceSection = 'skins' | 'theme' | 'background'

/** Keep customization compact while preserving background controls for every skin. */
export function appearanceSections(editingTheme: boolean): readonly AppearanceSection[] {
  return editingTheme ? ['theme'] : ['skins', 'background']
}

/** The visible theme count excludes the separate official stock entry. */
export function skinThemeCount(installedCount: number): number {
  return installedCount + 1
}

/** Translate a card identity into the existing host API and confirmation target. */
export function applyRequestFor(themeId: string): {
  body: { official: true } | { skin: string }
  confirmationTarget: string
} {
  const { hostTarget } = themeApplyTarget(themeId)
  return {
    body: hostTarget === OFFICIAL_THEME_ID ? { official: true } : { skin: hostTarget },
    confirmationTarget: hostTarget,
  }
}

/** Enter custom try-on through the same official-surface session used by stock preview. */
export function beginCustomTryOn(
  controller: Pick<TryOnController, 'tryOnOfficial'>,
  theme: Pick<CustomThemeHandle, 'startTrial'>,
  mode: ThemeMode,
): void {
  controller.tryOnOfficial()
  theme.startTrial(mode)
}

/** End custom-only state before the shared controller restores the previous surface. */
export function finishTryOn(
  controller: Pick<TryOnController, 'exit'>,
  theme: Pick<CustomThemeHandle, 'endTrial' | 'setOfficialActive'>,
  custom: boolean,
  restoreOfficialSurface: boolean,
): void {
  if (custom) theme.endTrial()
  theme.setOfficialActive(restoreOfficialSurface)
  controller.exit()
}

/**
 * Render the skin-center card: a disclosure header naming the plugin, with
 * the skin list (official default + every installed skin; try-on / theme
 * preview / one-click apply) inside its body.
 * @param props - card props.
 * @returns the plugin card.
 */
export function SkinCenter({ t, controller, customTheme, theme, background }: SkinCenterComponentProps) {
  const snapshot = useSyncExternalStore(theme.subscribe, theme.getTheme)
  const customSnapshot = useSyncExternalStore(customTheme.subscribe.bind(customTheme), customTheme.getSnapshot.bind(customTheme))
  const activeEntry = activeSkinEntry()
  const activePackage = activeEntry?.package
  const activeId = resolveActiveThemeId(activeEntry?.id, customSnapshot.settings.active)
  const [open, setOpen] = useState(false)
  const [tryingId, setTryingId] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingTheme, setEditingTheme] = useState(false)
  const [editingStartedTrial, setEditingStartedTrial] = useState(false)
  const restoreMode = useRef<ThemeMode>('light')
  const themeMode: ThemeMode = snapshot.active.colorScheme === 'dark' ? 'dark' : 'light'
  const sections = appearanceSections(editingTheme)
  // Unmount guard for the confirmation poll: once the card is gone, the
  // pending timers must stop and no reload / setState may fire.
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    const officialSurface = tryingId === OFFICIAL_THEME_ID
      || tryingId === CUSTOM_THEME_ID
      || (tryingId === null && activePackage === undefined)
    customTheme.setOfficialActive(officialSurface)
    if (officialSurface && tryingId !== OFFICIAL_THEME_ID) customTheme.resume()
    else customTheme.suspend()
  }, [activePackage, tryingId, customTheme])

  const tryOn = (entry: SkinCenterEntry): void => {
    setError(null)
    if (tryingId === CUSTOM_THEME_ID) customTheme.endTrial()
    void controller.tryOn(entry)
      .then(() => {
        setTryingId(entry.id)
      })
      .catch(() => {
        // The controller may have torn down a previous session before the
        // load failed; reset both flags so no stale "trying on" lingers.
        setError(t('tryOnError'))
        setTryingId(null)
      })
  }

  const tryOnOfficial = (): void => {
    setError(null)
    try {
      if (tryingId === CUSTOM_THEME_ID) customTheme.endTrial()
      controller.tryOnOfficial()
    } catch {
      setError(t('tryOnError'))
      return
    }
    setTryingId(OFFICIAL_THEME_ID)
  }

  const tryOnCustom = (): void => {
    setError(null)
    try {
      beginCustomTryOn(controller, customTheme, themeMode)
    } catch {
      setError(t('tryOnError'))
      return
    }
    setTryingId(CUSTOM_THEME_ID)
  }

  const exitTryOn = (): void => {
    finishTryOn(
      controller,
      customTheme,
      tryingId === CUSTOM_THEME_ID,
      activePackage === undefined,
    )
    setTryingId(null)
  }

  /**
   * Poll the host state until the config watcher reports the target active
   * (the patch write lands before the watcher re-applies it), or time out.
   * @param target - skin id, or `official` for the stock look.
   * @returns whether the target became active within the poll budget.
   */
  const confirmActive = (target: string): Promise<boolean> =>
    new Promise(resolve => {
      const expected = target === OFFICIAL_THEME_ID ? 'none' : target
      let tries = 0
      const tick = (): void => {
        if (!mounted.current) {
          resolve(false)
          return
        }
        tries += 1
        void fetch('/api/skin-center/state')
          .then(async response => {
            const payload = await response.json().catch(() => null) as { ok?: boolean; active?: string } | null
            if (response.ok && payload?.ok === true && payload.active === expected) {
              resolve(true)
              return
            }
            if (tries >= 20 || !mounted.current) resolve(false)
            else window.setTimeout(tick, 250)
          })
          .catch(() => {
            if (tries >= 20 || !mounted.current) resolve(false)
            else window.setTimeout(tick, 250)
          })
      }
      tick()
    })

  /**
   * Poll the served GUI document until the boot manifest actually enables
   * the target (the config watcher regenerates it asynchronously after the
   * patch write — reloading earlier boots the page into the previous skin),
   * or time out.
   * @param target - skin id, or `official` for the stock look.
   * @returns whether the manifest caught up within the poll budget.
   */
  const manifestReady = (target: string): Promise<boolean> =>
    new Promise(resolve => {
      const expected = target === OFFICIAL_THEME_ID ? null : target
      let tries = 0
      const tick = (): void => {
        if (!mounted.current) {
          resolve(false)
          return
        }
        tries += 1
        void fetch(window.location.href, { cache: 'no-store' })
          .then(async response => {
            const html = await response.text().catch(() => null)
            if (html !== null && manifestHasSkin(html, expected)) {
              resolve(true)
              return
            }
            if (tries >= 40 || !mounted.current) resolve(false)
            else window.setTimeout(tick, 500)
          })
          .catch(() => {
            if (tries >= 40 || !mounted.current) resolve(false)
            else window.setTimeout(tick, 500)
          })
      }
      tick()
    })

  /**
   * One-click apply: the host half runs `dsh-skin use <target>` (or
   * `use official`), the config watcher hot-reloads the patch within
   * seconds, then this page reloads to pick up the new boot graph. The
   * reload waits for both the patch (state poll) and the regenerated boot
   * manifest (manifest poll) so the page never boots into the old skin.
   * @param target - skin id, or `official` for the stock look.
   */
  const applySkin = (target: string): void => {
    setError(null)
    setApplying(target)
    const selection = themeApplyTarget(target)
    const request = applyRequestFor(target)
    const previousCustomActive = customTheme.getSnapshot().settings.active
    const command = selection.hostTarget === OFFICIAL_THEME_ID
      ? 'dsh-skin use official'
      : `dsh-skin use ${selection.hostTarget}`
    void (async () => {
      let hostWriteStarted = false
      try {
        await customTheme.setActive(selection.customActive)
        const response = await fetch('/api/skin-center/apply', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request.body),
        })
        const payload = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null
        if (!response.ok || payload?.ok !== true) {
          throw new Error(payload?.error ?? `HTTP ${response.status}`)
        }
        hostWriteStarted = true
        // Patch written; reload only once the watcher reports the target
        // active AND the boot manifest caught up, so the page never boots
        // into the old skin.
        const confirmed = await confirmActive(request.confirmationTarget)
        if (!mounted.current) return
        if (!confirmed) {
          setApplying(null)
          setError(`${t('appliedUnconfirmed')} — ${command}`)
          return
        }
        const ready = await manifestReady(request.confirmationTarget)
        if (!mounted.current) return
        if (ready) {
          window.location.reload()
          return
        }
        setApplying(null)
        setError(`${t('appliedUnconfirmed')} — ${command}`)
      } catch (cause: unknown) {
        if (!hostWriteStarted) {
          await customTheme.setActive(previousCustomActive).catch(() => {})
        }
        if (!mounted.current) return
        setApplying(null)
        const detail = cause instanceof Error ? cause.message : String(cause)
        setError(`${t('applyFailed')} (${detail}) — ${command}`)
      }
    })()
  }

  const openThemeEditor = (): void => {
    restoreMode.current = themeMode
    const startsTrial = activeId !== CUSTOM_THEME_ID
    setEditingStartedTrial(startsTrial)
    if (startsTrial) tryOnCustom()
    setEditingTheme(true)
    window.setTimeout(() => {
      revealThemeEditor()
    }, 0)
  }

  const cancelThemeEditor = (): void => {
    customTheme.preview(themeMode)
    if (editingStartedTrial) {
      exitTryOn()
    }
    theme.setTheme(restoreMode.current)
    setEditingTheme(false)
    setEditingStartedTrial(false)
  }

  const saveThemeAndApply = (): void => {
    setEditingTheme(false)
    setEditingStartedTrial(false)
    applySkin(CUSTOM_THEME_ID)
  }

  /** One row: try-on control + apply button. Shared by the official card and every skin card. */
  const actionButtons = (opts: {
    key: string
    isActive: boolean
    isTrying: boolean
    onTryOn: () => void
    applyLabel: string
    onApply?: () => void
    extra?: ReactNode
  }): ReactNode => (
    <div className={css.actions}>
      {opts.isActive ? (
        <button type="button" className={`${css.button} ${css.buttonGhost}`} disabled>
          {t('tryOn')}
        </button>
      ) : opts.isTrying ? (
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} onClick={exitTryOn}>
          {t('exitTryOn')}
        </button>
      ) : (
        <button type="button" className={`${css.button} ${css.buttonPrimary}`} onClick={opts.onTryOn}>
          {t('tryOn')}
        </button>
      )}
      <button
        type="button"
        className={css.button}
        disabled={applying !== null}
        onClick={opts.onApply ?? (() => { applySkin(opts.key) })}
      >
        {applying === opts.key ? t('applying') : opts.applyLabel}
      </button>
      {opts.extra}
    </div>
  )

  return (
    <li className={open ? `${css.pluginCard} ${css.pluginCardOpen}` : css.pluginCard}>
      <button
        type="button"
        className={css.cardHeader}
        aria-expanded={open}
        aria-label={`${t(open ? 'collapse' : 'expand')}: ${t('title')}`}
        onClick={() => { setOpen(current => !current) }}
      >
        <span className={css.headText}>
          <span className={css.pluginName}>
            {t('title')}
            <span className={css.titleBadge}>{String(skinThemeCount(SKIN_CENTER_ENTRIES.length))}</span>
          </span>
          <span className={css.cardDescription} title={t('cardDescription')}>{t('cardDescription')}</span>
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={open ? `${css.chevron} ${css.chevronOpen}` : css.chevron}
        >
          <path
            d="M11.8486 5.5L11.4238 5.92383L8.69727 8.65137C8.44157 8.90706 8.21562 9.13382 8.01172 9.29785C7.79912 9.46883 7.55595 9.61756 7.25 9.66602C7.08435 9.69222 6.91565 9.69222 6.75 9.66602C6.44405 9.61756 6.20088 9.46883 5.98828 9.29785C5.78438 9.13382 5.55843 8.90706 5.30273 8.65137L2.57617 5.92383L2.15137 5.5L3 4.65137L3.42383 5.07617L6.15137 7.80273C6.42595 8.07732 6.59876 8.24849 6.74023 8.3623C6.87291 8.46904 6.92272 8.47813 6.9375 8.48047C6.97895 8.48703 7.02105 8.48703 7.0625 8.48047C7.07728 8.47813 7.12709 8.46904 7.25977 8.3623C7.40124 8.24849 7.57405 8.07732 7.84863 7.80273L10.5762 5.07617L11 4.65137L11.8486 5.5Z"
            fill="currentColor"
          />
        </svg>
      </button>

      {open
        ? (
          <div className={css.cardBody}>
            <div className={css.head}>
              <div className={css.intro} title={t('intro')}>{t('intro')}</div>
            </div>

            {error !== null && <div className={css.error}>{error}</div>}

            {sections.includes('skins') && (
              <div className={css.list}>
              {(() => {
                const isActive = activeId === OFFICIAL_THEME_ID
                const isTrying = tryingId === OFFICIAL_THEME_ID
                const badge = isActive ? t('active') : isTrying ? t('tryingOn') : null
                return (
                  <div className={css.card} key={OFFICIAL_THEME_ID}>
                    <div className={css.cardHead}>
                      <span className={css.swatch} style={{ background: '#98a1ab' }} aria-hidden="true" />
                      <span className={css.cardName} title={t('official')}>{t('official')}</span>
                      {badge !== null && (
                        <span className={`${css.badge} ${isActive ? css.badgeActive : css.badgeTrying}`}>
                          {badge}
                        </span>
                      )}
                    </div>
                    <div className={css.cardTagline} title={t('officialTagline')}>{t('officialTagline')}</div>
                    {actionButtons({
                      key: OFFICIAL_THEME_ID,
                      isActive,
                      isTrying,
                      onTryOn: tryOnOfficial,
                      applyLabel: t('restore'),
                    })}
                  </div>
                )
              })()}

              {(() => {
                const isActive = activeId === CUSTOM_THEME_ID
                const isTrying = tryingId === CUSTOM_THEME_ID
                const badge = isActive ? t('active') : isTrying ? t('tryingOn') : null
                const accent = customSnapshot.settings[themeMode]?.accent ?? OFFICIAL_THEME_PRESETS[themeMode].accent
                return (
                  <div className={css.card} key={CUSTOM_THEME_ID}>
                    <div className={css.cardHead}>
                      <span className={css.swatch} style={{ background: accent }} aria-hidden="true" />
                      <span className={css.cardName} title={t('customTheme')}>{t('customTheme')}</span>
                      {badge !== null && (
                        <span className={`${css.badge} ${isActive ? css.badgeActive : css.badgeTrying}`}>
                          {badge}
                        </span>
                      )}
                    </div>
                    <div className={css.cardTagline} title={t('customThemeTagline')}>{t('customThemeTagline')}</div>
                    {actionButtons({
                      key: CUSTOM_THEME_ID,
                      isActive,
                      isTrying,
                      onTryOn: tryOnCustom,
                      applyLabel: t('apply'),
                      extra: (
                        <button type="button" className={css.button} onClick={openThemeEditor}>
                          {t('edit')}
                        </button>
                      ),
                    })}
                  </div>
                )
              })()}

              {SKIN_CENTER_ENTRIES.map(entry => {
                const isActive = entry.id === activeId
                const isTrying = entry.id === tryingId
                const badge = isActive ? t('active') : isTrying ? t('tryingOn') : null
                return (
                  <div className={css.card} key={entry.id}>
                    <div className={css.cardHead}>
                      <span className={css.swatch} style={{ background: entry.accent }} aria-hidden="true" />
                      <span className={css.cardName} title={entry.nameEn}>{entry.nameEn}</span>
                      {badge !== null && (
                        <span className={`${css.badge} ${isActive ? css.badgeActive : css.badgeTrying}`}>
                          {badge}
                        </span>
                      )}
                    </div>
                    <div className={css.cardTagline} title={entry.tagline}>{entry.tagline}</div>
                    {actionButtons({
                      key: entry.id,
                      isActive,
                      isTrying,
                      onTryOn: () => { tryOn(entry) },
                      applyLabel: t('apply'),
                    })}
                  </div>
                )
              })}
              </div>
            )}
            {sections.includes('theme') && (
              <CustomThemeEditor
                handle={customTheme}
                mode={themeMode}
                setMode={mode => { theme.setTheme(mode) }}
                onCancel={cancelThemeEditor}
                onSaveAndApply={saveThemeAndApply}
                backgroundEditor={<BackgroundEditor handle={background} t={t} />}
                t={t}
              />
            )}
            {sections.includes('background') && <BackgroundEditor handle={background} t={t} />}
          </div>
        )
        : null}
    </li>
  )
}
