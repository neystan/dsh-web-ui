import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PetAssetStore } from './pet-asset-store.ts'

const manifestText = readFileSync(join(process.cwd(), 'assets', 'whale', 'pet.json'), 'utf8')
const spritesheet = readFileSync(join(process.cwd(), 'assets', 'whale', 'spritesheet.webp'))

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), 'dsh-pet-store-'))
}

describe('PetAssetStore', () => {
  it('imports a candidate and replaces it without creating history', async () => {
    const root = tempDir()
    try {
      const store = new PetAssetStore(root)
      const first = await store.importCandidate(manifestText, spritesheet)
      const second = await store.importCandidate(manifestText, spritesheet)
      expect(first.slot).toBe('candidate')
      expect(second.revision).toBe(first.revision)
      const snapshot = await store.snapshot()
      expect(snapshot.current).toBeUndefined()
      expect(snapshot.candidate?.manifest.id).toBe('whale-girl')
      expect(snapshot.stateToken).toBeTruthy()
      expect(snapshot.recoveryError).toBeUndefined()
      expect(existsSync(join(root, 'pet', 'custom', 'history'))).toBe(false)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('promotes a candidate and can roll the promotion back', async () => {
    const root = tempDir()
    try {
      const store = new PetAssetStore(root)
      await store.importCandidate(manifestText, spritesheet)
      const promotion = await store.preparePromotion()
      expect(promotion.current.slot).toBe('current')
      await promotion.rollback()
      expect((await store.snapshot()).current).toBeUndefined()
      expect((await store.snapshot()).candidate?.manifest.id).toBe('whale-girl')

      const secondPromotion = await store.preparePromotion()
      await secondPromotion.commit()
      expect((await store.snapshot()).current?.manifest.id).toBe('whale-girl')
      expect((await store.snapshot()).candidate).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('recovers a complete backup according to the persisted appearance', async () => {
    const root = tempDir()
    const custom = join(root, 'pet', 'custom')
    try {
      mkdirSync(join(custom, 'current'), { recursive: true })
      mkdirSync(join(custom, '.backup'), { recursive: true })
      writeFileSync(join(custom, '.transaction.json'), JSON.stringify({ operation: 'promote' }), 'utf8')
      writeFileSync(join(custom, 'current', 'pet.json'), manifestText, 'utf8')
      writeFileSync(join(custom, 'current', 'spritesheet.webp'), spritesheet)
      writeFileSync(join(custom, '.backup', 'pet.json'), manifestText, 'utf8')
      writeFileSync(join(custom, '.backup', 'spritesheet.webp'), spritesheet)
      const store = new PetAssetStore(root)
      await store.recover('custom')
      const snapshot = await store.snapshot()
      expect(snapshot.current?.manifest.id).toBe('whale-girl')
      expect(snapshot.recoveryError).toBe('store.recovered')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('drops incomplete custom pairs and deletes both slots', async () => {
    const root = tempDir()
    try {
      const custom = join(root, 'pet', 'custom', 'candidate')
      mkdirSync(custom, { recursive: true })
      writeFileSync(join(custom, 'pet.json'), manifestText, 'utf8')
      const store = new PetAssetStore(root)
      const snapshot = await store.snapshot()
      expect(snapshot.candidate).toBeUndefined()
      expect(snapshot.recoveryError).toBe('store.invalid-custom')
      await store.deleteAll()
      expect((await store.snapshot()).current).toBeUndefined()
      expect((await store.snapshot()).candidate).toBeUndefined()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
