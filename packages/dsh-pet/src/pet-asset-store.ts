import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  PET_MANIFEST_MAX_BYTES,
  PET_SPRITESHEET_MAX_BYTES,
  inspectWebpContainer,
  parsePetManifest,
  type PetAssetManifest,
} from './core/pet-assets.ts'
import { type PetAppearance } from './persist.ts'

export type PetAssetSlot = 'current' | 'candidate'

export interface StoredPetAsset {
  slot: PetAssetSlot
  manifest: PetAssetManifest
  manifestText: string
  revision: string
}

export interface PetAssetStoreSnapshot {
  current?: StoredPetAsset
  candidate?: StoredPetAsset
  stateToken: string
  recoveryError?: 'store.recovered' | 'store.invalid-custom'
}

export interface PreparedPetPromotion {
  current: StoredPetAsset
  commit(): Promise<void>
  rollback(): Promise<void>
}

export interface PetAssetFileOps {
  mkdir(path: string): Promise<void>
  readFile(path: string): Promise<Buffer>
  writeFile(path: string, data: string | Uint8Array): Promise<void>
  rename(from: string, to: string): Promise<void>
  rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void>
  stat(path: string): Promise<{ isDirectory(): boolean }>
}

const nodeFileOps: PetAssetFileOps = {
  mkdir: async (path) => { await mkdir(path, { recursive: true }) },
  readFile: async (path) => readFile(path),
  writeFile: async (path, data) => { await writeFile(path, data) },
  rename: async (from, to) => { await rename(from, to) },
  rm: async (path, options) => { await rm(path, options) },
  stat: async (path) => stat(path),
}

export class PetAssetStoreError extends Error {
  readonly code: 'store.invalid-custom' | 'store.write-failed' | 'store.unavailable'

  constructor(code: PetAssetStoreError['code'], cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause })
    this.name = 'PetAssetStoreError'
    this.code = code
  }
}

interface StoreMarker {
  operation: 'candidate-replace' | 'promote'
  previousAppearance?: PetAppearance
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function asBuffer(data: Uint8Array): Buffer {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
}

function revisionOf(manifestText: string, spritesheet: Uint8Array): string {
  return createHash('sha256')
    .update(manifestText, 'utf8')
    .update(Buffer.from([0]))
    .update(asBuffer(spritesheet))
    .digest('hex')
}

export class PetAssetStore {
  private readonly root: string
  private readonly ops: PetAssetFileOps
  private recoveryError: PetAssetStoreSnapshot['recoveryError']

  constructor(dshHome: string, ops: PetAssetFileOps = nodeFileOps) {
    this.root = join(dshHome, 'pet', 'custom')
    this.ops = ops
  }

  private slotDir(slot: PetAssetSlot): string {
    return join(this.root, slot)
  }

  private manifestPath(slot: PetAssetSlot): string {
    return join(this.slotDir(slot), 'pet.json')
  }

  private spritesheetPath(slot: PetAssetSlot): string {
    return join(this.slotDir(slot), 'spritesheet.webp')
  }

  private get incomingDir(): string {
    return join(this.root, '.incoming')
  }

  private get backupDir(): string {
    return join(this.root, '.backup')
  }

  private get markerPath(): string {
    return join(this.root, '.transaction.json')
  }

  private async ensureRoot(): Promise<void> {
    await this.ops.mkdir(this.root)
  }

  private async exists(path: string): Promise<boolean> {
    try {
      await this.ops.stat(path)
      return true
    } catch (error) {
      if (isMissing(error)) return false
      throw error
    }
  }

  private async remove(path: string): Promise<void> {
    await this.ops.rm(path, { recursive: true, force: true })
  }

  private async readPair(slot: PetAssetSlot): Promise<StoredPetAsset | undefined> {
    const manifestPath = this.manifestPath(slot)
    const imagePath = this.spritesheetPath(slot)
    let manifestBytes: Buffer
    try {
      manifestBytes = await this.ops.readFile(manifestPath)
    } catch (error) {
      if (!isMissing(error)) throw error
      if (await this.exists(imagePath)) throw new PetAssetStoreError('store.invalid-custom')
      return undefined
    }

    let imageBytes: Buffer
    try {
      imageBytes = await this.ops.readFile(imagePath)
    } catch (error) {
      if (isMissing(error)) throw new PetAssetStoreError('store.invalid-custom')
      throw error
    }
    if (manifestBytes.byteLength > PET_MANIFEST_MAX_BYTES || imageBytes.byteLength > PET_SPRITESHEET_MAX_BYTES) {
      throw new PetAssetStoreError('store.invalid-custom')
    }

    const manifestText = manifestBytes.toString('utf8')
    let manifest: PetAssetManifest
    try {
      manifest = parsePetManifest(manifestText)
      inspectWebpContainer(imageBytes)
    } catch (error) {
      throw new PetAssetStoreError('store.invalid-custom', error)
    }
    return {
      slot,
      manifest,
      manifestText,
      revision: revisionOf(manifestText, imageBytes),
    }
  }

  private async readPairSafe(slot: PetAssetSlot): Promise<StoredPetAsset | undefined> {
    try {
      return await this.readPair(slot)
    } catch (error) {
      if (error instanceof PetAssetStoreError && error.code === 'store.invalid-custom') {
        this.recoveryError = 'store.invalid-custom'
        return undefined
      }
      throw error
    }
  }

  async snapshot(): Promise<PetAssetStoreSnapshot> {
    await this.ensureRoot()
    const current = await this.readPairSafe('current')
    const candidate = await this.readPairSafe('candidate')
    const stateToken = createHash('sha256')
      .update(current?.revision ?? 'none')
      .update(candidate?.revision ?? 'none')
      .update(this.recoveryError ?? 'ok')
      .digest('hex')
    return {
      ...(current === undefined ? {} : { current }),
      ...(candidate === undefined ? {} : { candidate }),
      stateToken,
      ...(this.recoveryError === undefined ? {} : { recoveryError: this.recoveryError }),
    }
  }

  async importCandidate(manifestText: string, spritesheet: Uint8Array): Promise<StoredPetAsset> {
    await this.ensureRoot()
    const manifest = parsePetManifest(manifestText)
    if (new TextEncoder().encode(manifestText).byteLength > PET_MANIFEST_MAX_BYTES
      || spritesheet.byteLength > PET_SPRITESHEET_MAX_BYTES) {
      throw new PetAssetStoreError('store.invalid-custom')
    }
    inspectWebpContainer(spritesheet)

    await this.remove(this.incomingDir)
    await this.ops.mkdir(this.incomingDir)
    const incomingManifest = join(this.incomingDir, 'pet.json')
    const incomingSpritesheet = join(this.incomingDir, 'spritesheet.webp')
    try {
      await this.ops.writeFile(incomingManifest, manifestText)
      await this.ops.writeFile(incomingSpritesheet, spritesheet)
      const previousCandidate = await this.exists(this.slotDir('candidate'))
      await this.remove(this.backupDir)
      await this.ops.writeFile(this.markerPath, JSON.stringify({ operation: 'candidate-replace' } satisfies StoreMarker))
      if (previousCandidate) await this.ops.rename(this.slotDir('candidate'), this.backupDir)
      await this.ops.rename(this.incomingDir, this.slotDir('candidate'))
      await this.remove(this.backupDir)
      await this.remove(this.markerPath)
      this.recoveryError = undefined
      return {
        slot: 'candidate',
        manifest,
        manifestText,
        revision: revisionOf(manifestText, spritesheet),
      }
    } catch (error) {
      try {
        await this.remove(this.slotDir('candidate'))
        if (await this.exists(this.backupDir)) await this.ops.rename(this.backupDir, this.slotDir('candidate'))
        await this.remove(this.incomingDir)
        await this.remove(this.markerPath)
      } catch {
        // Recovery on the next start handles a leftover transaction marker.
      }
      if (error instanceof PetAssetStoreError) throw error
      throw new PetAssetStoreError('store.write-failed', error)
    }
  }

  async preparePromotion(previousAppearance: PetAppearance = 'official'): Promise<PreparedPetPromotion> {
    await this.ensureRoot()
    const candidate = await this.readPair('candidate')
    const current = await this.readPair('current')
    if (candidate === undefined && current === undefined) throw new PetAssetStoreError('store.unavailable')
    if (candidate === undefined) {
      return { current: current!, commit: async () => {}, rollback: async () => {} }
    }

    await this.remove(this.backupDir)
    await this.ops.writeFile(this.markerPath, JSON.stringify({ operation: 'promote', previousAppearance } satisfies StoreMarker))
    try {
      if (current !== undefined) await this.ops.rename(this.slotDir('current'), this.backupDir)
      await this.ops.rename(this.slotDir('candidate'), this.slotDir('current'))
      const promoted = await this.readPair('current')
      if (promoted === undefined) throw new PetAssetStoreError('store.invalid-custom')
      let settled = false
      const commit = async (): Promise<void> => {
        if (settled) return
        settled = true
        await this.remove(this.backupDir)
        await this.remove(this.markerPath)
      }
      const rollback = async (): Promise<void> => {
        if (settled) return
        settled = true
        await this.remove(this.slotDir('candidate'))
        if (await this.exists(this.slotDir('current'))) await this.ops.rename(this.slotDir('current'), this.slotDir('candidate'))
        if (await this.exists(this.backupDir)) await this.ops.rename(this.backupDir, this.slotDir('current'))
        await this.remove(this.markerPath)
      }
      return { current: promoted, commit, rollback }
    } catch (error) {
      try {
        await this.remove(this.slotDir('current'))
        if (await this.exists(this.backupDir)) await this.ops.rename(this.backupDir, this.slotDir('current'))
        await this.remove(this.markerPath)
      } catch {
        // Recovery on the next start handles the marker and backup.
      }
      if (error instanceof PetAssetStoreError) throw error
      throw new PetAssetStoreError('store.write-failed', error)
    }
  }

  async deleteAll(): Promise<void> {
    await this.ensureRoot()
    await this.remove(this.slotDir('current'))
    await this.remove(this.slotDir('candidate'))
    await this.remove(this.incomingDir)
    await this.remove(this.backupDir)
    await this.remove(this.markerPath)
    this.recoveryError = undefined
  }

  async readFile(slot: PetAssetSlot, name: 'pet.json' | 'spritesheet.webp'): Promise<Buffer> {
    const path = join(this.slotDir(slot), name)
    const expected = name === 'pet.json' ? this.manifestPath(slot) : this.spritesheetPath(slot)
    if (path !== expected) throw new PetAssetStoreError('store.unavailable')
    try {
      return await this.ops.readFile(path)
    } catch (error) {
      if (isMissing(error)) throw new PetAssetStoreError('store.unavailable')
      throw error
    }
  }

  async recover(appearance: PetAppearance = 'official'): Promise<void> {
    await this.ensureRoot()
    let marker: StoreMarker | undefined
    try {
      marker = JSON.parse((await this.ops.readFile(this.markerPath)).toString('utf8')) as StoreMarker
    } catch (error) {
      if (!isMissing(error)) await this.remove(this.markerPath)
    }

    if (marker?.operation === 'promote') {
      const current = await this.readPairSafe('current')
      const backup = await this.readBackupPair()
      if (appearance === 'custom' && current !== undefined) {
        await this.remove(this.backupDir)
      } else {
        if (backup !== undefined) {
          await this.remove(this.slotDir('current'))
          await this.ops.rename(this.backupDir, this.slotDir('current'))
        } else if (current !== undefined) {
          await this.ops.rename(this.slotDir('current'), this.slotDir('candidate'))
        }
      }
      await this.remove(this.markerPath)
      this.recoveryError = 'store.recovered'
    } else if (marker?.operation === 'candidate-replace') {
      const candidate = await this.readPairSafe('candidate')
      if (candidate === undefined && await this.exists(this.backupDir)) {
        await this.remove(this.slotDir('candidate'))
        await this.ops.rename(this.backupDir, this.slotDir('candidate'))
      } else {
        await this.remove(this.backupDir)
      }
      await this.remove(this.markerPath)
      this.recoveryError = 'store.recovered'
    }

    await this.remove(this.incomingDir)
  }

  private async readBackupPair(): Promise<StoredPetAsset | undefined> {
    const manifestPath = join(this.backupDir, 'pet.json')
    const imagePath = join(this.backupDir, 'spritesheet.webp')
    if (!(await this.exists(manifestPath))) return undefined
    if (!(await this.exists(imagePath))) return undefined
    try {
      const manifestText = (await this.ops.readFile(manifestPath)).toString('utf8')
      const imageBytes = await this.ops.readFile(imagePath)
      const manifest = parsePetManifest(manifestText)
      inspectWebpContainer(imageBytes)
      return { slot: 'current', manifest, manifestText, revision: revisionOf(manifestText, imageBytes) }
    } catch {
      return undefined
    }
  }
}
