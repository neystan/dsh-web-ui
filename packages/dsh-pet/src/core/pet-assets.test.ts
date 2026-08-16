import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  PET_ACTIONS,
  PET_ATLAS_HEIGHT,
  PET_ATLAS_WIDTH,
  PET_FRAME_COUNTS,
  PET_MANIFEST_MAX_BYTES,
  PET_SPRITESHEET_MAX_BYTES,
  inspectWebpContainer,
  parsePetManifest,
} from './pet-assets.ts'

const assetDir = join(process.cwd(), 'assets', 'whale')
const manifestText = readFileSync(join(assetDir, 'pet.json'), 'utf8')
const spritesheet = readFileSync(join(assetDir, 'spritesheet.webp'))

describe('pet asset contract', () => {
  it('accepts the official manifest and lossless spritesheet as the golden sample', () => {
    const manifest = parsePetManifest(manifestText)
    expect(manifest.frames).toEqual(PET_FRAME_COUNTS)
    expect(PET_ACTIONS).toHaveLength(9)
    expect(inspectWebpContainer(spritesheet)).toEqual({
      width: PET_ATLAS_WIDTH,
      height: PET_ATLAS_HEIGHT,
      hasAlpha: true,
    })
  })

  it('rejects unknown fields and malformed frame contracts', () => {
    expect(() => parsePetManifest(JSON.stringify({
      id: 'ok',
      displayName: 'Pet',
      description: '',
      spritesheetPath: 'spritesheet.webp',
      frames: [...PET_FRAME_COUNTS.slice(0, 8), 5],
      extra: true,
    }))).toThrowError('manifest.unknown-field')
    expect(() => parsePetManifest(JSON.stringify({
      id: 'ok',
      displayName: 'Pet',
      description: '',
      spritesheetPath: 'spritesheet.webp',
      frames: [6, 8, 8, 4, 5, 8, 6, 6, 5],
    }))).toThrowError('manifest.invalid-frames')
  })

  it('enforces manifest byte and text boundaries', () => {
    expect(() => parsePetManifest(JSON.stringify({
      id: 'a'.repeat(64),
      displayName: 'x'.repeat(40),
      description: 'x'.repeat(160),
      spritesheetPath: 'spritesheet.webp',
      frames: PET_FRAME_COUNTS,
    }))).not.toThrow()
    expect(PET_MANIFEST_MAX_BYTES).toBe(64 * 1024)
    expect(PET_SPRITESHEET_MAX_BYTES).toBe(8 * 1024 * 1024)
    expect(() => parsePetManifest(`${manifestText}${' '.repeat(PET_MANIFEST_MAX_BYTES)}`)).toThrowError('manifest.too-large')
  })

  it('rejects malformed, dimensionless, and non-alpha WebP containers', () => {
    expect(() => inspectWebpContainer(new Uint8Array(24))).toThrowError('webp.invalid-header')
    const noAlpha = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x1e, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x58, 0x0a, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0xff, 0x05, 0x00, 0x4f, 0x07, 0x00,
      0x56, 0x50, 0x38, 0x20, 0x00, 0x00, 0x00, 0x00,
    ])
    expect(() => inspectWebpContainer(noAlpha)).toThrowError('webp.no-alpha')
  })
})
