/** @vitest-environment jsdom */

import { describe, expect, it, vi } from 'vitest'
import { validateThemeDraft, type ThemeDraft } from '../src/client/CustomThemeEditor.tsx'
import { CUSTOM_THEME_ID, OFFICIAL_THEME_ID } from '../src/core/theme.ts'

describe('custom theme editor validation', () => {
  it('normalizes valid draft colors and reports contrast ratios', () => {
    const draft: ThemeDraft = {
      accent: '#339cff',
      background: '#181818',
      foreground: '#ffffff',
      contrast: 73,
    }
    const result = validateThemeDraft(draft)
    expect(result.palette).toEqual({ ...draft, accent: '#339CFF', foreground: '#FFFFFF' })
    expect(result.foregroundRatio).toBeGreaterThan(4.5)
    expect(result.accentRatio).toBeGreaterThan(1)
  })

  it('keeps invalid text out of the palette', () => {
    expect(validateThemeDraft({
      accent: '#339CFF', background: 'black', foreground: '#FFFFFF', contrast: 50,
    }).palette).toBeUndefined()
  })

  it('reveals the editor without scrolling the settings header away', async () => {
    const skinCenter = await import('../src/client/SkinCenter.tsx') as unknown as {
      revealThemeEditor?: (root: Document) => void
    }
    expect(skinCenter.revealThemeEditor).toBeTypeOf('function')
    if (skinCenter.revealThemeEditor === undefined) return

    const title = document.createElement('h3')
    title.id = 'skin-center-theme-title'
    title.tabIndex = -1
    const scrollIntoView = vi.fn()
    title.scrollIntoView = scrollIntoView
    document.body.append(title)

    skinCenter.revealThemeEditor(document)

    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    expect(document.activeElement).toBe(title)
  })

  it('replaces the long skin list with theme and background controls while customizing', async () => {
    const skinCenter = await import('../src/client/SkinCenter.tsx') as unknown as {
      appearanceSections?: (editingTheme: boolean) => readonly string[]
    }
    expect(skinCenter.appearanceSections).toBeTypeOf('function')
    if (skinCenter.appearanceSections === undefined) return

    expect(skinCenter.appearanceSections(false)).toEqual(['skins', 'background'])
    expect(skinCenter.appearanceSections(true)).toEqual(['theme'])
  })

  it('counts custom appearance as the eleventh theme', async () => {
    const skinCenter = await import('../src/client/SkinCenter.tsx') as unknown as {
      skinThemeCount?: (installedCount: number) => number
    }
    expect(skinCenter.skinThemeCount).toBeTypeOf('function')
    if (skinCenter.skinThemeCount === undefined) return

    expect(skinCenter.skinThemeCount(10)).toBe(11)
  })

  it('uses the official host graph when applying the custom card', async () => {
    const skinCenter = await import('../src/client/SkinCenter.tsx') as unknown as {
      applyRequestFor?: (themeId: string) => {
        body: { official: true } | { skin: string }
        confirmationTarget: string
      }
    }
    expect(skinCenter.applyRequestFor).toBeTypeOf('function')
    if (skinCenter.applyRequestFor === undefined) return

    expect(skinCenter.applyRequestFor(CUSTOM_THEME_ID)).toEqual({
      body: { official: true },
      confirmationTarget: OFFICIAL_THEME_ID,
    })
    expect(skinCenter.applyRequestFor('whale-song')).toEqual({
      body: { skin: 'whale-song' },
      confirmationTarget: 'whale-song',
    })
  })

  it('enters and exits custom try-on through the shared surface lifecycle', async () => {
    const skinCenter = await import('../src/client/SkinCenter.tsx') as unknown as {
      beginCustomTryOn?: (
        controller: { tryOnOfficial(): void },
        theme: { startTrial(mode: 'light' | 'dark'): void },
        mode: 'light' | 'dark',
      ) => void
      finishTryOn?: (
        controller: { exit(): void },
        theme: { endTrial(): void; setOfficialActive(active: boolean): void },
        custom: boolean,
        restoreOfficialSurface: boolean,
      ) => void
    }
    expect(skinCenter.beginCustomTryOn).toBeTypeOf('function')
    expect(skinCenter.finishTryOn).toBeTypeOf('function')
    if (skinCenter.beginCustomTryOn === undefined || skinCenter.finishTryOn === undefined) return

    const events: string[] = []
    skinCenter.beginCustomTryOn(
      { tryOnOfficial: () => { events.push('surface') } },
      { startTrial: mode => { events.push(`custom:${mode}`) } },
      'dark',
    )
    skinCenter.finishTryOn(
      { exit: () => { events.push('restore') } },
      {
        endTrial: () => { events.push('end-custom') },
        setOfficialActive: active => { events.push(`base:${String(active)}`) },
      },
      true,
      false,
    )

    expect(events).toEqual(['surface', 'custom:dark', 'end-custom', 'base:false', 'restore'])
  })
})
