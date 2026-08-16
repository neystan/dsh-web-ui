import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { BackgroundMode } from '../core/background.ts'
import type { BackgroundHandle } from './background.ts'
import { prepareBackground, uploadBackground, type PreparedBackground } from './image-upload.ts'
import type { SkinCenterKey } from './locales.ts'
import css from './skin-center.module.css'

function errorKey(error: unknown): SkinCenterKey {
  const code = error instanceof Error ? error.message : ''
  if (code === 'invalid-image-type' || code === 'source-image-dimensions') return 'imageInvalid'
  if (code === 'source-image-too-large' || code === 'encoded-image-too-large') return 'imageTooLarge'
  if (code === 'background-delete-failed') return 'backgroundDeleteFailed'
  if (code === 'background-settings-write-failed') return 'backgroundSaveFailed'
  return 'imageUploadFailed'
}

export function BackgroundEditor({ handle, t }: {
  handle: BackgroundHandle
  t(key: SkinCenterKey): string
}) {
  const snapshot = useSyncExternalStore(handle.subscribe.bind(handle), handle.getSnapshot.bind(handle))
  const input = useRef<HTMLInputElement>(null)
  const [prepared, setPrepared] = useState<PreparedBackground>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<SkinCenterKey>()
  const { settings } = snapshot

  useEffect(() => () => {
    if (prepared !== undefined) URL.revokeObjectURL(prepared.previewUrl)
  }, [prepared])

  const choose = (file?: File): void => {
    if (file === undefined) return
    setBusy(true)
    setError(undefined)
    void prepareBackground(file)
      .then(next => { setPrepared(next) })
      .catch(cause => { setError(errorKey(cause)) })
      .finally(() => { setBusy(false) })
  }

  const selectMode = (mode: BackgroundMode): void => {
    setError(undefined)
    if (mode === 'custom' && settings.imageRevision === undefined) {
      input.current?.click()
      return
    }
    void handle.setMode(mode).catch(() => { setError('backgroundSaveFailed') })
  }

  const save = (): void => {
    if (prepared === undefined || busy) return
    setBusy(true)
    setError(undefined)
    void uploadBackground(prepared.blob)
      .then(revision => handle.commitRevision(revision))
      .then(() => { setPrepared(undefined) })
      .catch(cause => { setError(errorKey(cause)) })
      .finally(() => { setBusy(false) })
  }

  const remove = (): void => {
    if (!window.confirm(t('confirmDelete'))) return
    setBusy(true)
    setError(undefined)
    void handle.deleteRevision()
      .catch(cause => { setError(errorKey(cause)) })
      .finally(() => { setBusy(false) })
  }

  const imageUrl = settings.imageRevision === undefined
    ? undefined
    : `/api/skin-center/background/${settings.imageRevision}.webp`

  return (
    <section className={css.appearanceSection} aria-labelledby="skin-center-background-title">
      <div className={css.sectionHeader}>
        <h3 id="skin-center-background-title" className={css.sectionTitle}>{t('backgroundTitle')}</h3>
        <div className={css.segmented} aria-label={t('backgroundTitle')}>
          {(['skin', 'custom', 'none'] as const).map(mode => (
            <button
              key={mode}
              type="button"
              className={`${css.themeButton} ${settings.mode === mode ? css.themeButtonActive : ''}`}
              aria-pressed={settings.mode === mode}
              disabled={busy || !snapshot.writable}
              onClick={() => { selectMode(mode) }}
            >
              {t(mode === 'skin' ? 'backgroundSkin' : mode === 'custom' ? 'backgroundCustom' : 'backgroundNone')}
            </button>
          ))}
        </div>
      </div>

      {(prepared !== undefined || imageUrl !== undefined) && (
        <div className={css.imagePreview}>
          <img
            src={prepared?.previewUrl ?? imageUrl}
            alt={t('backgroundPreview')}
            onError={() => {
              if (prepared === undefined && settings.imageRevision !== undefined) handle.reportMissingRevision(settings.imageRevision)
            }}
          />
        </div>
      )}

      {snapshot.missingImage && <div className={css.validation} aria-live="polite">{t('backgroundMissing')}</div>}
      {error !== undefined && <div className={css.error} aria-live="polite">{t(error)}</div>}

      <input
        ref={input}
        className={css.hiddenInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={t('chooseImage')}
        onChange={event => {
          choose(event.target.files?.[0])
          event.target.value = ''
        }}
      />
      <div className={css.sectionActions}>
        <button type="button" className={css.button} disabled={busy || !snapshot.writable} onClick={() => { input.current?.click() }}>
          {settings.imageRevision === undefined && prepared === undefined ? t('chooseImage') : t('replaceImage')}
        </button>
        {prepared !== undefined && (
          <button type="button" className={`${css.button} ${css.buttonPrimary}`} disabled={busy || !snapshot.writable} onClick={save}>
            {t('saveImage')}
          </button>
        )}
        {settings.imageRevision !== undefined && (
          <button type="button" className={`${css.button} ${css.buttonGhost}`} disabled={busy || !snapshot.writable} onClick={remove}>
            {t('deleteImage')}
          </button>
        )}
      </div>

      <label className={`${css.settingRow} ${css.rangeRow}`}>
        <span className={css.settingLabel}>{t('backgroundOpacity')}</span>
        <input
          className={css.backgroundRange}
          type="range"
          min="0"
          max="100"
          step="5"
          value={settings.backgroundOpacity}
          disabled={settings.mode === 'none' || !snapshot.writable}
          aria-valuetext={`${settings.backgroundOpacity}%`}
          onChange={event => {
            setError(undefined)
            void handle.setOpacity(Number(event.target.value)).catch(() => { setError('backgroundSaveFailed') })
          }}
        />
        <span className={css.rangeValue}>{settings.backgroundOpacity}%</span>
      </label>
    </section>
  )
}
