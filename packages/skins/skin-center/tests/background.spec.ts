/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '@deepseek-ai/dsh-client-runtime/client'
import { BackgroundController, SCRIM_VAR } from '../src/client/background.ts'
import type { BackgroundSettings } from '../src/core/background.ts'

const firstRevision = 'a'.repeat(64)
const secondRevision = 'b'.repeat(64)

function ready(value: BackgroundSettings): SettingsScopeSnapshot<BackgroundSettings> {
  return {
    status: 'ready', value, base: undefined, user: undefined,
    revision: 1, writable: true, mode: 'host',
  }
}

function fakeScope(initial: BackgroundSettings) {
  let snapshot = ready(initial)
  const listeners = new Set<() => void>()
  const sets: Array<[string, unknown]> = []
  const unsets: string[] = []
  const publish = (value: BackgroundSettings) => {
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
        publish(next as unknown as BackgroundSettings)
      },
    } satisfies SettingsScope<BackgroundSettings>,
    sets,
    unsets,
    listenerCount: () => listeners.size,
  }
}

afterEach(() => {
  document.body.innerHTML = ''
  document.body.removeAttribute('style')
  document.body.removeAttribute('data-dsh-blue-fantasy')
})

describe('BackgroundController', () => {
  it('switches custom, none, and skin modes while preserving opacity', async () => {
    document.body.style.setProperty('background-image', 'url(skin.png)', 'important')
    const dragon = document.createElement('div')
    dragon.dataset.skinChrome = 'backdrop'
    document.body.append(dragon)
    const fake = fakeScope({ version: 1, mode: 'custom', backgroundOpacity: 35, imageRevision: firstRevision })
    const controller = new BackgroundController(fake.scope, document.body)

    expect(document.body.style.getPropertyValue('background-image')).toContain(`/api/skin-center/background/${firstRevision}.webp`)
    expect(document.body.style.getPropertyValue(SCRIM_VAR)).toBe('0.35')
    expect(dragon.style.getPropertyValue('display')).toBe('none')

    await controller.setMode('none')
    expect(document.body.style.getPropertyValue('background-image')).toBe('none')
    expect(document.body.style.getPropertyValue(SCRIM_VAR)).toBe('')
    expect(controller.getSnapshot().settings.backgroundOpacity).toBe(35)

    await controller.setMode('skin')
    expect(document.body.style.getPropertyValue('background-image')).toBe('url("skin.png")')
    expect(document.body.style.getPropertyPriority('background-image')).toBe('important')
    expect(document.body.style.getPropertyValue(SCRIM_VAR)).toBe('0.35')
    expect(dragon.style.getPropertyValue('display')).toBe('')
    controller.dispose()
  })

  it('re-suppresses skin writes and newly mounted stable art nodes', async () => {
    document.body.style.backgroundImage = 'url(original.png)'
    const fake = fakeScope({ version: 1, mode: 'custom', backgroundOpacity: 0, imageRevision: firstRevision })
    const controller = new BackgroundController(fake.scope, document.body)
    document.body.style.backgroundImage = 'url(ghost.png)'
    const stage = document.createElement('div')
    stage.dataset.skinChrome = 'stage'
    document.body.append(stage)

    await vi.waitFor(() => {
      expect(document.body.style.backgroundImage).toContain(firstRevision)
      expect(stage.style.display).toBe('none')
    })
    await controller.setMode('skin')
    expect(document.body.style.backgroundImage).toBe('url("ghost.png")')
    expect(stage.style.display).toBe('')
    controller.dispose()
  })

  it('rebases the skin backdrop across a try-on suspend and resume cycle', async () => {
    document.body.style.backgroundImage = 'url(active.png)'
    const fake = fakeScope({ version: 1, mode: 'custom', backgroundOpacity: 20, imageRevision: firstRevision })
    const controller = new BackgroundController(fake.scope, document.body)

    controller.suspend()
    expect(document.body.style.backgroundImage).toBe('url("active.png")')
    document.body.style.backgroundImage = 'url(preview.png)'
    controller.resume()
    expect(document.body.style.backgroundImage).toContain(firstRevision)

    controller.suspend()
    expect(document.body.style.backgroundImage).toBe('url("preview.png")')
    document.body.style.backgroundImage = 'url(active.png)'
    controller.resume()
    await controller.setMode('skin')
    expect(document.body.style.backgroundImage).toBe('url("active.png")')
    controller.dispose()
  })

  it('settles after applying its own body style writes', async () => {
    const fake = fakeScope({ version: 1, mode: 'custom', backgroundOpacity: 20, imageRevision: firstRevision })
    const controller = new BackgroundController(fake.scope, document.body)
    let publishes = 0
    controller.subscribe(() => { publishes += 1 })

    await new Promise(resolve => setTimeout(resolve, 20))
    const settled = publishes
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(publishes).toBe(settled)
    controller.dispose()
  })

  it('does not observe its own style writes on browsers that report same-value mutations', async () => {
    const NativeObserver = window.MutationObserver
    const originalSetProperty = document.body.style.setProperty.bind(document.body.style)
    let callback: MutationCallback | undefined
    let active = false
    let callbacks = 0
    class SameValueObserver {
      constructor(next: MutationCallback) { callback = next }
      observe(): void { active = true }
      disconnect(): void { active = false }
      takeRecords(): MutationRecord[] { return [] }
    }
    Object.defineProperty(window, 'MutationObserver', { configurable: true, value: SameValueObserver })
    const write = vi.spyOn(document.body.style, 'setProperty').mockImplementation((property, value, priority) => {
      originalSetProperty(property, value, priority)
      if (active && callbacks < 8) {
        queueMicrotask(() => {
          if (!active || callback === undefined) return
          callbacks += 1
          callback([], {} as MutationObserver)
        })
      }
    })

    try {
      const fake = fakeScope({ version: 1, mode: 'custom', backgroundOpacity: 20, imageRevision: firstRevision })
      const controller = new BackgroundController(fake.scope, document.body)
      await new Promise(resolve => setTimeout(resolve, 20))
      expect(callbacks).toBe(0)
      controller.dispose()
    } finally {
      write.mockRestore()
      Object.defineProperty(window, 'MutationObserver', { configurable: true, value: NativeObserver })
    }
  })

  it('falls back to skin art for a missing revision without rewriting settings', () => {
    document.body.style.backgroundImage = 'url(skin.png)'
    const fake = fakeScope({ version: 1, mode: 'custom', backgroundOpacity: 20, imageRevision: firstRevision })
    const controller = new BackgroundController(fake.scope, document.body)
    controller.reportMissingRevision(firstRevision)
    expect(document.body.style.backgroundImage).toBe('url("skin.png")')
    expect(controller.getSnapshot().missingImage).toBe(true)
    expect(fake.sets).toEqual([])
    controller.dispose()
  })

  it('replaces and deletes persisted revisions in safe order', async () => {
    const fake = fakeScope({ version: 1, mode: 'custom', backgroundOpacity: 20, imageRevision: firstRevision })
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
    const controller = new BackgroundController(fake.scope, document.body, fetcher)
    await controller.commitRevision(secondRevision)
    expect(fake.sets.slice(0, 2)).toEqual([['imageRevision', secondRevision], ['mode', 'custom']])
    expect(fetcher).toHaveBeenCalledWith(`/api/skin-center/background/${firstRevision}.webp`, { method: 'DELETE' })

    await controller.deleteRevision()
    expect(fetcher).toHaveBeenCalledWith(`/api/skin-center/background/${secondRevision}.webp`, { method: 'DELETE' })
    expect(fake.unsets).toEqual(['imageRevision'])
    expect(fake.sets.at(-1)).toEqual(['mode', 'skin'])
    controller.dispose()
    expect(fake.listenerCount()).toBe(0)
  })

  it('rolls back a partially published replacement before removing the new asset', async () => {
    const fake = fakeScope({ version: 1, mode: 'skin', backgroundOpacity: 20, imageRevision: firstRevision })
    const originalSet = fake.scope.set.bind(fake.scope)
    fake.scope.set = async (field: string, value: unknown) => {
      if (field === 'mode') return
      await originalSet(field, value)
    }
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
    const controller = new BackgroundController(fake.scope, document.body, fetcher)

    await expect(controller.commitRevision(secondRevision)).rejects.toThrow('background-settings-write-failed')
    expect(controller.getSnapshot().settings).toMatchObject({ mode: 'skin', imageRevision: firstRevision })
    expect(fetcher).toHaveBeenCalledWith(
      `/api/skin-center/background/${secondRevision}.webp`,
      { method: 'DELETE' },
    )
    controller.dispose()
  })

  it('does not delete an asset while persisted settings still reference it', async () => {
    const fake = fakeScope({ version: 1, mode: 'custom', backgroundOpacity: 20, imageRevision: firstRevision })
    fake.scope.unset = async () => {}
    const fetcher = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch
    const controller = new BackgroundController(fake.scope, document.body, fetcher)

    await expect(controller.deleteRevision()).rejects.toThrow('background-settings-write-failed')
    expect(controller.getSnapshot().settings.imageRevision).toBe(firstRevision)
    expect(fetcher).not.toHaveBeenCalled()
    controller.dispose()
  })
})
