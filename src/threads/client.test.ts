import { describe, expect, it, vi } from 'vitest'
import { ThreadsClient } from './client.ts'
import { ThreadsApiError } from './errors.ts'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

function clientWith(fetchImpl: typeof fetch, maxRetries = 0) {
  return new ThreadsClient({ accessToken: 'token-abc', fetchImpl, maxRetries })
}

describe('transport', () => {
  it('sends the token as a bearer header, never in the query string', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: '1' }))
    await clientWith(fetchImpl as unknown as typeof fetch).getProfile()

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.searchParams.has('access_token')).toBe(false)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-abc')
  })

  it('drops undefined parameters instead of sending them as "undefined"', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }))
    await clientWith(fetchImpl as unknown as typeof fetch).listPosts({ limit: 5 })

    const [url] = fetchImpl.mock.calls[0] as unknown as [URL]
    expect(url.searchParams.get('limit')).toBe('5')
    expect(url.searchParams.has('after')).toBe(false)
  })

  it('raises a typed error carrying the API code, not the HTTP status', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { code: 10, message: 'Application does not have permission' } }, 500),
    )

    const failure = await clientWith(fetchImpl as unknown as typeof fetch)
      .deletePost('1')
      .catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ThreadsApiError)
    const error = failure as ThreadsApiError
    expect(error.code).toBe(10)
    expect(error.isPermissionDenied).toBe(true)
    expect(error.isNotFound).toBe(false)
  })

  it('recognises a deleted object by code and subcode together', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { code: 100, error_subcode: 33, message: 'does not exist' } }, 400),
    )

    const error = (await clientWith(fetchImpl as unknown as typeof fetch)
      .getPost('1')
      .catch((cause: unknown) => cause)) as ThreadsApiError

    expect(error.isNotFound).toBe(true)
  })

  it('retries a transient failure and gives up on a permission one', async () => {
    const transient = vi.fn(async () => jsonResponse({ error: { code: 2 } }, 503))
    await clientWith(transient as unknown as typeof fetch, 2)
      .getProfile()
      .catch(() => undefined)
    expect(transient).toHaveBeenCalledTimes(3)

    const denied = vi.fn(async () => jsonResponse({ error: { code: 10 } }, 500))
    await clientWith(denied as unknown as typeof fetch, 2)
      .getProfile()
      .catch(() => undefined)
    expect(denied).toHaveBeenCalledOnce()
  })
})

describe('publishing', () => {
  it('creates a container, then publishes it, then reads the post back', async () => {
    const calls: string[] = []
    const fetchImpl = vi.fn(async (input: URL) => {
      calls.push(`${input.pathname}`)
      if (input.pathname.endsWith('/threads_publish')) return jsonResponse({ id: 'post-1' })
      if (input.pathname.endsWith('/threads')) return jsonResponse({ id: 'container-1' })
      return jsonResponse({ id: 'post-1', text: 'привіт' })
    })

    const post = await clientWith(fetchImpl as unknown as typeof fetch).publishText('привіт')

    expect(calls).toEqual(['/v1.0/me/threads', '/v1.0/me/threads_publish', '/v1.0/post-1'])
    expect(post.id).toBe('post-1')
  })

  it('polls a media container until it reports FINISHED', async () => {
    let checks = 0
    const fetchImpl = vi.fn(async () => {
      checks += 1
      return jsonResponse({ id: 'c', status: checks < 3 ? 'IN_PROGRESS' : 'FINISHED' })
    })

    // Short interval so the test measures the polling logic, not the clock.
    await clientWith(fetchImpl as unknown as typeof fetch).waitForContainer('c', 5_000, 1)

    expect(checks).toBe(3)
  })

  it('gives up on a container that never finishes', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ id: 'c', status: 'IN_PROGRESS' }))

    await expect(
      clientWith(fetchImpl as unknown as typeof fetch).waitForContainer('c', 20, 1),
    ).rejects.toThrow(/still IN_PROGRESS/)
  })

  it('fails loudly when the container ends in an error state', async () => {
    const fetchImpl = vi.fn(async (input: URL) => {
      if (input.pathname === '/v1.0/me/threads') return jsonResponse({ id: 'container-3' })
      return jsonResponse({ id: 'container-3', status: 'ERROR', error_message: 'bad media' })
    })

    await expect(
      clientWith(fetchImpl as unknown as typeof fetch).publish('IMAGE', { imageUrl: 'x' }),
    ).rejects.toThrow(/bad media/)
  })
})

describe('search', () => {
  it('defaults keyword search to recent results', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [] }))
    await clientWith(fetchImpl as unknown as typeof fetch).keywordSearch('casy')

    const [url] = fetchImpl.mock.calls[0] as unknown as [URL]
    expect(url.pathname).toBe('/v1.0/keyword_search')
    expect(url.searchParams.get('q')).toBe('casy')
    expect(url.searchParams.get('search_type')).toBe('RECENT')
  })
})
