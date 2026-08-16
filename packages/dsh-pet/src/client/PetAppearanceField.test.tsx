// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react'
import { PetAppearanceField } from './PetAppearanceField.tsx'
import { t } from './locales.ts'

const official = {
  kind: 'official' as const,
  slot: 'official' as const,
  manifest: {
    id: 'whale-girl',
    displayName: '鲸鱼娘',
    description: '官方',
    spritesheetPath: 'spritesheet.webp' as const,
    frames: [6, 8, 8, 4, 5, 8, 6, 6, 6] as [6, 8, 8, 4, 5, 8, 6, 6, 6],
  },
  revision: 'official',
  manifestUrl: '/pet/whale/pet.json',
  spritesheetUrl: '/pet/whale/spritesheet.webp',
}

const custom = {
  ...official,
  kind: 'custom' as const,
  slot: 'current' as const,
  revision: 'custom',
  manifestUrl: '/pet/custom/current/pet.json?rev=custom',
  spritesheetUrl: '/pet/custom/current/spritesheet.webp?rev=custom',
  manifest: { ...official.manifest, id: 'my-pet', displayName: '我的宠物', description: '自定义' },
}

function appearance(appearanceName: 'official' | 'custom' = 'official') {
  return {
    appearance: appearanceName,
    official,
    ...(appearanceName === 'custom' ? { current: custom } : {}),
    stateToken: `${appearanceName}:state`,
  }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('PetAppearanceField', () => {
  it('renders two selectable cards and applies the selected custom pet without reload', async () => {
    const state = { ...appearance(), current: custom }
    const updated = appearance('custom')
    const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
      if (path === '/api/pet/appearance') return new Response(JSON.stringify(state), { status: 200 })
      expect(path).toBe('/api/pet/appearance/use-custom')
      expect(JSON.parse(String(init?.body))).toEqual({ expectedState: 'official:state' })
      return new Response(JSON.stringify(updated), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) })
    render(<PetAppearanceField t={t} />)
    await waitFor(() => expect(screen.getByText('官方鲸鱼娘')).toBeTruthy())
    expect(screen.getByText('自定义宠物')).toBeTruthy()
    fireEvent.click(screen.getByText('自定义宠物'))
    fireEvent.click(screen.getByRole('button', { name: '使用所选宠物' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/pet/appearance/use-custom', expect.anything()))
    expect(screen.getByText('当前使用')).toBeTruthy()
  })

  it('shows candidate state, supports prompt copy, and confirms deletion', async () => {
    const candidate = { ...custom, slot: 'candidate' as const, revision: 'candidate' }
    const state = { ...appearance(), candidate }
    const fetchMock = vi.fn(async (path: string) => {
      if (path === '/api/pet/appearance') return new Response(JSON.stringify(state), { status: 200 })
      return new Response(JSON.stringify(appearance()), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({ matches: true }) })
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => {}) } })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<PetAppearanceField t={t} />)
    await waitFor(() => expect(screen.getByText('待应用')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '复制生成提示词' }))
    await waitFor(() => expect(screen.getByText('已复制')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '删除自定义宠物' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/pet/appearance/delete', expect.anything()))
  })
})
