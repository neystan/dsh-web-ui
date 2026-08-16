/** Pure background settings migration and WebP header inspection. */

export type BackgroundMode = 'skin' | 'custom' | 'none'

export interface BackgroundSettings {
  version: 1
  mode: BackgroundMode
  backgroundOpacity: number
  imageRevision?: string
}

export const BACKGROUND_REVISION = /^[a-f0-9]{64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Migrate opacity-only settings and discard invalid optional fields. */
export function normalizeBackgroundSettings(value: unknown): BackgroundSettings {
  const input = isRecord(value) ? value : {}
  const rawOpacity = input.backgroundOpacity
  const backgroundOpacity = typeof rawOpacity === 'number' && Number.isFinite(rawOpacity)
    ? Math.max(0, Math.min(100, Math.round(rawOpacity)))
    : 0
  const mode: BackgroundMode = input.mode === 'custom' || input.mode === 'none' ? input.mode : 'skin'
  const imageRevision = typeof input.imageRevision === 'string' && BACKGROUND_REVISION.test(input.imageRevision)
    ? input.imageRevision
    : undefined
  return {
    version: 1,
    mode,
    backgroundOpacity,
    ...(imageRevision === undefined ? {} : { imageRevision }),
  }
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length))
}

function u16(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8)
}

function u24(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}

function u32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

/** Inspect the first WebP image chunk without decoding image pixels. */
export function inspectWebP(bytes: Uint8Array): { width: number; height: number } | undefined {
  if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return undefined
  const declaredEnd = u32(bytes, 4) + 8
  if (declaredEnd > bytes.length || declaredEnd < 20) return undefined

  let offset = 12
  while (offset + 8 <= declaredEnd) {
    const kind = ascii(bytes, offset, 4)
    const size = u32(bytes, offset + 4)
    const payload = offset + 8
    if (payload + size > declaredEnd) return undefined
    if (kind === 'VP8X' && size >= 10) {
      return { width: u24(bytes, payload + 4) + 1, height: u24(bytes, payload + 7) + 1 }
    }
    if (kind === 'VP8L' && size >= 5 && bytes[payload] === 0x2F) {
      const bits = u32(bytes, payload + 1)
      return { width: (bits & 0x3FFF) + 1, height: ((bits >>> 14) & 0x3FFF) + 1 }
    }
    if (kind === 'VP8 ' && size >= 10
      && bytes[payload + 3] === 0x9D && bytes[payload + 4] === 0x01 && bytes[payload + 5] === 0x2A) {
      return { width: u16(bytes, payload + 6) & 0x3FFF, height: u16(bytes, payload + 8) & 0x3FFF }
    }
    offset = payload + size + (size % 2)
  }
  return undefined
}
