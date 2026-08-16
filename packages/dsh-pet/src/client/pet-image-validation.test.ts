import { describe, expect, it } from 'vitest'
import { PET_ATLAS_HEIGHT, PET_ATLAS_WIDTH, PET_FRAME_COUNTS } from '../core/pet-assets.ts'
import { PetImageValidationError, validatePetImage } from './pet-image-validation.ts'

function image(fillAlpha = 0): { width: number; height: number; rgba: Uint8ClampedArray; close(): void } {
  return {
    width: PET_ATLAS_WIDTH,
    height: PET_ATLAS_HEIGHT,
    rgba: new Uint8ClampedArray(PET_ATLAS_WIDTH * PET_ATLAS_HEIGHT * 4).fill(fillAlpha),
    close() {},
  }
}

describe('custom pet pixel validation', () => {
  it('accepts a valid cell with transparent background and valid tail cells', () => {
    const decoded = image()
    for (let row = 0; row < PET_FRAME_COUNTS.length; row += 1) {
      for (let col = 0; col < PET_FRAME_COUNTS[row]!; col += 1) {
        const x = col * 192 + 1
        const y = row * 208 + 1
        const pixel = (y * PET_ATLAS_WIDTH + x) * 4
        decoded.rgba[pixel + 3] = 255
      }
    }
    expect(() => validatePetImage(decoded)).not.toThrow()
  })

  it('rejects wrong dimensions, blank valid cells, opaque cells, and nonempty tails', () => {
    expect(() => validatePetImage({ ...image(), width: 10 })).toThrowError(PetImageValidationError)
    const blank = image()
    expect(() => validatePetImage(blank)).toThrowError('image.frame-empty')
    const opaque = image(255)
    expect(() => validatePetImage(opaque)).toThrowError('image.frame-not-transparent')
    const tail = image()
    for (let row = 0; row < PET_FRAME_COUNTS.length; row += 1) {
      for (let col = 0; col < PET_FRAME_COUNTS[row]!; col += 1) {
        const pixel = ((row * 208 + 1) * PET_ATLAS_WIDTH + col * 192 + 1) * 4
        tail.rgba[pixel + 3] = 255
      }
    }
    const tailPixel = ((0 * 208 + 1) * PET_ATLAS_WIDTH + 7 * 192 + 1) * 4
    tail.rgba[tailPixel + 3] = 255
    expect(() => validatePetImage(tail)).toThrowError('image.tail-not-empty')
  })
})
