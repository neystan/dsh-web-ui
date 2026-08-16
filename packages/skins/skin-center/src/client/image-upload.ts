/** Browser-side background validation, normalization, preview, and upload. */

const MAX_SOURCE_BYTES = 10 * 1024 * 1024
const MAX_SOURCE_EDGE = 16_384
const MAX_SOURCE_PIXELS = 40_000_000
const MAX_OUTPUT_BYTES = 6 * 1024 * 1024
const OUTPUT_EDGE = 2560
const QUALITIES = [0.88, 0.80, 0.72] as const
const REVISION = /^[a-f0-9]{64}$/

export interface PreparedBackground {
  blob: Blob
  width: number
  height: number
  previewUrl: string
}

export interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  close(): void
}

export interface ImageCodec {
  decode(file: File): Promise<DecodedImage>
  encode(decoded: DecodedImage, maxEdge: number, quality: number): Promise<Blob>
}

function detectedType(bytes: Uint8Array): 'image/jpeg' | 'image/png' | 'image/webp' | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg'
  if (bytes.length >= 8 && [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A].every((value, index) => bytes[index] === value)) {
    return 'image/png'
  }
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp'
  return undefined
}

const browserCodec: ImageCodec = {
  async decode(file): Promise<DecodedImage> {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  },
  async encode(decoded, maxEdge, quality): Promise<Blob> {
    const scale = Math.min(1, maxEdge / Math.max(decoded.width, decoded.height))
    const width = Math.max(1, Math.round(decoded.width * scale))
    const height = Math.max(1, Math.round(decoded.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (context === null) throw new Error('image-encode-failed')
    context.drawImage(decoded.source, 0, 0, width, height)
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => {
        if (blob === null || blob.type !== 'image/webp') reject(new Error('image-encode-failed'))
        else resolve(blob)
      }, 'image/webp', quality)
    })
  },
}

/** Validate, decode, downscale and strip metadata into a bounded WebP blob. */
export async function prepareBackground(file: File, codec: ImageCodec = browserCodec): Promise<PreparedBackground> {
  if (file.size < 1 || file.size > MAX_SOURCE_BYTES) throw new Error('source-image-too-large')
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  if (detectedType(header) !== file.type) throw new Error('invalid-image-type')

  const decoded = await codec.decode(file)
  try {
    if (decoded.width < 1 || decoded.height < 1
      || decoded.width > MAX_SOURCE_EDGE || decoded.height > MAX_SOURCE_EDGE
      || decoded.width * decoded.height > MAX_SOURCE_PIXELS) {
      throw new Error('source-image-dimensions')
    }
    for (const quality of QUALITIES) {
      const blob = await codec.encode(decoded, OUTPUT_EDGE, quality)
      if (blob.type === 'image/webp' && blob.size <= MAX_OUTPUT_BYTES) {
        return {
          blob,
          width: decoded.width,
          height: decoded.height,
          previewUrl: URL.createObjectURL(blob),
        }
      }
    }
    throw new Error('encoded-image-too-large')
  } finally {
    decoded.close()
  }
}

/** Upload raw normalized WebP bytes and return the strict content revision. */
export async function uploadBackground(blob: Blob, fetcher: typeof fetch = fetch): Promise<string> {
  let response: Response
  try {
    response = await fetcher('/api/skin-center/background', {
      method: 'POST',
      headers: { 'content-type': 'image/webp' },
      body: blob,
    })
  } catch {
    throw new Error('upload-failed')
  }
  if (!response.ok) throw new Error('upload-failed')
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    throw new Error('upload-invalid-response')
  }
  const revision = typeof payload === 'object' && payload !== null ? (payload as { revision?: unknown }).revision : undefined
  if (typeof revision !== 'string' || !REVISION.test(revision)) throw new Error('upload-invalid-response')
  return revision
}
