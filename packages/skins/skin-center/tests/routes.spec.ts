/**
 * Host route tests for the skin-center API family: real HTTP server, stubbed
 * dsh-skin runner (so no real CLI or ~/.dsh is ever touched), asserting the
 * argument sequences the CLI receives, the same-origin fence, and every
 * error path. Mirrors the family route-test pattern.
 */
import { createServer, request as httpRequest } from 'node:http'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import { makeSkinCenterRoutes, SKIN_CENTER_API_PREFIX } from '../src/routes.ts'
import { BackgroundAssetStore } from '../src/background-store.ts'

/** One stubbed CLI invocation: the args received and the stdout to return. */
interface StubStep {
  args: string[]
  out: string
  /** Exit as a failure carrying this stderr message. */
  fail?: string
}

/** A scripted dsh-skin stub recording every call. */
function stubRunner(steps: StubStep[]): { run: (args: string[]) => Promise<string>; calls: string[][] } {
  const calls: string[][] = []
  const run = (args: string[]): Promise<string> => {
    calls.push(args)
    const step = steps.shift()
    if (step === undefined) return Promise.reject(new Error(`unexpected dsh-skin call: ${args.join(' ')}`))
    if (step.args.join(' ') !== args.join(' ')) {
      return Promise.reject(new Error(`expected ${step.args.join(' ')} but got ${args.join(' ')}`))
    }
    if (step.fail !== undefined) return Promise.reject(new Error(step.fail.trim()))
    return Promise.resolve(step.out)
  }
  return { run, calls }
}

interface TestServer {
  port: number
  close: () => Promise<void>
}

/** Serve the route family from a real server. */
async function serve(routes: WebRoute[]): Promise<TestServer> {
  const server: Server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://x').pathname
    const route = routes.find(r => r.kind === 'exact'
      ? r.path === pathname
      : pathname === r.path || pathname.startsWith(`${r.path}/`))
    if (route === undefined) {
      response.writeHead(404)
      response.end()
      return
    }
    void route.handler(request, response)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return {
    port: address.port,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error === undefined || error === null) resolve()
        else reject(error)
      })
    }),
  }
}

/** One HTTP call with optional extra headers and raw body. */
async function call(
  port: number,
  method: string,
  path: string,
  opts: { body?: unknown; rawBody?: string | Buffer; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: Record<string, unknown>; raw: string; bytes: Buffer; headers: Record<string, string | string[] | undefined> }> {
  return await new Promise((resolve, reject) => {
    const headers: Record<string, string> = { ...opts.headers }
    if (opts.rawBody !== undefined) {
      headers['content-length'] = String(Buffer.byteLength(opts.rawBody))
    } else if (opts.body !== undefined) {
      headers['content-type'] = 'application/json'
      headers['content-length'] = String(Buffer.byteLength(JSON.stringify(opts.body)))
    }
    const req = httpRequest(
      { host: '127.0.0.1', port, path, method, headers },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => { chunks.push(chunk as Buffer) })
        response.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8')
          let body: Record<string, unknown> = {}
          try { body = JSON.parse(raw) as Record<string, unknown> } catch { /* empty body */ }
          resolve({ status: response.statusCode ?? 0, body, raw, bytes: Buffer.concat(chunks), headers: response.headers })
        })
      },
    )
    req.on('error', reject)
    if (opts.rawBody !== undefined) req.write(opts.rawBody)
    else if (opts.body !== undefined) req.write(JSON.stringify(opts.body))
    req.end()
  })
}

function backgroundWebP(width = 1200, height = 800): Buffer {
  const bytes = Buffer.alloc(30)
  bytes.write('RIFF', 0, 'ascii')
  bytes.writeUInt32LE(22, 4)
  bytes.write('WEBPVP8X', 8, 'ascii')
  bytes.writeUInt32LE(10, 16)
  bytes.writeUIntLE(width - 1, 24, 3)
  bytes.writeUIntLE(height - 1, 27, 3)
  return bytes
}

describe('skin-center routes', () => {
  it('uploads, serves, and deletes a normalized background WebP', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skin-center-routes-'))
    const backgrounds = new BackgroundAssetStore(root)
    const server = await serve(makeSkinCenterRoutes({ run: stubRunner([]).run, backgrounds }))
    const image = backgroundWebP()
    const upload = await call(server.port, 'POST', `${SKIN_CENTER_API_PREFIX}/background`, {
      rawBody: image,
      headers: { 'content-type': 'image/webp' },
    })
    const revision = String(upload.body.revision)
    const fetched = await call(server.port, 'GET', `${SKIN_CENTER_API_PREFIX}/background/${revision}.webp`)
    const removed = await call(server.port, 'DELETE', `${SKIN_CENTER_API_PREFIX}/background/${revision}.webp`)
    const missing = await call(server.port, 'GET', `${SKIN_CENTER_API_PREFIX}/background/${revision}.webp`)
    await server.close()

    expect(upload.status).toBe(200)
    expect(upload.body).toEqual({ ok: true, revision })
    expect(revision).toMatch(/^[a-f0-9]{64}$/)
    expect(fetched.status).toBe(200)
    expect(fetched.bytes).toEqual(image)
    expect(fetched.headers['content-type']).toBe('image/webp')
    expect(fetched.headers['cache-control']).toBe('private, max-age=31536000, immutable')
    expect(removed.body).toEqual({ ok: true, deleted: true })
    expect(missing.status).toBe(404)
  })

  it('fences invalid background uploads without leaking host details', async () => {
    const root = await mkdtemp(join(tmpdir(), 'skin-center-routes-'))
    const backgrounds = new BackgroundAssetStore(root)
    const server = await serve(makeSkinCenterRoutes({ run: stubRunner([]).run, backgrounds }))
    const wrongType = await call(server.port, 'POST', `${SKIN_CENTER_API_PREFIX}/background`, {
      rawBody: backgroundWebP(),
      headers: { 'content-type': 'image/png' },
    })
    const remoteHost = await call(server.port, 'POST', `${SKIN_CENTER_API_PREFIX}/background`, {
      rawBody: backgroundWebP(),
      headers: { 'content-type': 'image/webp', host: 'example.com' },
    })
    const malformed = await call(server.port, 'POST', `${SKIN_CENTER_API_PREFIX}/background`, {
      rawBody: Buffer.from('bad'),
      headers: { 'content-type': 'image/webp' },
    })
    await server.close()
    expect(wrongType).toMatchObject({ status: 415, body: { ok: false, error: 'unsupported-image-type' } })
    expect(remoteHost).toMatchObject({ status: 403, body: { ok: false, error: 'loopback-required' } })
    expect(malformed).toMatchObject({ status: 400, body: { ok: false, error: 'invalid-webp' } })
  })

  it('GET /state reports the active skin from the CLI', async () => {
    const { run } = stubRunner([{ args: ['current'], out: 'minecraft\n' }])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const response = await call(server.port, 'GET', `${SKIN_CENTER_API_PREFIX}/state`)
    await server.close()
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true, active: 'minecraft' })
  })

  it('GET /state maps an empty CLI answer to none (stock look)', async () => {
    const { run } = stubRunner([{ args: ['current'], out: '\n' }])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const response = await call(server.port, 'GET', `${SKIN_CENTER_API_PREFIX}/state`)
    await server.close()
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true, active: 'none' })
  })

  it('GET /state caches current() inside the TTL, expires it, and /apply invalidates it', async () => {
    const { run, calls } = stubRunner([
      { args: ['current'], out: 'minecraft\n' },
      { args: ['current'], out: 'ths\n' },
      { args: ['use', 'qq98'], out: 'wrote patch\n' },
      { args: ['current'], out: 'qq98\n' },
    ])
    const server = await serve(makeSkinCenterRoutes({ run }))
    let now = 1_000
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => now)
    try {
      // First /state performs the real CLI call and caches it.
      const first = await call(server.port, 'GET', `${SKIN_CENTER_API_PREFIX}/state`)
      // 700ms later: still inside the 750ms TTL, so the CLI is NOT re-run.
      now += 700
      const cached = await call(server.port, 'GET', `${SKIN_CENTER_API_PREFIX}/state`)
      // Past the TTL: a fresh CLI call happens.
      now += 100
      const expired = await call(server.port, 'GET', `${SKIN_CENTER_API_PREFIX}/state`)
      // /apply invalidates any cached answer after writing the patch.
      now += 50
      const apply = await call(server.port, 'POST', `${SKIN_CENTER_API_PREFIX}/apply`, { body: { skin: 'qq98' } })
      expect(first.body).toEqual({ ok: true, active: 'minecraft' })
      expect(cached.body).toEqual({ ok: true, active: 'minecraft' })
      expect(expired.body).toEqual({ ok: true, active: 'ths' })
      expect(apply.body).toEqual({ ok: true, active: 'qq98', message: 'wrote patch' })
      expect(calls).toEqual([['current'], ['current'], ['use', 'qq98'], ['current']])
    } finally {
      dateSpy.mockRestore()
      await server.close()
    }
  })

  it('GET /state surfaces a failing CLI as 500', async () => {
    const { run } = stubRunner([{ args: ['current'], fail: 'boom' }])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const response = await call(server.port, 'GET', `${SKIN_CENTER_API_PREFIX}/state`)
    await server.close()
    expect(response.status).toBe(500)
    expect(response.body).toEqual({ ok: false, error: 'boom' })
  })

  it('POST /apply switches a skin and reports the new active', async () => {
    const { run, calls } = stubRunner([
      { args: ['use', 'qq98'], out: 'wrote patch\n' },
      { args: ['current'], out: 'qq98\n' },
    ])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const response = await call(server.port, 'POST', `${SKIN_CENTER_API_PREFIX}/apply`, { body: { skin: 'qq98' } })
    await server.close()
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true, active: 'qq98', message: 'wrote patch' })
    expect(calls).toEqual([['use', 'qq98'], ['current']])
  })

  it('POST /apply official restores the stock look', async () => {
    const { run, calls } = stubRunner([
      { args: ['use', 'official'], out: 'restored\n' },
      { args: ['current'], out: '\n' },
    ])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const response = await call(server.port, 'POST', `${SKIN_CENTER_API_PREFIX}/apply`, { body: { official: true } })
    await server.close()
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true, active: 'none', message: 'restored' })
    expect(calls).toEqual([['use', 'official'], ['current']])
  })

  it('POST /apply rejects an empty body', async () => {
    const { run } = stubRunner([])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const response = await call(server.port, 'POST', `${SKIN_CENTER_API_PREFIX}/apply`, { body: {} })
    await server.close()
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ ok: false, error: 'invalid-skin: pass a skin name or official: true' })
  })

  it('POST /apply rejects an empty skin name', async () => {
    const { run } = stubRunner([])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const response = await call(server.port, 'POST', `${SKIN_CENTER_API_PREFIX}/apply`, { body: { skin: '' } })
    await server.close()
    expect(response.status).toBe(400)
  })

  it('POST /apply rejects skin and official together', async () => {
    const { run } = stubRunner([])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const response = await call(server.port, 'POST', `${SKIN_CENTER_API_PREFIX}/apply`, { body: { skin: 'qq98', official: true } })
    await server.close()
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ ok: false, error: 'invalid-skin: skin and official are mutually exclusive' })
  })

  it('POST /apply passes a CLI failure through as 400 with trimmed stderr', async () => {
    const { run } = stubRunner([{ args: ['use', 'nope'], fail: 'unknown skin "nope"\n' }])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const response = await call(server.port, 'POST', `${SKIN_CENTER_API_PREFIX}/apply`, { body: { skin: 'nope' } })
    await server.close()
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ ok: false, error: 'unknown skin "nope"' })
  })

  it('rejects cross-site requests on both endpoints', async () => {
    const { run } = stubRunner([])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const state = await call(server.port, 'GET', `${SKIN_CENTER_API_PREFIX}/state`, {
      headers: { 'sec-fetch-site': 'cross-site' },
    })
    const apply = await call(server.port, 'POST', `${SKIN_CENTER_API_PREFIX}/apply`, {
      body: { skin: 'qq98' },
      headers: { 'sec-fetch-site': 'cross-site' },
    })
    await server.close()
    expect(state.status).toBe(403)
    expect(apply.status).toBe(403)
    expect(state.body).toEqual({ ok: false, error: 'cross-site-request-rejected' })
  })

  it('rejects a mismatched Origin header', async () => {
    const { run } = stubRunner([])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const response = await call(server.port, 'POST', `${SKIN_CENTER_API_PREFIX}/apply`, {
      body: { skin: 'qq98' },
      headers: { origin: 'http://evil.example' },
    })
    await server.close()
    expect(response.status).toBe(403)
  })

  it('accepts a matching same-origin request', async () => {
    const { run } = stubRunner([
      { args: ['use', 'ths'], out: 'wrote patch\n' },
      { args: ['current'], out: 'ths\n' },
    ])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const response = await call(server.port, 'POST', `${SKIN_CENTER_API_PREFIX}/apply`, {
      body: { skin: 'ths' },
      headers: { 'sec-fetch-site': 'same-origin', origin: `http://127.0.0.1:${server.port}` },
    })
    await server.close()
    expect(response.status).toBe(200)
    expect(response.body).toEqual({ ok: true, active: 'ths', message: 'wrote patch' })
  })

  it('fences wrong methods with 405', async () => {
    const { run } = stubRunner([])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const response = await call(server.port, 'PUT', `${SKIN_CENTER_API_PREFIX}/apply`, { body: { skin: 'qq98' } })
    await server.close()
    expect(response.status).toBe(405)
  })

  it('GET /bundle/<id> serves a real skin client bundle as JavaScript', async () => {
    const { run } = stubRunner([])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const response = await call(server.port, 'GET', `${SKIN_CENTER_API_PREFIX}/bundle/qq98`)
    await server.close()
    expect(response.status).toBe(200)
    // The body is the prebuilt bundle text, executable as a script (it
    // registers the factory via window.__ModuleLoader__.load).
    expect(response.raw).toContain('window.__ModuleLoader__.load')
    expect(response.raw).toContain('@neystan/dsh-client-ui-skin-qq98')
  })

  it('GET /bundle/<id> 404s unknown skins and missing bundles', async () => {
    const { run } = stubRunner([])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const unknown = await call(server.port, 'GET', `${SKIN_CENTER_API_PREFIX}/bundle/nope`)
    const empty = await call(server.port, 'GET', `${SKIN_CENTER_API_PREFIX}/bundle/`)
    await server.close()
    expect(unknown.status).toBe(404)
    expect(unknown.body).toEqual({ ok: false, error: 'skin-not-found' })
    expect(empty.status).toBe(400)
    expect(empty.body).toEqual({ ok: false, error: 'invalid-skin-id' })
  })

  it('GET /bundle/<id> rejects path-traversal ids', async () => {
    const { run } = stubRunner([])
    const server = await serve(makeSkinCenterRoutes({ run }))
    // A raw `..` is collapsed by URL normalization before the handler
    // ever sees it, so the request misses the route entirely (404); an
    // encoded traversal survives normalization but fails the id charset
    // gate (400). Either way the skins tree is unreachable.
    const raw = await call(server.port, 'GET', `${SKIN_CENTER_API_PREFIX}/bundle/..`)
    const encoded = await call(server.port, 'GET', `${SKIN_CENTER_API_PREFIX}/bundle/%2e%2e%2f`)
    const nested = await call(server.port, 'GET', `${SKIN_CENTER_API_PREFIX}/bundle/qq98%2f..%2f..%2fetc%2fpasswd`)
    await server.close()
    expect(raw.status).toBe(404)
    expect(encoded.status).toBe(400)
    expect(nested.status).toBe(400)
  })

  it('fences the bundle route with method and same-origin checks', async () => {
    const { run } = stubRunner([])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const post = await call(server.port, 'POST', `${SKIN_CENTER_API_PREFIX}/bundle/qq98`)
    const cross = await call(server.port, 'GET', `${SKIN_CENTER_API_PREFIX}/bundle/qq98`, {
      headers: { 'sec-fetch-site': 'cross-site' },
    })
    await server.close()
    expect(post.status).toBe(405)
    expect(cross.status).toBe(403)
  })
  it('rejects malformed JSON bodies with 400', async () => {
    const { run } = stubRunner([])
    const server = await serve(makeSkinCenterRoutes({ run }))
    const response = await call(server.port, 'POST', `${SKIN_CENTER_API_PREFIX}/apply`, {
      rawBody: '{not json',
    })
    await server.close()
    expect(response.status).toBe(400)
    expect(response.body).toEqual({ ok: false, error: 'invalid-json' })
  })
})
