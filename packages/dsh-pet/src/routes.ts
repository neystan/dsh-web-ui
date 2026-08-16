/**
 * Pet HTTP routes — the browser half talks to the host through plain
 * same-origin JSON endpoints (`/api/pet/*`) and loads the whale-girl atlas
 * from `/pet/whale/*`. The `/plugins/` endpoint only serves client bundles
 * and RPC domains are platform-registered, so the pet serves its own API
 * and media — the same pattern as the family RPC domains.
 * @module @neystan/dsh-pet/routes
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type { PetService } from './service.ts'
import type { PetInteraction } from './affinity.ts'
import { PET_IMPORT_BODY_MAX_BYTES } from './core/pet-assets.ts'
import type { PetAssetSlot } from './pet-asset-store.ts'

/** Browser-facing base path of the pet API. */
export const PET_API_PREFIX = '/api/pet'

/** Browser-facing base path of the pet asset routes. */
export const PET_ASSET_PREFIX = '/pet/whale'
export const PET_CUSTOM_ASSET_PREFIX = '/pet/custom'

/** Relative (to package root) asset files exposed under the prefix. */
const ASSET_FILES = [
  { name: 'spritesheet.webp', mime: 'image/webp' },
  { name: 'pet.json', mime: 'application/json' },
] as const

/** Absolute package root, resolved from this module's own location (lib/). */
export function petPackageRoot(importMetaUrl: string): string {
  return fileURLToPath(new URL('../', importMetaUrl))
}

/** Write one JSON response. */
function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Require the method or answer 405. */
function requireMethod(req: IncomingMessage, res: ServerResponse, method: string): boolean {
  if (req.method === method) return true
  json(res, 405, { ok: false, error: 'method-not-allowed' })
  return false
}

/** Read a JSON request body (bounded). */
function readJsonBody(req: IncomingMessage, limit = 64 * 1024): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > limit) {
        // Reject first so the error handler can write the 400 response,
        // then close the connection once the response is flushed.
        reject(new Error('body-too-large'))
        queueMicrotask(() => req.destroy())
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid-json'))
      }
    })
    req.on('error', reject)
  })
}

/** Wrap one async service call as a GET JSON route. */
function getRoute(path: string, run: () => Promise<unknown>): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: (req: IncomingMessage, res: ServerResponse): void => {
      if (!requireMethod(req, res, 'GET')) return
      run().then((value) => json(res, 200, value), (error) => writeError(res, error))
    },
  }
}

/** Wrap one async service call as a POST JSON route (body passed through). */
function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  return error instanceof Error ? error.message : 'internal-error'
}

function errorStatus(error: unknown): number {
  if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
    return error.status
  }
  const code = errorCode(error)
  if (code === 'asset.state-conflict') return 409
  if (code === 'asset.unavailable') return 404
  if (code.startsWith('store.')) return 500
  return 400
}

function writeError(res: ServerResponse, error: unknown): void {
  json(res, errorStatus(error), { ok: false, error: errorCode(error) })
}

function postRoute(path: string, run: (body: Record<string, unknown>) => Promise<unknown>, limit = 64 * 1024): WebRoute {
  return {
    kind: 'exact',
    path,
    handler: (req: IncomingMessage, res: ServerResponse): Promise<void> => {
      if (!requireMethod(req, res, 'POST')) return Promise.resolve()
      return readJsonBody(req, limit).then((body) => {
        const record = (typeof body === 'object' && body !== null) ? body as Record<string, unknown> : {}
        return run(record).then(
          (value) => json(res, 200, value),
          (error) => { writeError(res, error) },
        )
      }, (error) => { writeError(res, error) })
    },
  }
}

/** Build the full route family (API + assets) for one service + package root. */
export function makePetRoutes(deps: { service: PetService; packageRoot: string }): WebRoute[] {
  const { service, packageRoot } = deps
  const apiRoutes: WebRoute[] = [
    getRoute(`${PET_API_PREFIX}/state`, () => service.state()),
    postRoute(`${PET_API_PREFIX}/interact`, (body) => {
      const kind = body.kind as PetInteraction | undefined
      if (kind !== 'pet' && kind !== 'feed') return Promise.reject(new Error('invalid-kind'))
      return service.interact(kind)
    }),
    postRoute(`${PET_API_PREFIX}/set-visible`, (body) => {
      const visible = body.visible
      if (typeof visible !== 'boolean') return Promise.reject(new Error('invalid-visible'))
      return service.setVisible(visible)
    }),
    postRoute(`${PET_API_PREFIX}/set-config`, (body) => service.setConfig({
      ...(typeof body.size === 'number' ? { size: body.size } : {}),
      ...(typeof body.right === 'number' ? { right: body.right } : {}),
      ...(typeof body.bottom === 'number' ? { bottom: body.bottom } : {}),
      ...(typeof body.visible === 'boolean' ? { visible: body.visible } : {}),
    })),
    postRoute(`${PET_API_PREFIX}/set-name`, (body) => {
      const name = body.name
      if (typeof name !== 'string') return Promise.reject(new Error('invalid-name'))
      return service.setName(name)
    }),
    getRoute(`${PET_API_PREFIX}/appearance`, () => service.appearanceState()),
    postRoute(`${PET_API_PREFIX}/appearance/import`, (body) => {
      if (body.manifestFileName !== 'pet.json'
        || typeof body.manifestText !== 'string'
        || body.spritesheetFileName !== 'spritesheet.webp'
        || typeof body.spritesheetBase64 !== 'string'
        || typeof body.expectedState !== 'string') {
        return Promise.reject(new Error('asset.invalid-payload'))
      }
      return service.importCandidate({
        manifestFileName: 'pet.json',
        manifestText: body.manifestText,
        spritesheetFileName: 'spritesheet.webp',
        spritesheetBase64: body.spritesheetBase64,
        expectedState: body.expectedState,
      })
    }, PET_IMPORT_BODY_MAX_BYTES),
    postRoute(`${PET_API_PREFIX}/appearance/use-official`, (body) => {
      if (typeof body.expectedState !== 'string') return Promise.reject(new Error('asset.invalid-state'))
      return service.useOfficial(body.expectedState)
    }),
    postRoute(`${PET_API_PREFIX}/appearance/use-custom`, (body) => {
      if (typeof body.expectedState !== 'string') return Promise.reject(new Error('asset.invalid-state'))
      return service.useCustom(body.expectedState)
    }),
    postRoute(`${PET_API_PREFIX}/appearance/delete`, (body) => {
      if (typeof body.expectedState !== 'string') return Promise.reject(new Error('asset.invalid-state'))
      return service.deleteCustom(body.expectedState)
    }),
  ]

  const assetRoutes: WebRoute[] = ASSET_FILES.map((file): WebRoute => ({
    kind: 'exact',
    path: `${PET_ASSET_PREFIX}/${file.name}`,
    handler: (req: IncomingMessage, res: ServerResponse): Promise<void> | void => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405)
        res.end()
        return
      }
      return readFile(join(packageRoot, 'assets', 'whale', file.name)).then((body) => {
        res.writeHead(200, {
          'content-type': file.mime,
          'content-length': String(body.byteLength),
          'cache-control': 'no-cache',
        })
        if (req.method === 'HEAD') {
          res.end()
          return
        }
        res.end(body)
      }, () => {
        res.writeHead(404)
        res.end()
      })
    },
  }))

  const customAssetRoutes: WebRoute[] = (['current', 'candidate'] as const).flatMap((slot): WebRoute[] => (
    [
      ['pet.json', 'application/json'],
      ['spritesheet.webp', 'image/webp'],
    ] as const
  ).map(([name, mime]): WebRoute => ({
    kind: 'exact',
    path: `${PET_CUSTOM_ASSET_PREFIX}/${slot}/${name}`,
    handler: (req: IncomingMessage, res: ServerResponse): Promise<void> | void => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405)
        res.end()
        return
      }
      return service.readCustomAsset(slot as PetAssetSlot, name).then((body) => {
        const etag = `\"${createHash('sha256').update(body).digest('hex')}\"`
        res.writeHead(200, {
          'content-type': mime,
          'content-length': String(body.byteLength),
          'cache-control': 'no-cache',
          etag,
        })
        if (req.method === 'HEAD') res.end()
        else res.end(body)
      }, (error) => { writeError(res, error) })
    },
  })))

  return [...apiRoutes, ...assetRoutes, ...customAssetRoutes]
}
