import {
  PET_ATLAS_HEIGHT,
  PET_ATLAS_COLUMNS,
  PET_ATLAS_WIDTH,
  PET_FRAME_COUNTS,
  PET_FRAME_HEIGHT,
  PET_FRAME_WIDTH,
  PET_MANIFEST_MAX_BYTES,
  PET_SPRITESHEET_MAX_BYTES,
  parsePetManifest,
  type PetAssetManifest,
} from '../core/pet-assets.ts'

export type PetImageValidationCode =
  | 'file.invalid-name'
  | 'file.too-large'
  | 'image.invalid-size'
  | 'image.frame-empty'
  | 'image.frame-not-transparent'
  | 'image.tail-not-empty'
  | 'image.decode-failed'

export class PetImageValidationError extends Error {
  readonly code: PetImageValidationCode

  constructor(code: PetImageValidationCode) {
    super(code)
    this.name = 'PetImageValidationError'
    this.code = code
  }
}

export interface DecodedPetImage {
  width: number
  height: number
  rgba: Uint8ClampedArray
  close(): void
}

export interface PetImageDecoder {
  decode(file: File): Promise<DecodedPetImage>
}

export interface PreparedPetImport {
  manifestText: string
  manifest: PetAssetManifest
  spritesheetBase64: string
  previewUrl: string
}

function fail(code: PetImageValidationCode): never {
  throw new PetImageValidationError(code)
}

/** Validate dimensions, alpha occupancy, and transparent unused cells. */
export function validatePetImage(image: DecodedPetImage): void {
  if (image.width !== PET_ATLAS_WIDTH || image.height !== PET_ATLAS_HEIGHT
    || image.rgba.length !== PET_ATLAS_WIDTH * PET_ATLAS_HEIGHT * 4) {
    fail('image.invalid-size')
  }

  const alphaAt = (x: number, y: number): number => image.rgba[(y * image.width + x) * 4 + 3] ?? 0
  for (let row = 0; row < PET_FRAME_COUNTS.length; row += 1) {
    const validFrames = PET_FRAME_COUNTS[row]!
    for (let col = 0; col < PET_ATLAS_COLUMNS; col += 1) {
      const x0 = col * PET_FRAME_WIDTH
      const y0 = row * PET_FRAME_HEIGHT
      let hasOpaque = false
      let hasTransparent = false
      for (let y = y0; y < y0 + PET_FRAME_HEIGHT && !(hasOpaque && hasTransparent); y += 1) {
        for (let x = x0; x < x0 + PET_FRAME_WIDTH && !(hasOpaque && hasTransparent); x += 1) {
          if (alphaAt(x, y) > 8) hasOpaque = true
          else hasTransparent = true
        }
      }
      if (col < validFrames && !hasOpaque) fail('image.frame-empty')
      if (col < validFrames && !hasTransparent) fail('image.frame-not-transparent')
      if (col >= validFrames && hasOpaque) fail('image.tail-not-empty')
    }
  }
}

function browserDecoder(): PetImageDecoder {
  return {
    async decode(file): Promise<DecodedPetImage> {
      try {
        const bitmap = await createImageBitmap(file)
        const canvas = typeof OffscreenCanvas === 'undefined'
          ? document.createElement('canvas')
          : new OffscreenCanvas(bitmap.width, bitmap.height)
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        const context = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
        if (context === null) throw new Error('canvas')
        context.drawImage(bitmap, 0, 0)
        const rgba = context.getImageData(0, 0, bitmap.width, bitmap.height).data
        return { width: bitmap.width, height: bitmap.height, rgba, close: () => bitmap.close() }
      } catch {
        fail('image.decode-failed')
      }
    },
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    const end = Math.min(offset + chunk, bytes.length)
    for (let index = offset; index < end; index += 1) binary += String.fromCharCode(bytes[index]!)
  }
  return btoa(binary)
}

/** Validate the two selected files and prepare the host import body. */
export async function preparePetImport(
  manifestFile: File,
  spritesheetFile: File,
  decoder: PetImageDecoder = browserDecoder(),
): Promise<PreparedPetImport> {
  if (manifestFile.name !== 'pet.json' || spritesheetFile.name !== 'spritesheet.webp') fail('file.invalid-name')
  if (manifestFile.size > PET_MANIFEST_MAX_BYTES || spritesheetFile.size > PET_SPRITESHEET_MAX_BYTES) fail('file.too-large')
  const manifestText = await manifestFile.text()
  const manifest = parsePetManifest(manifestText)
  const decoded = await decoder.decode(spritesheetFile)
  try {
    validatePetImage(decoded)
  } finally {
    decoded.close()
  }
  const bytes = new Uint8Array(await spritesheetFile.arrayBuffer())
  const previewUrl = URL.createObjectURL(spritesheetFile)
  return { manifestText, manifest, spritesheetBase64: bytesToBase64(bytes), previewUrl }
}
