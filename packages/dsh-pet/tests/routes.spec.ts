import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { makePetRoutes, PET_API_PREFIX, PET_CUSTOM_ASSET_PREFIX } from '../src/routes.ts'
import type { PetService } from '../src/service.ts'

interface ResponseStub {
  status?: number
  headers?: Record<string, string>
  body?: Buffer | string
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: Buffer | string): void
}

function response(): ResponseStub {
  return {
    writeHead(status, headers) { this.status = status; this.headers = headers as Record<string, string> | undefined },
    end(body) { this.body = body },
  }
}

function request(method: string, body?: unknown): PassThrough & { method: string } {
  const req = new PassThrough() as PassThrough & { method: string }
  req.method = method
  if (body !== undefined) process.nextTick(() => {
    req.end(JSON.stringify(body))
  })
  else process.nextTick(() => req.end())
  return req
}

function fakeService(overrides: Record<string, unknown> = {}): PetService {
  return {
    state: vi.fn(async () => ({})),
    appearanceState: vi.fn(async () => ({
      appearance: 'official',
      official: {},
      stateToken: 'official:state',
    })),
    interact: vi.fn(async () => ({})),
    setVisible: vi.fn(async () => ({ ok: true, display: {} })),
    setConfig: vi.fn(async () => ({ ok: true, display: {} })),
    setName: vi.fn(async () => ({ ok: true, name: 'pet' })),
    importCandidate: vi.fn(async () => ({})),
    useOfficial: vi.fn(async () => ({})),
    useCustom: vi.fn(async () => ({})),
    deleteCustom: vi.fn(async () => ({})),
    readCustomAsset: vi.fn(async () => Buffer.from('{}')),
    ...overrides,
  } as unknown as PetService
}

describe('pet appearance routes', () => {
  it('registers management and fixed custom asset routes', () => {
    const routes = makePetRoutes({ service: fakeService(), packageRoot: process.cwd() })
    const paths = routes.map((route) => route.path)
    expect(paths).toContain(`${PET_API_PREFIX}/appearance`)
    expect(paths).toContain(`${PET_API_PREFIX}/appearance/import`)
    expect(paths).toContain(`${PET_API_PREFIX}/appearance/use-official`)
    expect(paths).toContain(`${PET_API_PREFIX}/appearance/use-custom`)
    expect(paths).toContain(`${PET_API_PREFIX}/appearance/delete`)
    expect(paths).toContain(`${PET_CUSTOM_ASSET_PREFIX}/current/pet.json`)
    expect(paths).toContain(`${PET_CUSTOM_ASSET_PREFIX}/candidate/spritesheet.webp`)
  })

  it('maps stale state to 409 and malformed import to 400', async () => {
    const stale = Object.assign(new Error('asset.state-conflict'), { status: 409, code: 'asset.state-conflict' })
    const service = fakeService({ useCustom: vi.fn(async () => { throw stale }) })
    const routes = makePetRoutes({ service, packageRoot: process.cwd() })
    const useCustom = routes.find((route) => route.path === `${PET_API_PREFIX}/appearance/use-custom`)!
    const malformed = routes.find((route) => route.path === `${PET_API_PREFIX}/appearance/import`)!
    const staleRes = response()
    await useCustom.handler(request('POST', { expectedState: 'old' }) as never, staleRes as never)
    expect(staleRes.status).toBe(409)
    const invalidRes = response()
    await malformed.handler(request('POST', { expectedState: 'old' }) as never, invalidRes as never)
    expect(invalidRes.status).toBe(400)
  })

  it('serves custom assets with fixed type, no-cache, and an ETag', async () => {
    const service = fakeService({ readCustomAsset: vi.fn(async () => Buffer.from('asset')) })
    const routes = makePetRoutes({ service, packageRoot: process.cwd() })
    const asset = routes.find((route) => route.path === `${PET_CUSTOM_ASSET_PREFIX}/current/pet.json`)!
    const res = response()
    await asset.handler(request('GET') as never, res as never)
    expect(res.status).toBe(200)
    expect(res.headers?.['content-type']).toBe('application/json')
    expect(res.headers?.['cache-control']).toBe('no-cache')
    expect(res.headers?.etag).toBeTruthy()
    expect(res.body).toEqual(Buffer.from('asset'))
  })
})
