import { createHash } from 'node:crypto'
import { mkdtemp, readFile, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BackgroundAssetStore } from '../src/background-store.ts'
import { inspectWebP, normalizeBackgroundSettings } from '../src/core/background.ts'
import { SkinBackgroundConfigSchema } from '../src/index.ts'

function vp8x(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(30)
  bytes.write('RIFF', 0, 'ascii')
  bytes.writeUInt32LE(22, 4)
  bytes.write('WEBP', 8, 'ascii')
  bytes.write('VP8X', 12, 'ascii')
  bytes.writeUInt32LE(10, 16)
  bytes.writeUIntLE(width - 1, 24, 3)
  bytes.writeUIntLE(height - 1, 27, 3)
  return bytes
}

function vp8(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(30)
  bytes.write('RIFF', 0, 'ascii')
  bytes.writeUInt32LE(22, 4)
  bytes.write('WEBPVP8 ', 8, 'ascii')
  bytes.writeUInt32LE(10, 16)
  bytes.set([0, 0, 0, 0x9D, 0x01, 0x2A], 20)
  bytes.writeUInt16LE(width, 26)
  bytes.writeUInt16LE(height, 28)
  return bytes
}

function vp8l(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(26)
  bytes.write('RIFF', 0, 'ascii')
  bytes.writeUInt32LE(18, 4)
  bytes.write('WEBPVP8L', 8, 'ascii')
  bytes.writeUInt32LE(5, 16)
  bytes[20] = 0x2F
  bytes.writeUInt32LE((width - 1) | ((height - 1) << 14), 21)
  return bytes
}

async function* chunks(...values: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const value of values) yield value
}

describe('background settings and WebP inspection', () => {
  it('declares the versioned background settings schema', () => {
    expect(SkinBackgroundConfigSchema({})).toEqual({ version: 1, mode: 'skin', backgroundOpacity: 0 })
    expect(SkinBackgroundConfigSchema({ mode: 'custom', imageRevision: 'a'.repeat(64) })).toEqual({
      version: 1,
      mode: 'custom',
      backgroundOpacity: 0,
      imageRevision: 'a'.repeat(64),
    })
  })

  it('migrates the old opacity-only settings without losing the value', () => {
    expect(normalizeBackgroundSettings({ backgroundOpacity: 35 })).toEqual({
      version: 1,
      mode: 'skin',
      backgroundOpacity: 35,
    })
    expect(normalizeBackgroundSettings({ version: 1, mode: 'custom', backgroundOpacity: 40, imageRevision: 'a'.repeat(64) })).toEqual({
      version: 1,
      mode: 'custom',
      backgroundOpacity: 40,
      imageRevision: 'a'.repeat(64),
    })
  })

  it('reads VP8, VP8L, and VP8X dimensions and rejects malformed data', () => {
    expect(inspectWebP(vp8(640, 480))).toEqual({ width: 640, height: 480 })
    expect(inspectWebP(vp8l(1024, 768))).toEqual({ width: 1024, height: 768 })
    expect(inspectWebP(vp8x(2560, 1440))).toEqual({ width: 2560, height: 1440 })
    expect(inspectWebP(Buffer.from('not-webp'))).toBeUndefined()
  })
})

describe('BackgroundAssetStore', () => {
  it('stores accepted bytes by SHA-256 and reuses duplicate content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skin-center-store-'))
    const store = new BackgroundAssetStore(root)
    const image = vp8x(1280, 720)
    const expected = createHash('sha256').update(image).digest('hex')

    const first = await store.save(chunks(image.subarray(0, 10), image.subarray(10)))
    const second = await store.save(chunks(image))
    expect(first).toEqual({ revision: expected })
    expect(second).toEqual(first)
    const asset = await store.read(expected)
    expect(asset?.size).toBe(image.length)
    expect(await readFile(asset!.path)).toEqual(image)
    expect(await store.delete(expected)).toBe(true)
    expect(await store.read(expected)).toBeUndefined()
  })

  it('rejects oversized, malformed, and over-dimension images', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skin-center-store-'))
    const store = new BackgroundAssetStore(root)
    await expect(store.save(chunks(Buffer.alloc(6 * 1024 * 1024 + 1)))).rejects.toThrow('image-too-large')
    await expect(store.save(chunks(Buffer.from('bad')))).rejects.toThrow('invalid-webp')
    await expect(store.save(chunks(vp8x(2561, 100)))).rejects.toThrow('invalid-image-dimensions')
    await expect(store.save(chunks(vp8x(2560, 2560)))).resolves.toBeDefined()
  })

  it('accepts only strict revisions and cleans stale temp files only', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skin-center-store-'))
    const store = new BackgroundAssetStore(root)
    expect(await store.read('../escape')).toBeUndefined()
    expect(await store.delete('A'.repeat(64))).toBe(false)

    const stale = join(root, '.tmp-stale')
    const fresh = join(root, '.tmp-fresh')
    const asset = join(root, `${'b'.repeat(64)}.webp`)
    await writeFile(stale, 'stale')
    await writeFile(fresh, 'fresh')
    await writeFile(asset, 'asset')
    const now = Date.now()
    await utimes(stale, new Date(now - 25 * 60 * 60 * 1000), new Date(now - 25 * 60 * 60 * 1000))
    await store.cleanupTempFiles(now)
    await expect(stat(stale)).rejects.toThrow()
    await expect(stat(fresh)).resolves.toBeDefined()
    await expect(stat(asset)).resolves.toBeDefined()
  })
})
