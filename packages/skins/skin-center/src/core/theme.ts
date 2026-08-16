/** Pure custom-theme model shared by the host schema and browser controller. */

export type ThemeMode = 'light' | 'dark'

export interface PaletteConfig {
  accent: string
  background: string
  foreground: string
  contrast: number
}

export interface CustomThemeSettings {
  version: 2
  active: boolean
  light?: PaletteConfig
  dark?: PaletteConfig
}

export const CUSTOM_THEME_NS = 'skin-custom-theme'
export const OFFICIAL_THEME_ID = 'official'
export const CUSTOM_THEME_ID = 'custom'

/** Fixed, safe starting points that closely follow the official DSH surfaces. */
export const OFFICIAL_THEME_PRESETS: Readonly<Record<ThemeMode, PaletteConfig>> = {
  light: { accent: '#339CFF', background: '#FFFFFF', foreground: '#181818', contrast: 60 },
  dark: { accent: '#339CFF', background: '#181818', foreground: '#FFFFFF', contrast: 73 },
}

/** The only CSS custom properties the custom-theme controller may write. */
export const THEME_TOKEN_ALLOWLIST = [
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-layer-3',
  '--dsw-alias-bg-overlay',
  '--dsw-alias-bg-skeleton',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-border-l3',
  '--dsw-alias-border-l4',
  '--dsw-alias-brand-primary',
  '--dsw-alias-brand-primary-invert',
  '--dsw-alias-brand-text',
  '--dsw-alias-button-contrast-fill',
  '--dsw-alias-button-ghost-active-fill',
  '--dsw-alias-button-ghost-active-hover',
  '--dsw-alias-button-primary-dimmed',
  '--dsw-alias-button-primary-fill',
  '--dsw-alias-button-primary-hover',
  '--dsw-alias-button-tool-bar-fill',
  '--dsw-alias-interactive-bg-active',
  '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-interactive-bg-hover-accent',
  '--dsw-alias-interactive-bg-hover-danger',
  '--dsw-alias-interactive-bg-hover-solid',
  '--dsw-alias-label-caption',
  '--dsw-alias-label-dimmed',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-primary-dimmed',
  '--dsw-alias-label-primary-foreground',
  '--dsw-alias-label-primary-inverted',
  '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary',
  '--dsw-alias-markdown-citation',
  '--dsw-alias-markdown-code-block',
  '--dsw-alias-markdown-code-block-banner',
  '--dsw-alias-markdown-inline-code',
  '--dsw-alias-markdown-placeholder',
  '--dsw-alias-markdown-tag',
  '--dsw-alias-toast-bg',
  '--dsw-alias-tooltip-bg',
  '--dsw-specific-bubble',
  '--dsw-specific-bubble-highlight',
  '--dsw-specific-input-major',
  '--dsw-specific-login-input',
  '--dsw-specific-menu',
  '--dsw-specific-selector',
  '--dsw-specific-sidebar-fill',
  '--dsw-specific-sidebar-nav-item-active',
  '--dsw-specific-sidebar-nav-item-active-accent',
  '--dsw-specific-sidebar-nav-item-hover',
  '--dsw-specific-tip',
] as const

export type ThemeTokenName = (typeof THEME_TOKEN_ALLOWLIST)[number]

const HEX = /^#[0-9a-f]{6}$/i

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function normalizeHex(value: unknown): string | undefined {
  return typeof value === 'string' && HEX.test(value) ? value.toUpperCase() : undefined
}

/** Normalize untrusted settings/UI data into one strict palette. */
export function normalizePalette(value: unknown): PaletteConfig | undefined {
  const input = record(value)
  if (input === undefined) return undefined
  const accent = normalizeHex(input.accent)
  const background = normalizeHex(input.background)
  const foreground = normalizeHex(input.foreground)
  const contrast = input.contrast
  if (accent === undefined || background === undefined || foreground === undefined) return undefined
  if (typeof contrast !== 'number' || !Number.isInteger(contrast) || contrast < 0 || contrast > 100) return undefined
  return { accent, background, foreground, contrast }
}

/** Migrate persisted custom-theme settings into the current strict shape. */
export function normalizeCustomThemeSettings(value: unknown): CustomThemeSettings {
  const input = record(value)
  if (input === undefined || (input.version !== 1 && input.version !== 2)) {
    return { version: 2, active: false }
  }
  const light = normalizePalette(input.light)
  const dark = normalizePalette(input.dark)
  const active = input.version === 1
    ? light !== undefined || dark !== undefined
    : input.active === true
  return {
    version: 2,
    active,
    ...(light === undefined ? {} : { light }),
    ...(dark === undefined ? {} : { dark }),
  }
}

/** Resolve the one active card, with an installed skin taking precedence. */
export function resolveActiveThemeId(activeSkinId: string | undefined, customActive: boolean): string {
  if (activeSkinId !== undefined) return activeSkinId
  return customActive ? CUSTOM_THEME_ID : OFFICIAL_THEME_ID
}

/** Map a UI theme identity onto the existing host switch target. */
export function themeApplyTarget(themeId: string): { hostTarget: string; customActive: boolean } {
  if (themeId === CUSTOM_THEME_ID) return { hostTarget: OFFICIAL_THEME_ID, customActive: true }
  if (themeId === OFFICIAL_THEME_ID) return { hostTarget: OFFICIAL_THEME_ID, customActive: false }
  return { hostTarget: themeId, customActive: false }
}

type Rgb = readonly [number, number, number]

function hexToRgb(hex: string): Rgb {
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
}

function srgbToLinear(channel: number): number {
  const value = channel / 255
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(channel: number): number {
  const value = channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map(channel => Math.round(channel).toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}

function mix(from: string, to: string, ratio: number): string {
  const amount = Math.min(1, Math.max(0, ratio))
  const a = hexToRgb(from).map(srgbToLinear)
  const b = hexToRgb(to).map(srgbToLinear)
  return toHex(a.map((channel, index) => linearToSrgb(channel + (b[index] - channel) * amount)) as unknown as Rgb)
}

function withAlpha(hex: string, alpha: number): string {
  const [red, green, blue] = hexToRgb(hex)
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function luminance(hex: string): number {
  const [red, green, blue] = hexToRgb(hex).map(srgbToLinear)
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/** WCAG contrast ratio for two opaque `#RRGGBB` colors. */
export function contrastRatio(foreground: string, background: string): number {
  const a = normalizeHex(foreground)
  const b = normalizeHex(background)
  if (a === undefined || b === undefined) return 1
  const lighter = Math.max(luminance(a), luminance(b))
  const darker = Math.min(luminance(a), luminance(b))
  return (lighter + 0.05) / (darker + 0.05)
}

/** Derive the stable DSW semantic token layer from four compact controls. */
export function deriveThemeTokens(palette: PaletteConfig): Readonly<Record<ThemeTokenName, string>> {
  const { accent, background, foreground } = palette
  const c = palette.contrast / 100
  const s = 0.06 + 0.18 * c
  const layer1 = mix(background, foreground, 0.25 * s)
  const layer2 = mix(background, foreground, 0.5 * s)
  const layer3 = mix(background, foreground, 0.75 * s)
  const overlay = mix(background, foreground, 1.8 * s)
  const secondary = mix(foreground, background, 0.38 - 0.16 * c)
  const tertiary = mix(foreground, background, 0.55 - 0.20 * c)
  const accentHover = mix(accent, foreground, 0.14)
  const accentDimmed = mix(background, accent, 0.12 + 0.08 * c)
  const onAccent = contrastRatio('#000000', accent) >= contrastRatio('#FFFFFF', accent) ? '#000000' : '#FFFFFF'
  const feedback = mix(background, foreground, 0.82)
  const baseSurface = withAlpha(background, 0.5)
  const surface1 = withAlpha(layer1, 0.68)
  const surface2 = withAlpha(layer2, 0.76)
  const surface3 = withAlpha(layer3, 0.84)
  const overlaySurface = withAlpha(overlay, 0.94)
  const skeletonSurface = withAlpha(foreground, 0.08)
  const sidebarSurface = withAlpha(layer1, 0.58)

  return {
    '--dsw-alias-bg-base': baseSurface,
    '--dsw-alias-bg-layer-1': surface1,
    '--dsw-alias-bg-layer-2': surface2,
    '--dsw-alias-bg-layer-3': surface3,
    '--dsw-alias-bg-overlay': overlaySurface,
    '--dsw-alias-bg-skeleton': skeletonSurface,
    '--dsw-alias-border-l1': mix(background, foreground, 0.6 * s),
    '--dsw-alias-border-l2': mix(background, foreground, 0.9 * s),
    '--dsw-alias-border-l3': mix(background, foreground, 1.2 * s),
    '--dsw-alias-border-l4': mix(background, foreground, 1.5 * s),
    '--dsw-alias-brand-primary': accent,
    '--dsw-alias-brand-primary-invert': onAccent,
    '--dsw-alias-brand-text': accent,
    '--dsw-alias-button-contrast-fill': foreground,
    '--dsw-alias-button-ghost-active-fill': surface2,
    '--dsw-alias-button-ghost-active-hover': surface3,
    '--dsw-alias-button-primary-dimmed': accentDimmed,
    '--dsw-alias-button-primary-fill': accent,
    '--dsw-alias-button-primary-hover': accentHover,
    '--dsw-alias-button-tool-bar-fill': surface2,
    '--dsw-alias-interactive-bg-active': surface2,
    '--dsw-alias-interactive-bg-hover': surface1,
    '--dsw-alias-interactive-bg-hover-accent': accentDimmed,
    '--dsw-alias-interactive-bg-hover-danger': surface2,
    '--dsw-alias-interactive-bg-hover-solid': surface3,
    '--dsw-alias-label-caption': tertiary,
    '--dsw-alias-label-dimmed': tertiary,
    '--dsw-alias-label-primary': foreground,
    '--dsw-alias-label-primary-dimmed': secondary,
    '--dsw-alias-label-primary-foreground': onAccent,
    '--dsw-alias-label-primary-inverted': background,
    '--dsw-alias-label-secondary': secondary,
    '--dsw-alias-label-tertiary': tertiary,
    '--dsw-alias-markdown-citation': accent,
    '--dsw-alias-markdown-code-block': surface1,
    '--dsw-alias-markdown-code-block-banner': surface2,
    '--dsw-alias-markdown-inline-code': surface1,
    '--dsw-alias-markdown-placeholder': tertiary,
    '--dsw-alias-markdown-tag': accentDimmed,
    '--dsw-alias-toast-bg': feedback,
    '--dsw-alias-tooltip-bg': feedback,
    '--dsw-specific-bubble': surface1,
    '--dsw-specific-bubble-highlight': accentDimmed,
    '--dsw-specific-input-major': surface1,
    '--dsw-specific-login-input': surface1,
    '--dsw-specific-menu': overlaySurface,
    '--dsw-specific-selector': surface2,
    '--dsw-specific-sidebar-fill': sidebarSurface,
    '--dsw-specific-sidebar-nav-item-active': surface2,
    '--dsw-specific-sidebar-nav-item-active-accent': accentDimmed,
    '--dsw-specific-sidebar-nav-item-hover': surface2,
    '--dsw-specific-tip': surface1,
  }
}
