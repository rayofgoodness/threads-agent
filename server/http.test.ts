import { describe, expect, it, vi } from 'vitest'
import { createHandler, HttpError, Router } from './http.ts'
import { ThreadsApiError } from '../src/threads/index.ts'

/** Minimal stand-ins for the node:http pair the handler writes to. */
function fakeExchange(method: string, url: string, body = '') {
  const request = {
    method,
    url,
    headers: { host: 'localhost' },
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(body)
    },
  }
  const response = {
    status: 0,
    payload: undefined as unknown,
    writeHead(status: number) {
      this.status = status
    },
    end(raw: string) {
      this.payload = raw ? JSON.parse(raw) : undefined
    },
  }
  return { request, response }
}

async function call(router: Router, method: string, url: string, body = '') {
  const { request, response } = fakeExchange(method, url, body)
  await createHandler(router)(request as never, response as never)
  return response
}

describe('Router', () => {
  it('extracts path parameters', async () => {
    const router = new Router().get('/api/posts/:id', async ({ params }) => ({ id: params.id }))

    expect((await call(router, 'GET', '/api/posts/42')).payload).toEqual({ id: '42' })
  })

  it('decodes percent-encoded segments', async () => {
    const router = new Router().get('/api/tag/:name', async ({ params }) => ({ name: params.name }))

    expect((await call(router, 'GET', '/api/tag/%D0%B7%D0%B0%D0%BF%D0%B8%D1%81')).payload).toEqual({
      name: 'запис',
    })
  })

  it('separates routes by method', async () => {
    const router = new Router()
      .get('/api/posts/:id', async () => ({ read: true }))
      .delete('/api/posts/:id', async () => ({ deleted: true }))

    expect((await call(router, 'DELETE', '/api/posts/1')).payload).toEqual({ deleted: true })
  })

  it('does not match a path of a different length', async () => {
    const router = new Router().get('/api/posts/:id', async () => ({ ok: true }))

    expect((await call(router, 'GET', '/api/posts/1/replies')).status).toBe(404)
  })

  it('passes the query string through', async () => {
    const router = new Router().get('/api/posts', async ({ query }) => ({ limit: query.get('limit') }))

    expect((await call(router, 'GET', '/api/posts?limit=5')).payload).toEqual({ limit: '5' })
  })

  it('parses a JSON body and rejects a broken one', async () => {
    const router = new Router().post('/api/posts', async ({ body }) => await body())

    expect((await call(router, 'POST', '/api/posts', '{"text":"привіт"}')).payload).toEqual({
      text: 'привіт',
    })
    expect((await call(router, 'POST', '/api/posts', '{oops')).status).toBe(400)
  })
})

describe('error mapping', () => {
  const cases: [number, number][] = [
    [190, 401], // expired token
    [10, 403], // missing permission
    [100, 404], // object gone — subcode 33 below
    [4, 429], // quota
    [999, 502], // anything else is an upstream failure
  ]

  it.each(cases)('maps Threads code %i to HTTP %i', async (code, status) => {
    const router = new Router().get('/api/x', async () => {
      throw new ThreadsApiError('GET /x', 500, { code, error_subcode: code === 100 ? 33 : undefined })
    })

    expect((await call(router, 'GET', '/api/x')).status).toBe(status)
  })

  it('uses the status an HttpError carries', async () => {
    const router = new Router().get('/api/x', async () => {
      throw new HttpError(400, 'потрібен text')
    })

    const response = await call(router, 'GET', '/api/x')
    expect(response.status).toBe(400)
    expect(response.payload).toEqual({ error: 'потрібен text' })
  })

  it('turns an unexpected throw into a 500', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const router = new Router().get('/api/x', async () => {
      throw new Error('щось пішло не так')
    })

    expect((await call(router, 'GET', '/api/x')).status).toBe(500)
  })
})
