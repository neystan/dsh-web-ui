/**
 * Allowlist parsing and composition: the settings.yaml web_settings_namespaces
 * key (list and map shapes), package-name aliasing, and the registered-set
 * intersection that keeps the bridge from surfacing anything unknown.
 */

import { describe, expect, it } from 'vitest'
import { composeAllowlist, extractWebSettingsNamespaces, resolveNamespaceEntry } from '../src/allowlist.ts'

describe('extractWebSettingsNamespaces', () => {
  it('reads a block list', () => {
    const text = [
      'web_settings_namespaces:',
      '  - dsh-pet',
      '  - dsh-client-ui-task-board',
      '  - "dsh-skins"',
    ].join('\n')
    expect(extractWebSettingsNamespaces(text)).toEqual(['dsh-pet', 'dsh-client-ui-task-board', 'dsh-skins'])
  })

  it('reads a block map', () => {
    const text = [
      'web_settings_namespaces:',
      '  dsh-client-ui-task-board: true',
      '  dsh-pet: {}',
    ].join('\n')
    expect(extractWebSettingsNamespaces(text)).toEqual(['dsh-client-ui-task-board', 'dsh-pet'])
  })

  it('reads an inline flow list', () => {
    expect(extractWebSettingsNamespaces('web_settings_namespaces: [dsh-pet, "dsh-skins"]')).toEqual(['dsh-pet', 'dsh-skins'])
  })

  it('skips comment lines and stops at the next top-level key', () => {
    const text = [
      'web_settings_namespaces:',
      '  - dsh-pet',
      '  # a comment',
      'llm:',
      '  provider: x',
    ].join('\n')
    expect(extractWebSettingsNamespaces(text)).toEqual(['dsh-pet'])
  })

  it('returns the empty list when the key is absent or the file is empty', () => {
    expect(extractWebSettingsNamespaces('llm:\n  provider: x\n')).toEqual([])
    expect(extractWebSettingsNamespaces('')).toEqual([])
  })
})

describe('resolveNamespaceEntry', () => {
  it('maps package names onto their settings namespaces', () => {
    expect(resolveNamespaceEntry('dsh-client-ui-task-board')).toBe('task-board')
    expect(resolveNamespaceEntry('dsh-skins')).toBe('skin-background')
    expect(resolveNamespaceEntry('dsh-pet')).toBe('pet')
  })

  it('passes bare family namespaces through', () => {
    expect(resolveNamespaceEntry('pet')).toBe('pet')
    expect(resolveNamespaceEntry('skin-background')).toBe('skin-background')
    expect(resolveNamespaceEntry('skin-custom-theme')).toBe('skin-custom-theme')
  })

  it('ignores packages without a settings namespace and unknown names', () => {
    expect(resolveNamespaceEntry('dsh-web-ui')).toBeUndefined()
    expect(resolveNamespaceEntry('dsh-client-ui-aionui-panel')).toBeUndefined()
    expect(resolveNamespaceEntry('dsh-client-ui-web-ui-settings')).toBeUndefined()
    expect(resolveNamespaceEntry('something-else')).toBeUndefined()
  })
})

describe('composeAllowlist', () => {
  const registered = [
    'task-board',
    'pet',
    'skin-background',
    'skin-custom-theme',
    'web-search-deepseek',
  ]

  it('falls back to the family list when the user configured none', () => {
    expect(composeAllowlist([], registered)).toEqual([
      'pet',
      'skin-background',
      'skin-custom-theme',
      'task-board',
    ])
  })

  it('honors user entries, deduplicates, and ignores unknown names', () => {
    expect(composeAllowlist(['dsh-client-ui-task-board', 'dsh-skins', 'dsh-pet', 'nope'], registered))
      .toEqual(['pet', 'skin-background', 'skin-custom-theme', 'task-board'])
  })

  it('drops namespaces not registered in the settings seam', () => {
    expect(composeAllowlist(['dsh-pet'], ['web-search-deepseek'])).toEqual([])
    expect(composeAllowlist([], [])).toEqual([])
  })
})
