import { describe, expect, it } from 'vitest'
import { registerWebUiSettingsGroup } from '../src/client/slot-registration.ts'

describe('rc.7 settings slot contract', () => {
  it('skips the legacy group registration when rc.7 owns a keyed slot', () => {
    const registrations: unknown[] = []
    const slots = {
      spec: () => ({ kind: 'keyed' as const }),
      register: (options: unknown) => {
        registrations.push(options)
        return () => undefined
      },
    }

    const dispose = registerWebUiSettingsGroup(
      slots,
      { name: 'settings.plugin.item', id: 'web-ui-plugins' },
      () => null,
    )
    expect(dispose).toEqual(expect.any(Function))
    expect(registrations).toHaveLength(0)
    dispose()
  })
})
