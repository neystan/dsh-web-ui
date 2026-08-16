import { describe, expect, it, vi } from 'vitest'
import { generationPrompt, writeClipboard } from './generation-prompt.ts'

describe('custom pet generation prompt', () => {
  it('uses the relative whale template path and exact legacy contract', () => {
    const zh = generationPrompt('zh')
    const en = generationPrompt('en')
    for (const prompt of [zh, en]) {
      expect(prompt).toContain('packages/dsh-pet/assets/whale')
      expect(prompt).toContain('pet.json')
      expect(prompt).toContain('spritesheet.webp')
      expect(prompt).toContain('1536')
      expect(prompt).toContain('1872')
      expect(prompt).toContain('192')
      expect(prompt).toContain('208')
      expect(prompt).toContain('6, 8, 8, 4, 5, 8, 6, 6, 6')
      expect(prompt).not.toMatch(/[A-Za-z]:[\\/]/)
    }
    expect(zh).not.toBe(en)
  })

  it('uses Clipboard API first and reports fallback failure', async () => {
    const writeText = vi.fn(async () => {})
    await writeClipboard('hello', { clipboard: { writeText } })
    expect(writeText).toHaveBeenCalledWith('hello')
    const execCommand = vi.fn(() => false)
    await expect(writeClipboard('hello', {
      document: {
        body: { appendChild() {} },
        createElement: () => ({ style: {}, setAttribute() {}, select() {}, remove() {} }),
        execCommand,
      } as never,
      clipboard: undefined,
    })).rejects.toThrow('clipboard.failed')
  })
})
