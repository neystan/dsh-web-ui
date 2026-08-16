/** Shared custom-pet asset contract used by the host and browser halves. */

export const PET_ACTIONS = [
  'idle',
  'running-right',
  'running-left',
  'waving',
  'jumping',
  'failed',
  'waiting',
  'running',
  'review',
] as const

export const PET_FRAME_COUNTS = [6, 8, 8, 4, 5, 8, 6, 6, 6] as const
export const PET_ATLAS_COLUMNS = 8
export const PET_ATLAS_ROWS = 9
export const PET_FRAME_WIDTH = 192
export const PET_FRAME_HEIGHT = 208
export const PET_ATLAS_WIDTH = PET_ATLAS_COLUMNS * PET_FRAME_WIDTH
export const PET_ATLAS_HEIGHT = PET_ATLAS_ROWS * PET_FRAME_HEIGHT
export const PET_MANIFEST_MAX_BYTES = 64 * 1024
export const PET_SPRITESHEET_MAX_BYTES = 8 * 1024 * 1024
export const PET_IMPORT_BODY_MAX_BYTES = 12 * 1024 * 1024

export type PetAction = typeof PET_ACTIONS[number]
export type PetFrameCounts = typeof PET_FRAME_COUNTS

export interface PetAssetManifest {
  id: string
  displayName: string
  description: string
  spritesheetPath: 'spritesheet.webp'
  frames: [6, 8, 8, 4, 5, 8, 6, 6, 6]
}

export type PetAssetErrorCode =
  | 'manifest.invalid-json'
  | 'manifest.too-large'
  | 'manifest.invalid-object'
  | 'manifest.unknown-field'
  | 'manifest.invalid-id'
  | 'manifest.invalid-name'
  | 'manifest.description-too-long'
  | 'manifest.invalid-path'
  | 'manifest.invalid-frames'
  | 'webp.too-large'
  | 'webp.invalid-header'
  | 'webp.truncated'
  | 'webp.invalid-vp8l'
  | 'webp.invalid-vp8x'
  | 'webp.invalid-dimensions'
  | 'webp.no-alpha'

export class PetAssetValidationError extends Error {
  readonly code: PetAssetErrorCode

  constructor(code: PetAssetErrorCode) {
    super(code)
    this.name = 'PetAssetValidationError'
    this.code = code
  }
}

function fail(code: PetAssetErrorCode): never {
  throw new PetAssetValidationError(code)
}

function textLength(value: string): number {
  return Array.from(value).length
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Parse the exact five-field manifest contract. */
export function parsePetManifest(text: string): PetAssetManifest {
  if (typeof text !== 'string' || new TextEncoder().encode(text).byteLength > PET_MANIFEST_MAX_BYTES) {
    fail('manifest.too-large')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    fail('manifest.invalid-json')
  }
  if (!isRecord(parsed)) fail('manifest.invalid-object')

  const allowed = new Set(['id', 'displayName', 'description', 'spritesheetPath', 'frames'])
  for (const key of Object.keys(parsed)) {
    if (!allowed.has(key)) fail('manifest.unknown-field')
  }

  const id = parsed.id
  if (typeof id !== 'string' || !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(id)) {
    fail('manifest.invalid-id')
  }

  const displayName = parsed.displayName
  if (typeof displayName !== 'string') fail('manifest.invalid-name')
  const normalizedName = displayName.trim()
  if (normalizedName.length === 0 || textLength(normalizedName) > 40) fail('manifest.invalid-name')

  const description = parsed.description
  if (typeof description !== 'string') fail('manifest.description-too-long')
  const normalizedDescription = description.trim()
  if (textLength(normalizedDescription) > 160) fail('manifest.description-too-long')

  if (parsed.spritesheetPath !== 'spritesheet.webp') fail('manifest.invalid-path')
  if (!Array.isArray(parsed.frames)
    || parsed.frames.length !== PET_FRAME_COUNTS.length
    || parsed.frames.some((value, index) => value !== PET_FRAME_COUNTS[index])) {
    fail('manifest.invalid-frames')
  }

  return {
    id,
    displayName: normalizedName,
    description: normalizedDescription,
    spritesheetPath: 'spritesheet.webp',
    frames: [...PET_FRAME_COUNTS] as PetAssetManifest['frames'],
  }
}

function fourCC(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(bytes[offset]!, bytes[offset + 1]!, bytes[offset + 2]!, bytes[offset + 3]!)
}

function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]!
    | (bytes[offset + 1]! << 8)
    | (bytes[offset + 2]! << 16)
    | (bytes[offset + 3]! << 24)) >>> 0
}

function u24(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
}

/** Inspect a static WebP container without a native image decoder. */
export function inspectWebpContainer(input: Uint8Array): { width: number; height: number; hasAlpha: boolean } {
  if (input.byteLength > PET_SPRITESHEET_MAX_BYTES) fail('webp.too-large')
  if (input.byteLength < 20 || fourCC(input, 0) !== 'RIFF' || fourCC(input, 8) !== 'WEBP') {
    fail('webp.invalid-header')
  }

  const riffSize = u32(input, 4)
  const end = riffSize + 8
  if (end > input.byteLength || end < 20) fail('webp.truncated')

  let offset = 12
  let width = 0
  let height = 0
  let hasAlpha = false
  let hasImage = false
  let vp8xHasAlpha = false
  let vp8lHasAlpha = false
  while (offset + 8 <= end) {
    const kind = fourCC(input, offset)
    const size = u32(input, offset + 4)
    const data = offset + 8
    const next = data + size + (size & 1)
    if (next > end) fail('webp.truncated')

    if (kind === 'VP8L') {
      if (size < 5 || input[data] !== 0x2f) fail('webp.invalid-vp8l')
      const bits = u32(input, data + 1)
      const vp8lWidth = 1 + (bits & 0x3fff)
      const vp8lHeight = 1 + ((bits >>> 14) & 0x3fff)
      width = width === 0 ? vp8lWidth : width
      height = height === 0 ? vp8lHeight : height
      vp8lHasAlpha = (bits & 0x10000000) !== 0
      hasImage = true
    } else if (kind === 'VP8X') {
      if (size < 10) fail('webp.invalid-vp8x')
      const flags = input[data]!
      width = 1 + u24(input, data + 4)
      height = 1 + u24(input, data + 7)
      vp8xHasAlpha = (flags & 0x10) !== 0
    } else if (kind === 'ALPH') {
      hasAlpha = true
    } else if (kind === 'VP8 ') {
      hasImage = true
    }
    offset = next
  }

  if (offset !== end || !hasImage || width <= 0 || height <= 0) fail('webp.invalid-dimensions')
  hasAlpha = hasAlpha || vp8lHasAlpha || vp8xHasAlpha
  if (!hasAlpha) fail('webp.no-alpha')
  if (width !== PET_ATLAS_WIDTH || height !== PET_ATLAS_HEIGHT) fail('webp.invalid-dimensions')
  return { width, height, hasAlpha: true }
}
