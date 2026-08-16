/** Safe, content-addressed storage for normalized custom background WebP files. */

import { createHash, randomBytes } from 'node:crypto'
import { mkdir, readdir, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative } from 'node:path'
import { BACKGROUND_REVISION, inspectWebP } from './core/background.ts'

const MAX_BYTES = 6 * 1024 * 1024
const MAX_EDGE = 2560
const MAX_PIXELS = 6_553_600
const TEMP_MAX_AGE_MS = 24 * 60 * 60 * 1000

function code(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined
}

export class BackgroundAssetStore {
  constructor(private readonly root: string) {}

  async cleanupTempFiles(now = Date.now()): Promise<void> {
    await mkdir(this.root, { recursive: true })
    const entries = await readdir(this.root, { withFileTypes: true })
    await Promise.all(entries.map(async entry => {
      if (!entry.isFile() || !entry.name.startsWith('.tmp-')) return
      const path = join(this.root, entry.name)
      try {
        const info = await stat(path)
        if (now - info.mtimeMs > TEMP_MAX_AGE_MS) await unlink(path)
      } catch { /* another cleanup or writer won the race */ }
    }))
  }

  async save(source: AsyncIterable<Uint8Array>): Promise<{ revision: string }> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of source) {
      size += chunk.byteLength
      if (size > MAX_BYTES) throw new Error('image-too-large')
      chunks.push(Buffer.from(chunk))
    }
    const bytes = Buffer.concat(chunks, size)
    const dimensions = inspectWebP(bytes)
    if (dimensions === undefined) throw new Error('invalid-webp')
    if (dimensions.width < 1 || dimensions.height < 1
      || dimensions.width > MAX_EDGE || dimensions.height > MAX_EDGE
      || dimensions.width * dimensions.height > MAX_PIXELS) {
      throw new Error('invalid-image-dimensions')
    }

    await mkdir(this.root, { recursive: true })
    const revision = createHash('sha256').update(bytes).digest('hex')
    const target = join(this.root, `${revision}.webp`)
    try {
      await stat(target)
      return { revision }
    } catch { /* absent: continue with same-directory atomic write */ }

    const temporary = join(this.root, `.tmp-${process.pid}-${randomBytes(8).toString('hex')}`)
    try {
      await writeFile(temporary, bytes, { flag: 'wx' })
      try {
        await rename(temporary, target)
      } catch (error) {
        if (code(error) !== 'EEXIST') throw error
        await unlink(temporary).catch(() => {})
      }
    } catch (error) {
      await unlink(temporary).catch(() => {})
      throw error
    }
    return { revision }
  }

  async read(revision: string): Promise<{ path: string; size: number } | undefined> {
    if (!BACKGROUND_REVISION.test(revision)) return undefined
    await mkdir(this.root, { recursive: true })
    const candidate = join(this.root, `${revision}.webp`)
    try {
      const [root, path] = await Promise.all([realpath(this.root), realpath(candidate)])
      const child = relative(root, path)
      if (child === '' || child.startsWith('..') || isAbsolute(child)) return undefined
      const info = await stat(path)
      return info.isFile() ? { path, size: info.size } : undefined
    } catch {
      return undefined
    }
  }

  async delete(revision: string): Promise<boolean> {
    const asset = await this.read(revision)
    if (asset === undefined) return false
    try {
      await unlink(asset.path)
      return true
    } catch (error) {
      if (code(error) === 'ENOENT') return false
      throw error
    }
  }
}
