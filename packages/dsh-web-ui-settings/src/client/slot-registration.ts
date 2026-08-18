/**
 * Bridge for the settings-group package across rc.6 and rc.7.
 *
 * rc.6 declared `settings.plugin.item` as an ordered list and required `id`.
 * rc.7 declares it as a keyed slot owned by the official settings-plugins
 * package and requires `key`. In rc.7 the family cards register themselves
 * directly under their settings namespaces, so this legacy group must not
 * attempt to occupy the keyed slot.
 */

export interface SlotSpecLike {
  kind: string
}

export interface SlotRegistrationApi {
  spec(name: string): SlotSpecLike | undefined
  register(options: unknown, component: unknown): () => void
}

export interface LegacyGroupOptions {
  name: 'settings.plugin.item'
  id: string
  order?: number
  locale?: string
  children?: unknown
}

/**
 * Register the rc.6 Web UI group only when the host still exposes the old
 * list slot. On rc.7 this intentionally returns a no-op disposer and leaves
 * the official keyed slot to the namespace-owned family cards.
 */
export function registerWebUiSettingsGroup(
  slots: SlotRegistrationApi,
  options: LegacyGroupOptions,
  component: unknown,
): () => void {
  if (slots.spec('settings.plugin.item')?.kind === 'keyed') return () => undefined
  return slots.register(options, component)
}
