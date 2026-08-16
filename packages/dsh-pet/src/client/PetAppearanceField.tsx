import { useEffect, useMemo, useState } from 'react'
import type { PetAppearanceView, PetAssetView } from '../service.ts'
import { preparePetImport, type PreparedPetImport } from './pet-image-validation.ts'
import { generationPrompt, writeClipboard, type PromptLocale } from './generation-prompt.ts'
import { PetSpritePreview } from './PetSpritePreview.tsx'
import styles from './pet-appearance.module.css'

export interface PetAppearanceFieldProps {
  t: (key: string) => string
}

type SelectedAppearance = 'official' | 'custom'

interface ApiError extends Error {
  code?: string
  status?: number
}

async function appearanceFetch<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? {} : {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) {
    const error = new Error(payload.error ?? 'appearance.request-failed') as ApiError
    error.code = payload.error
    error.status = response.status
    throw error
  }
  return payload as T
}

function locale(): PromptLocale {
  return document.documentElement.lang.toLowerCase().startsWith('en') ? 'en' : 'zh'
}

function stableError(t: (key: string) => string, error: unknown): string {
  const code = error instanceof Error ? error.message : 'appearance.request-failed'
  return t(`settings.appearance.error.${code}`)
}

function Card({
  asset,
  title,
  description,
  selected,
  status,
  onSelect,
  children,
}: {
  asset?: PetAssetView
  title: string
  description: string
  selected: boolean
  status?: string
  onSelect(): void
  children?: React.ReactNode
}) {
  return (
    <section className={`${styles.card} ${selected ? styles.cardSelected : ''}`}>
      <button type="button" className={styles.cardHeader} aria-pressed={selected} onClick={onSelect}>
        <span className={styles.preview}>{asset === undefined ? <span className={styles.emptyPreview}>?</span> : <PetSpritePreview asset={asset} />}</span>
        <span className={styles.cardText}>
          <span className={styles.cardTitle}>{title}</span>
          <span className={styles.cardDescription}>{description}</span>
          {status !== undefined && <span className={styles.cardStatus}>{status}</span>}
        </span>
      </button>
      {children !== undefined && <div className={styles.cardBody}>{children}</div>}
    </section>
  )
}

/** Minimal two-card manager for the official whale and one custom slot. */
export function PetAppearanceField({ t }: PetAppearanceFieldProps) {
  const [remote, setRemote] = useState<PetAppearanceView | undefined>()
  const [selected, setSelected] = useState<SelectedAppearance>('official')
  const [manifestFile, setManifestFile] = useState<File | undefined>()
  const [spritesheetFile, setSpritesheetFile] = useState<File | undefined>()
  const [prepared, setPrepared] = useState<PreparedPetImport | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [copied, setCopied] = useState(false)

  const refresh = async (): Promise<void> => {
    try {
      const next = await appearanceFetch<PetAppearanceView>('/api/pet/appearance')
      setRemote(next)
      setSelected(next.appearance)
      setError(undefined)
    } catch (reason) {
      setError(stableError(t, reason))
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const customAsset = remote?.candidate ?? remote?.current
  const canApply = selected === 'official' || customAsset !== undefined
  const activeLabel = t('settings.appearance.active')
  const pendingLabel = t('settings.appearance.pending')
  const customStatus = remote?.candidate !== undefined ? pendingLabel : remote?.current !== undefined ? activeLabel : t('settings.appearance.empty')
  const prompt = useMemo(() => generationPrompt(locale()), [])

  const importFiles = async (): Promise<void> => {
    if (manifestFile === undefined || spritesheetFile === undefined || busy) return
    setBusy(true)
    setError(undefined)
    let localPreview: string | undefined
    try {
      const next = await preparePetImport(manifestFile, spritesheetFile)
      localPreview = next.previewUrl
      const current = remote?.stateToken
      if (current === undefined) throw new Error('appearance.not-ready')
      const updated = await appearanceFetch<PetAppearanceView>('/api/pet/appearance/import', {
        manifestFileName: 'pet.json',
        manifestText: next.manifestText,
        spritesheetFileName: 'spritesheet.webp',
        spritesheetBase64: next.spritesheetBase64,
        expectedState: current,
      })
      setPrepared(next)
      setRemote(updated)
      setSelected('custom')
      window.dispatchEvent(new Event('dsh-pet-appearance-changed'))
    } catch (reason) {
      setPrepared(undefined)
      setError(stableError(t, reason))
    } finally {
      if (localPreview !== undefined) URL.revokeObjectURL(localPreview)
      setBusy(false)
    }
  }

  const useSelected = async (): Promise<void> => {
    if (remote === undefined || !canApply || busy) return
    setBusy(true)
    setError(undefined)
    try {
      const path = selected === 'official'
        ? '/api/pet/appearance/use-official'
        : '/api/pet/appearance/use-custom'
      const updated = await appearanceFetch<PetAppearanceView>(path, { expectedState: remote.stateToken })
      setRemote(updated)
      setSelected(updated.appearance)
      window.dispatchEvent(new Event('dsh-pet-appearance-changed'))
    } catch (reason) {
      setError(stableError(t, reason))
      if ((reason as ApiError).status === 409) void refresh()
    } finally {
      setBusy(false)
    }
  }

  const deleteCustom = async (): Promise<void> => {
    if (remote === undefined || busy || !window.confirm(t('settings.appearance.deleteConfirm'))) return
    setBusy(true)
    setError(undefined)
    try {
      const updated = await appearanceFetch<PetAppearanceView>('/api/pet/appearance/delete', { expectedState: remote.stateToken })
      setRemote(updated)
      setSelected('official')
      setPrepared(undefined)
      window.dispatchEvent(new Event('dsh-pet-appearance-changed'))
    } catch (reason) {
      setError(stableError(t, reason))
    } finally {
      setBusy(false)
    }
  }

  const copyPrompt = async (): Promise<void> => {
    try {
      await writeClipboard(prompt)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
      setError(undefined)
    } catch (reason) {
      setError(stableError(t, reason))
    }
  }

  return (
    <section className={styles.section} aria-labelledby="settings-pet-appearance-title">
      <div className={styles.sectionHead}>
        <h3 id="settings-pet-appearance-title">{t('settings.appearance.title')}</h3>
        <p>{t('settings.appearance.description')}</p>
      </div>
      <div className={styles.cards}>
        <Card
          asset={remote?.official}
          title={t('settings.appearance.official')}
          description={t('settings.appearance.officialDescription')}
          selected={selected === 'official'}
          status={remote?.appearance === 'official' ? activeLabel : undefined}
          onSelect={() => setSelected('official')}
        />
        <Card
          asset={customAsset}
          title={t('settings.appearance.custom')}
          description={customAsset?.manifest.description ?? t('settings.appearance.customDescription')}
          selected={selected === 'custom'}
          status={customStatus}
          onSelect={() => setSelected('custom')}
        >
          <label className={styles.fileLabel}>
            {t('settings.appearance.selectManifest')}
            <input type="file" accept="application/json,.json" onChange={(event) => {
              setManifestFile(event.target.files?.[0])
              setPrepared(undefined)
            }} />
          </label>
          <label className={styles.fileLabel}>
            {t('settings.appearance.selectSpritesheet')}
            <input type="file" accept="image/webp,.webp" onChange={(event) => {
              setSpritesheetFile(event.target.files?.[0])
              setPrepared(undefined)
            }} />
          </label>
          <div className={styles.actions}>
            <button type="button" disabled={busy || manifestFile === undefined || spritesheetFile === undefined} onClick={() => { void importFiles() }}>
              {t('settings.appearance.import')}
            </button>
            <button type="button" disabled={busy} onClick={() => { void copyPrompt() }}>
              {copied ? t('settings.appearance.copied') : t('settings.appearance.copyPrompt')}
            </button>
            {(remote?.current !== undefined || remote?.candidate !== undefined || prepared !== undefined) && (
              <button type="button" disabled={busy} onClick={() => { void deleteCustom() }}>
                {t('settings.appearance.delete')}
              </button>
            )}
          </div>
        </Card>
      </div>
      <button type="button" className={styles.useSelected} disabled={busy || !canApply} onClick={() => { void useSelected() }}>
        {t('settings.appearance.useSelected')}
      </button>
      {error !== undefined && <p className={styles.error} role="alert">{error}</p>}
    </section>
  )
}
