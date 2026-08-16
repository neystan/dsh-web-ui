import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  OFFICIAL_THEME_PRESETS,
  contrastRatio,
  normalizePalette,
  type PaletteConfig,
  type ThemeMode,
} from '../core/theme.ts'
import type { CustomThemeHandle } from './custom-theme.ts'
import type { SkinCenterKey } from './locales.ts'
import css from './skin-center.module.css'

export interface ThemeDraft {
  accent: string
  background: string
  foreground: string
  contrast: number
}

export interface ThemeDraftValidation {
  palette?: PaletteConfig
  foregroundRatio: number
  accentRatio: number
}

export function validateThemeDraft(draft: ThemeDraft): ThemeDraftValidation {
  const palette = normalizePalette(draft)
  return {
    ...(palette === undefined ? {} : { palette }),
    foregroundRatio: palette === undefined ? 0 : contrastRatio(palette.foreground, palette.background),
    accentRatio: palette === undefined ? 0 : contrastRatio(palette.foreground, palette.accent),
  }
}

function draftFor(mode: ThemeMode, palette?: PaletteConfig): ThemeDraft {
  return palette === undefined ? { ...OFFICIAL_THEME_PRESETS[mode] } : { ...palette }
}

export function CustomThemeEditor({
  handle,
  mode,
  setMode,
  onCancel,
  onSaveAndApply,
  backgroundEditor,
  t,
}: {
  handle: CustomThemeHandle
  mode: ThemeMode
  setMode(mode: ThemeMode): void
  onCancel(): void
  onSaveAndApply(): void
  backgroundEditor?: ReactNode
  t(key: SkinCenterKey): string
}) {
  const snapshot = useSyncExternalStore(handle.subscribe.bind(handle), handle.getSnapshot.bind(handle))
  const [drafts, setDrafts] = useState<Record<ThemeMode, ThemeDraft>>({
    light: draftFor('light', snapshot.settings.light),
    dark: draftFor('dark', snapshot.settings.dark),
  })
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [dirty, setDirty] = useState(false)
  const draft = drafts[mode]
  const validation = validateThemeDraft(draft)

  useEffect(() => {
    if (validation.palette === undefined) handle.preview(mode)
    else handle.preview(mode, validation.palette)
    return () => { handle.preview(mode) }
  }, [handle, mode, draft.accent, draft.background, draft.foreground, draft.contrast])

  useEffect(() => {
    if (dirty) return
    setDrafts({
      light: draftFor('light', snapshot.settings.light),
      dark: draftFor('dark', snapshot.settings.dark),
    })
  }, [dirty, snapshot.settings.light, snapshot.settings.dark])

  const update = <K extends keyof ThemeDraft>(field: K, value: ThemeDraft[K]): void => {
    setDirty(true)
    setDrafts(current => ({ ...current, [mode]: { ...current[mode], [field]: value } }))
  }

  const save = (): void => {
    if (validation.palette === undefined || busy) return
    setBusy(true)
    setSaveError(false)
    void handle.save(mode, validation.palette)
      .then(onSaveAndApply)
      .catch(() => { setSaveError(true) })
      .finally(() => { setBusy(false) })
  }

  const reset = (): void => {
    if (busy) return
    setBusy(true)
    setSaveError(false)
    void handle.restoreDefaults().then(() => {
      setDirty(false)
      setDrafts({
        light: { ...OFFICIAL_THEME_PRESETS.light },
        dark: { ...OFFICIAL_THEME_PRESETS.dark },
      })
    }).catch(() => { setSaveError(true) }).finally(() => { setBusy(false) })
  }

  const lowContrast = validation.palette !== undefined
    && (validation.foregroundRatio < 4.5 || validation.accentRatio < 4.5)

  return (
    <section className={css.appearanceSection} aria-labelledby="skin-center-theme-title">
      <div className={css.sectionHeader}>
        <h3 id="skin-center-theme-title" className={css.sectionTitle} tabIndex={-1}>{t('customTheme')}</h3>
        <div className={css.segmented} aria-label={t('theme')}>
          {(['light', 'dark'] as const).map(candidate => (
            <button
              key={candidate}
              type="button"
              className={`${css.themeButton} ${mode === candidate ? css.themeButtonActive : ''}`}
              aria-pressed={mode === candidate}
              onClick={() => { setMode(candidate) }}
            >
              {t(candidate === 'light' ? 'themeLight' : 'themeDark')}
            </button>
          ))}
        </div>
      </div>

      {(['accent', 'background', 'foreground'] as const).map(field => {
        const validColor = /^#[0-9a-f]{6}$/i.test(draft[field]) ? draft[field] : '#000000'
        return (
          <label className={css.settingRow} key={field}>
            <span className={css.settingLabel}>{t(field)}</span>
            <span className={css.colorControl}>
              <input
                className={css.colorInput}
                type="color"
                value={validColor}
                aria-label={t(field)}
                onChange={event => { update(field, event.target.value.toUpperCase()) }}
              />
              <input
                className={css.hexInput}
                type="text"
                value={draft[field]}
                inputMode="text"
                spellCheck={false}
                aria-label={`${t(field)} HEX`}
                aria-invalid={!/^#[0-9a-f]{6}$/i.test(draft[field])}
                onChange={event => { update(field, event.target.value) }}
              />
            </span>
          </label>
        )
      })}

      <label className={`${css.settingRow} ${css.rangeRow}`}>
        <span className={css.settingLabel}>{t('contrast')}</span>
        <input
          className={css.backgroundRange}
          type="range"
          min="0"
          max="100"
          step="1"
          value={draft.contrast}
          aria-valuetext={String(draft.contrast)}
          onChange={event => { update('contrast', Number(event.target.value)) }}
        />
        <span className={css.rangeValue}>{draft.contrast}</span>
      </label>

      {(validation.palette === undefined || lowContrast) && (
        <div className={css.validation} aria-live="polite">
          {validation.palette === undefined
            ? t('invalidColor')
            : `${t('contrastWarning')} ${validation.foregroundRatio.toFixed(1)} / ${validation.accentRatio.toFixed(1)}`}
        </div>
      )}
      {saveError && <div className={css.error} aria-live="polite">{t('themeSaveFailed')}</div>}
      {backgroundEditor}
      <div className={css.sectionActions}>
        <button type="button" className={`${css.button} ${css.buttonGhost}`} onClick={onCancel}>{t('cancel')}</button>
        <button type="button" className={css.button} disabled={busy || !snapshot.writable} onClick={reset}>{t('resetTheme')}</button>
        <button
          type="button"
          className={`${css.button} ${css.buttonPrimary}`}
          disabled={busy || !snapshot.writable || validation.palette === undefined}
          onClick={save}
        >
          {t('saveAndApply')}
        </button>
      </div>
    </section>
  )
}
