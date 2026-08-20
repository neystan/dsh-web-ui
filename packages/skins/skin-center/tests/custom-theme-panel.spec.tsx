// @vitest-environment jsdom
import { act, Simulate } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { CustomThemeController, type CustomThemeScope } from '../src/client/custom-theme-controller.ts'
import { CustomThemePanel } from '../src/client/CustomThemePanel.tsx'
import { zh, type SkinCenterKey } from '../src/client/locales.ts'

;((globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT) = true

function scope(): CustomThemeScope {
  let value = {}
  const listeners = new Set<() => void>()
  const result: SettingsScope<Record<string, never>> = {
    getSnapshot: (): SettingsScopeSnapshot<Record<string, never>> => ({ status: 'ready', value, base: undefined, user: undefined, revision: 1, writable: true, mode: 'host' }),
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    set: async (key, next) => { value = { ...value, [key]: next }; for (const listener of listeners) listener() },
    unset: async key => { const next = { ...value }; delete next[key as string]; value = next; for (const listener of listeners) listener() },
  }
  return result as unknown as CustomThemeScope
}

function inputValue(field: HTMLInputElement, value: string): void {
  field.value = value
  Simulate.change(field)
}

describe('custom theme card', () => {
  let host: HTMLDivElement
  let root: ReturnType<typeof createRoot>
  let customTheme: CustomThemeController
  const tryOn = vi.fn(async () => null)
  const switchTo = vi.fn(async () => null)
  const runtimeState = { active: null, trying: null, previewing: false }
  const runtime = {
    controller: {
      tryOn,
      switchTo,
      exitTryOn: vi.fn(async () => null),
      getState: () => runtimeState,
    },
    subscribe: (_listener: () => void) => () => {},
  }
  const t = (key: SkinCenterKey): string => zh[key]

  beforeEach(() => {
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    customTheme = new CustomThemeController(scope(), document)
    act(() => {
      root.render(<CustomThemePanel t={t} runtime={runtime as never} theme={{ getTheme: () => ({ active: { colorScheme: 'light' } }) as never }} customTheme={customTheme} />)
    })
  })

  afterEach(() => {
    act(() => { root.unmount() })
    customTheme.dispose()
    host.remove()
    tryOn.mockClear()
    switchTo.mockClear()
  })

  it('renders an editor without a background-image control', () => {
    const edit = [...host.querySelectorAll('button')].find(button => button.textContent === zh.editTheme)
    expect(edit).toBeTruthy()
    act(() => { edit?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(host.querySelector('[data-custom-theme-editor="true"]')).not.toBeNull()
    expect(host.textContent).not.toContain('背景图片')
    expect(host.textContent).toContain(zh.customThemeReset)
  })

  it('uses the existing runtime try-on and apply methods', async () => {
    const buttons = [...host.querySelectorAll('button')]
    const tryButton = buttons.find(button => button.textContent === zh.tryOn)
    const applyButton = buttons.find(button => button.textContent === zh.apply)
    await act(async () => { tryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    await act(async () => { applyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    expect(tryOn).toHaveBeenCalledWith(null, null)
    expect(switchTo).toHaveBeenCalledWith(null, null)
  })

  it('allows a hex field to be edited character by character before blur commits it', () => {
    const edit = [...host.querySelectorAll('button')].find(button => button.textContent === zh.editTheme)
    act(() => { edit?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const field = [...host.querySelectorAll('input[type="text"]')].find(input => input.getAttribute('aria-label') === `${zh.customThemeAccent} hex`) as HTMLInputElement
    expect(field).toBeTruthy()
    act(() => { inputValue(field, '#1') })
    act(() => { inputValue(field, '#12') })
    act(() => { inputValue(field, '#123456') })
    act(() => { Simulate.blur(field) })
    expect(customTheme.profile().accent).toBe('#123456')
  })

  it('keeps the color picker on the last valid color while the hex draft is incomplete', () => {
    const edit = [...host.querySelectorAll('button')].find(button => button.textContent === zh.editTheme)
    act(() => { edit?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const text = host.querySelector(`input[aria-label="${zh.customThemeAccent} hex"]`) as HTMLInputElement
    const picker = host.querySelector(`input[type="color"][aria-label="${zh.customThemeAccent}"]`) as HTMLInputElement
    const previous = customTheme.profile().accent

    act(() => { inputValue(text, '#1') })

    expect(text.value).toBe('#1')
    expect(picker.value).toBe(previous)
    expect(customTheme.profile().accent).toBe(previous)
  })

  it('writes a valid hex color once per input event', () => {
    const edit = [...host.querySelectorAll('button')].find(button => button.textContent === zh.editTheme)
    act(() => { edit?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const text = host.querySelector(`input[aria-label="${zh.customThemeAccent} hex"]`) as HTMLInputElement
    const set = vi.spyOn(customTheme, 'set')

    act(() => { inputValue(text, '#123456') })

    expect(set).toHaveBeenCalledTimes(1)
    expect(set).toHaveBeenCalledWith('accent', '#123456')
  })

  it('exposes the light and dark selectors as pressed buttons rather than incomplete tabs', () => {
    const edit = [...host.querySelectorAll('button')].find(button => button.textContent === zh.editTheme)
    act(() => { edit?.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
    const group = host.querySelector('[role="group"]')
    const light = [...host.querySelectorAll('button')].find(button => button.textContent === zh.customThemeLight)
    const dark = [...host.querySelectorAll('button')].find(button => button.textContent === zh.customThemeDark)

    expect(group?.getAttribute('aria-label')).toBe(zh.theme)
    expect(light?.getAttribute('aria-pressed')).toBe('true')
    expect(dark?.getAttribute('aria-pressed')).toBe('false')
    expect(host.querySelector('[role="tablist"], [role="tab"]')).toBeNull()
  })
})
