/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { BackgroundController } from '../src/client/background.ts'
import { CustomThemeController } from '../src/client/custom-theme.ts'
import type { BackgroundSettings } from '../src/core/background.ts'
import {
  OFFICIAL_THEME_PRESETS,
  THEME_TOKEN_ALLOWLIST,
  type CustomThemeSettings,
  type PaletteConfig,
} from '../src/core/theme.ts'

const light: PaletteConfig = {
  accent: '#339CFF',
  background: '#FFFFFF',
  foreground: '#181818',
  contrast: 60,
}

const dark: PaletteConfig = {
  accent: '#339CFF',
  background: '#181818',
  foreground: '#FFFFFF',
  contrast: 73,
}

const backgroundRevision = 'a'.repeat(64)

afterEach(() => {
  document.body.removeAttribute('style')
  document.body.removeAttribute('data-ds-dark-theme')
})

function ready<T>(value: T): SettingsScopeSnapshot<T> {
  return {
    status: 'ready', value, base: undefined, user: undefined,
    revision: 1, writable: true, mode: 'host',
  }
}

function fakeScope(initial: CustomThemeSettings) {
  let snapshot = ready(initial)
  const listeners = new Set<() => void>()
  const sets: Array<[string, unknown]> = []
  const unsets: string[] = []
  const publish = (value: CustomThemeSettings) => {
    snapshot = ready(value)
    for (const listener of listeners) listener()
  }
  return {
    scope: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
      set: async (field: string, value: unknown) => {
        sets.push([field, value])
        publish({ ...snapshot.value!, [field]: value })
      },
      unset: async (field: string) => {
        unsets.push(field)
        const next = { ...snapshot.value! } as Record<string, unknown>
        delete next[field]
        publish(next as CustomThemeSettings)
      },
    } satisfies SettingsScope<CustomThemeSettings>,
    publish,
    listenerCount: () => listeners.size,
    sets,
    unsets,
  }
}

function fakeBackgroundScope(initial: BackgroundSettings): SettingsScope<BackgroundSettings> {
  let snapshot = ready(initial)
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    set: async (field: string, value: unknown) => {
      snapshot = { ...snapshot, value: { ...snapshot.value!, [field]: value } }
      for (const listener of listeners) listener()
    },
    unset: async (field: string) => {
      const value = { ...snapshot.value! } as Record<string, unknown>
      delete value[field]
      snapshot = { ...snapshot, value: value as unknown as BackgroundSettings }
      for (const listener of listeners) listener()
    },
  }
}

describe('CustomThemeController', () => {
  it('keeps theme surfaces translucent with and without a custom background', async () => {
    document.body.setAttribute('data-ds-dark-theme', '')
    const background = new BackgroundController(fakeBackgroundScope({
      version: 1,
      mode: 'custom',
      backgroundOpacity: 35,
      imageRevision: backgroundRevision,
    }), document.body)
    const theme = new CustomThemeController(
      fakeScope({ version: 2, active: true, dark }).scope,
      document.body,
      true,
    )

    try {
      expect(document.body.style.backgroundImage).toContain(backgroundRevision)
      expect(document.body.style.getPropertyValue('--dsw-alias-bg-base')).toMatch(/^rgba\(/)
      expect(document.body.style.getPropertyValue('--dsw-specific-sidebar-fill')).toMatch(/^rgba\(/)
      expect(document.body.style.backgroundColor).toBe('rgb(24, 24, 24)')

      await background.setMode('none')
      await vi.waitFor(() => {
        expect(document.body.style.backgroundImage).toBe('none')
        expect(document.body.style.getPropertyValue('--dsw-alias-bg-base')).toBe('rgba(24, 24, 24, 0.5)')
        expect(document.body.style.backgroundColor).toBe('rgb(24, 24, 24)')
      })
    } finally {
      theme.dispose()
      background.dispose()
    }
  })

  it('applies saved colors during official-surface boot before the settings card mounts', () => {
    const fake = fakeScope({ version: 2, active: true, light })
    const BootController = CustomThemeController as unknown as new (
      scope: SettingsScope<CustomThemeSettings>,
      body: HTMLElement,
      officialActive: boolean,
    ) => CustomThemeController
    const controller = new BootController(fake.scope, document.body, true)

    expect(document.body.style.getPropertyValue('--dsw-alias-bg-base')).toBe('rgba(255, 255, 255, 0.5)')
    expect(document.body.style.backgroundColor).toBe('rgb(255, 255, 255)')
    controller.dispose()
  })

  it('applies the current mode only while the official surface is active', async () => {
    const fake = fakeScope({ version: 2, active: true, light, dark })
    document.body.removeAttribute('data-ds-dark-theme')
    const controller = new CustomThemeController(fake.scope, document.body)
    controller.setOfficialActive(true)
    expect(document.body.style.getPropertyValue('--dsw-alias-bg-base')).toBe('rgba(255, 255, 255, 0.5)')

    document.body.setAttribute('data-ds-dark-theme', '')
    await vi.waitFor(() => {
      expect(document.body.style.getPropertyValue('--dsw-alias-bg-base')).toBe('rgba(24, 24, 24, 0.5)')
      expect(document.body.style.backgroundColor).toBe('rgb(24, 24, 24)')
    })

    controller.setOfficialActive(false)
    expect(document.body.style.getPropertyValue('--dsw-alias-bg-base')).toBe('')
    controller.dispose()
  })

  it('restores original inline values and priorities on suspend and dispose', () => {
    document.body.style.setProperty('--dsw-alias-bg-base', '#010203', 'important')
    document.body.style.setProperty('background-color', '#040506', 'important')
    const fake = fakeScope({ version: 2, active: true, dark })
    document.body.setAttribute('data-ds-dark-theme', '')
    const controller = new CustomThemeController(fake.scope, document.body)
    controller.setOfficialActive(true)
    expect(document.body.style.getPropertyValue('--dsw-alias-bg-base')).toBe('rgba(24, 24, 24, 0.5)')
    expect(document.body.style.backgroundColor).toBe('rgb(24, 24, 24)')

    controller.suspend()
    expect(document.body.style.getPropertyValue('--dsw-alias-bg-base')).toBe('#010203')
    expect(document.body.style.getPropertyPriority('--dsw-alias-bg-base')).toBe('important')
    expect(document.body.style.backgroundColor).toBe('rgb(4, 5, 6)')
    expect(document.body.style.getPropertyPriority('background-color')).toBe('important')
    controller.resume()
    expect(document.body.style.getPropertyValue('--dsw-alias-bg-base')).toBe('rgba(24, 24, 24, 0.5)')
    expect(document.body.style.backgroundColor).toBe('rgb(24, 24, 24)')

    controller.dispose()
    expect(document.body.style.getPropertyValue('--dsw-alias-bg-base')).toBe('#010203')
    expect(document.body.style.getPropertyPriority('--dsw-alias-bg-base')).toBe('important')
    expect(document.body.style.backgroundColor).toBe('rgb(4, 5, 6)')
    expect(document.body.style.getPropertyPriority('background-color')).toBe('important')
    expect(fake.listenerCount()).toBe(0)
  })

  it('previews without persisting and limits writes to the allowlist', () => {
    const fake = fakeScope({ version: 2, active: false })
    document.body.removeAttribute('data-ds-dark-theme')
    const controller = new CustomThemeController(fake.scope, document.body)
    controller.setOfficialActive(true)
    controller.preview('light', light)

    expect(fake.sets).toEqual([])
    expect(THEME_TOKEN_ALLOWLIST.every(token => document.body.style.getPropertyValue(token) !== '')).toBe(true)
    expect(document.body.style.getPropertyValue('--dsw-alias-state-error-primary')).toBe('')

    controller.preview('light')
    expect(document.body.style.getPropertyValue('--dsw-alias-bg-base')).toBe('')
    controller.dispose()
  })

  it('persists activation independently without deleting saved palettes', async () => {
    const fake = fakeScope({ version: 2, active: false, light })
    const controller = new CustomThemeController(fake.scope, document.body, true)

    await controller.setActive(true)

    expect(fake.sets).toEqual([['version', 2], ['active', true]])
    expect(controller.getSnapshot().settings).toEqual({ version: 2, active: true, light })
    expect(document.body.style.getPropertyValue('--dsw-alias-brand-primary')).toBe(light.accent)
    controller.dispose()
  })

  it('starts and exits a temporary custom trial without persisting', () => {
    const fake = fakeScope({ version: 2, active: false, dark })
    document.body.setAttribute('data-ds-dark-theme', '')
    const controller = new CustomThemeController(fake.scope, document.body, true)

    controller.startTrial('dark')
    expect(document.body.style.getPropertyValue('--dsw-alias-brand-primary')).toBe(dark.accent)
    expect(fake.sets).toEqual([])

    controller.endTrial()
    expect(document.body.style.getPropertyValue('--dsw-alias-brand-primary')).toBe('')
    controller.dispose()
  })

  it('serializes palette save and default restoration through the settings scope', async () => {
    const fake = fakeScope({ version: 2, active: true })
    const controller = new CustomThemeController(fake.scope, document.body)
    await controller.save('dark', dark)
    expect(fake.sets).toEqual([['version', 2], ['active', true], ['dark', dark]])

    await controller.restoreDefaults()
    expect(controller.getSnapshot().settings).toEqual({
      version: 2,
      active: true,
      light: OFFICIAL_THEME_PRESETS.light,
      dark: OFFICIAL_THEME_PRESETS.dark,
    })
    controller.dispose()
  })

  it('preserves migrated activation when the first version 2 palette is saved', async () => {
    const legacy = { version: 1, light } as unknown as CustomThemeSettings
    const fake = fakeScope(legacy)
    const controller = new CustomThemeController(fake.scope, document.body, true)

    await controller.save('dark', dark)

    expect(controller.getSnapshot().settings.active).toBe(true)
    expect(fake.sets).toEqual([['version', 2], ['active', true], ['dark', dark]])
    controller.dispose()
  })

  it('rejects an acknowledged save that was not published and restores the previous palette', async () => {
    const fake = fakeScope({ version: 2, active: true, dark })
    const originalSet = fake.scope.set.bind(fake.scope)
    fake.scope.set = async (field: string, value: unknown) => {
      if (field === 'dark') return
      await originalSet(field, value)
    }
    const controller = new CustomThemeController(fake.scope, document.body)

    await expect(controller.save('dark', light)).rejects.toThrow('theme-settings-write-failed')
    expect(controller.getSnapshot().settings.dark).toEqual(dark)
    controller.dispose()
  })

  it('rolls back a partially published default restoration', async () => {
    const previousDark = { ...dark, accent: '#FF0000' }
    const fake = fakeScope({ version: 2, active: true, light, dark: previousDark })
    const originalSet = fake.scope.set.bind(fake.scope)
    fake.scope.set = async (field: string, value: unknown) => {
      if (field === 'dark') return
      await originalSet(field, value)
    }
    const controller = new CustomThemeController(fake.scope, document.body)

    await expect(controller.restoreDefaults()).rejects.toThrow('theme-settings-write-failed')
    expect(controller.getSnapshot().settings).toEqual({ version: 2, active: true, light, dark: previousDark })
    controller.dispose()
  })
})
