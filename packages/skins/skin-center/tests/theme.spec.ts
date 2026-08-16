import { describe, expect, it } from 'vitest'
import {
  CUSTOM_THEME_ID,
  OFFICIAL_THEME_ID,
  THEME_TOKEN_ALLOWLIST,
  contrastRatio,
  deriveThemeTokens,
  normalizeCustomThemeSettings,
  normalizePalette,
  resolveActiveThemeId,
  themeApplyTarget,
  type PaletteConfig,
} from '../src/core/theme.ts'
import { CUSTOM_THEME_NAMESPACE, CustomThemeConfigSchema } from '../src/index.ts'

const palette: PaletteConfig = {
  accent: '#339CFF',
  background: '#181818',
  foreground: '#FFFFFF',
  contrast: 73,
}

describe('custom theme model', () => {
  it('registers the independent version 2 activation schema', () => {
    expect(CUSTOM_THEME_NAMESPACE).toBe('skin-custom-theme')
    expect(CustomThemeConfigSchema({})).toEqual({ version: 2, active: false })
    expect(CustomThemeConfigSchema({ light: palette })).toEqual({ version: 2, active: false, light: palette })
    expect(CustomThemeConfigSchema({ version: 1, light: palette })).toEqual({
      version: 1,
      active: false,
      light: palette,
    })
    expect(() => CustomThemeConfigSchema({ light: { ...palette, contrast: 101 } })).toThrow()
  })

  it('migrates a saved version 1 palette into an active custom theme', () => {
    expect(normalizeCustomThemeSettings({ version: 1, light: palette })).toEqual({
      version: 2,
      active: true,
      light: palette,
    })
    expect(normalizeCustomThemeSettings({ version: 1 })).toEqual({ version: 2, active: false })
    expect(normalizeCustomThemeSettings({ version: 2, active: false, dark: palette })).toEqual({
      version: 2,
      active: false,
      dark: palette,
    })
  })

  it('gives an installed skin priority over custom and official surfaces', () => {
    expect(resolveActiveThemeId(undefined, false)).toBe(OFFICIAL_THEME_ID)
    expect(resolveActiveThemeId(undefined, true)).toBe(CUSTOM_THEME_ID)
    expect(resolveActiveThemeId('blue-fantasy', true)).toBe('blue-fantasy')
  })

  it('maps custom persistence to the official host graph', () => {
    expect(themeApplyTarget(CUSTOM_THEME_ID)).toEqual({
      hostTarget: OFFICIAL_THEME_ID,
      customActive: true,
    })
    expect(themeApplyTarget(OFFICIAL_THEME_ID)).toEqual({
      hostTarget: OFFICIAL_THEME_ID,
      customActive: false,
    })
    expect(themeApplyTarget('whale-song')).toEqual({
      hostTarget: 'whale-song',
      customActive: false,
    })
  })

  it('normalizes valid colors and rejects malformed palette values', () => {
    expect(normalizePalette({
      accent: '#339cff',
      background: '#181818',
      foreground: '#ffffff',
      contrast: 73,
    })).toEqual(palette)
    expect(normalizePalette({ ...palette, accent: 'red' })).toBeUndefined()
    expect(normalizePalette({ ...palette, contrast: 73.5 })).toBeUndefined()
    expect(normalizePalette({ ...palette, contrast: 101 })).toBeUndefined()
  })

  it('derives only the fixed allowlist in stable order', () => {
    expect(Object.keys(deriveThemeTokens(palette))).toEqual([...THEME_TOKEN_ALLOWLIST])
    expect(Object.keys(deriveThemeTokens(palette))).not.toContain('--dsw-alias-state-error-primary')
  })

  it('always derives translucent semantic surfaces over an opaque canvas', () => {
    const tokens = deriveThemeTokens(palette)
    expect(tokens['--dsw-alias-bg-base']).toBe('rgba(24, 24, 24, 0.5)')
    expect(tokens['--dsw-alias-bg-layer-1']).toMatch(/^rgba\(/)
    expect(tokens['--dsw-alias-bg-overlay']).toMatch(/^rgba\(/)
    expect(tokens['--dsw-specific-sidebar-fill']).toMatch(/^rgba\(/)
  })

  it('keeps higher contrast settings visually stronger', () => {
    const low = deriveThemeTokens({ ...palette, contrast: 0 })
    const high = deriveThemeTokens({ ...palette, contrast: 100 })
    expect(low['--dsw-alias-bg-layer-3']).not.toBe(high['--dsw-alias-bg-layer-3'])
    expect(low['--dsw-alias-border-l4']).not.toBe(high['--dsw-alias-border-l4'])
    expect(low['--dsw-alias-label-secondary']).not.toBe(high['--dsw-alias-label-secondary'])
  })

  it('chooses readable black or white text on the accent', () => {
    const lightAccent = deriveThemeTokens({ ...palette, accent: '#FFFF00' })
    const darkAccent = deriveThemeTokens({ ...palette, accent: '#001133' })
    expect(lightAccent['--dsw-alias-label-primary-foreground']).toBe('#000000')
    expect(darkAccent['--dsw-alias-label-primary-foreground']).toBe('#FFFFFF')
  })

  it('computes WCAG contrast ratios', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBe(1)
  })
})
