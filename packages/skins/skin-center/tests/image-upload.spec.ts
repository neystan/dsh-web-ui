/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { prepareBackground, uploadBackground, type DecodedImage, type ImageCodec } from '../src/client/image-upload.ts'

const pngHeader = Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

function file(bytes: BlobPart[], type = 'image/png'): File {
  return new File(bytes, 'background.png', { type })
}

function codec(width: number, height: number, sizes: number[]) {
  const close = vi.fn()
  const decoded: DecodedImage = { source: {} as CanvasImageSource, width, height, close }
  const encode = vi.fn(async (_image: DecodedImage, _edge: number, _quality: number) => {
    const size = sizes.shift() ?? 1
    return new Blob([new Uint8Array(size)], { type: 'image/webp' })
  })
  return { value: { decode: vi.fn(async () => decoded), encode } satisfies ImageCodec, close, encode }
}

afterEach(() => vi.restoreAllMocks())

describe('prepareBackground', () => {
  it('tries the approved WebP qualities and stops below 6 MiB', async () => {
    const fake = codec(4000, 2000, [6 * 1024 * 1024 + 1, 1024])
    const createUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
    const prepared = await prepareBackground(file([pngHeader]), fake.value)
    expect(fake.encode.mock.calls.map(call => [call[1], call[2]])).toEqual([[2560, 0.88], [2560, 0.80]])
    expect(prepared).toMatchObject({ width: 4000, height: 2000, previewUrl: 'blob:preview' })
    expect(prepared.blob.type).toBe('image/webp')
    expect(createUrl).toHaveBeenCalledWith(prepared.blob)
    expect(fake.close).toHaveBeenCalledOnce()
  })

  it('rejects type/magic mismatches and unsupported formats before decode', async () => {
    const fake = codec(100, 100, [100])
    await expect(prepareBackground(file([pngHeader], 'image/jpeg'), fake.value)).rejects.toThrow('invalid-image-type')
    await expect(prepareBackground(file(['<svg/>'], 'image/svg+xml'), fake.value)).rejects.toThrow('invalid-image-type')
    expect(fake.value.decode).not.toHaveBeenCalled()
  })

  it('rejects original byte and decoded dimension limits', async () => {
    const hugeFile = file([new Uint8Array(10 * 1024 * 1024 + 1)])
    await expect(prepareBackground(hugeFile, codec(100, 100, [1]).value)).rejects.toThrow('source-image-too-large')

    const tooWide = codec(16385, 100, [1])
    await expect(prepareBackground(file([pngHeader]), tooWide.value)).rejects.toThrow('source-image-dimensions')
    expect(tooWide.close).toHaveBeenCalledOnce()

    const tooManyPixels = codec(8000, 6000, [1])
    await expect(prepareBackground(file([pngHeader]), tooManyPixels.value)).rejects.toThrow('source-image-dimensions')
    expect(tooManyPixels.close).toHaveBeenCalledOnce()
  })

  it('rejects output that remains over 6 MiB', async () => {
    const fake = codec(1000, 1000, [7_000_000, 7_000_000, 7_000_000])
    await expect(prepareBackground(file([pngHeader]), fake.value)).rejects.toThrow('encoded-image-too-large')
    expect(fake.encode.mock.calls.map(call => call[2])).toEqual([0.88, 0.80, 0.72])
    expect(fake.close).toHaveBeenCalledOnce()
  })
})

describe('uploadBackground', () => {
  it('posts raw WebP and accepts only a strict revision', async () => {
    const revision = 'a'.repeat(64)
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ ok: true, revision }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch
    const blob = new Blob(['webp'], { type: 'image/webp' })
    await expect(uploadBackground(blob, fetcher)).resolves.toBe(revision)
    expect(fetcher).toHaveBeenCalledWith('/api/skin-center/background', {
      method: 'POST',
      headers: { 'content-type': 'image/webp' },
      body: blob,
    })
  })

  it('maps response failures to stable errors', async () => {
    const badRevision = vi.fn(async () => new Response(JSON.stringify({ ok: true, revision: 'BAD' }), { status: 200 })) as unknown as typeof fetch
    await expect(uploadBackground(new Blob(), badRevision)).rejects.toThrow('upload-invalid-response')
    const refused = vi.fn(async () => new Response('{}', { status: 413 })) as unknown as typeof fetch
    await expect(uploadBackground(new Blob(), refused)).rejects.toThrow('upload-failed')
  })
})
