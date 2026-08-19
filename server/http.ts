import type { IncomingMessage, ServerResponse } from 'node:http'
import { DraftError } from '../agent/queue.ts'
import { ThreadsApiError } from '../src/threads/index.ts'

export interface RequestContext {
  params: Record<string, string>
  query: URLSearchParams
  body: () => Promise<Record<string, unknown>>
}

export type Handler = (ctx: RequestContext) => Promise<unknown>

interface Route {
  method: string
  /** Path split into literal segments and `:name` placeholders. */
  segments: string[]
  handler: Handler
}

/** Tiny path router — enough for a handful of JSON endpoints, no dependency. */
export class Router {
  private readonly routes: Route[] = []

  add(method: string, path: string, handler: Handler): this {
    this.routes.push({ method, segments: path.split('/').filter(Boolean), handler })
    return this
  }

  get = (path: string, handler: Handler) => this.add('GET', path, handler)
  post = (path: string, handler: Handler) => this.add('POST', path, handler)
  put = (path: string, handler: Handler) => this.add('PUT', path, handler)
  delete = (path: string, handler: Handler) => this.add('DELETE', path, handler)

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | undefined {
    const parts = pathname.split('/').filter(Boolean)
    for (const route of this.routes) {
      if (route.method !== method || route.segments.length !== parts.length) continue
      const params: Record<string, string> = {}
      let matched = true
      for (const [index, segment] of route.segments.entries()) {
        const actual = parts[index]
        if (actual === undefined) {
          matched = false
          break
        }
        if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(actual)
        else if (segment !== actual) {
          matched = false
          break
        }
      }
      if (matched) return { handler: route.handler, params }
    }
    return undefined
  }
}

/** HTTP status for a failed Threads call — the API's own codes are not usable as statuses. */
function statusFor(error: ThreadsApiError): number {
  if (error.isAuthError) return 401
  if (error.isPermissionDenied) return 403
  if (error.isNotFound) return 404
  if (error.isRateLimited) return 429
  return 502
}

export function send(response: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  })
  response.end(body)
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(chunk as Buffer)
  if (chunks.length === 0) return {}
  const raw = Buffer.concat(chunks).toString('utf8')
  try {
    const parsed: unknown = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {}
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON')
  }
}

/**
 * An error the handler raises deliberately, with the status it should produce.
 *
 * The field is assigned in the body rather than declared as a constructor
 * parameter property — Node's type stripping rejects those.
 */
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export function createHandler(router: Router) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`)
    const route = router.match(request.method ?? 'GET', url.pathname)

    if (!route) return send(response, 404, { error: `No route for ${request.method} ${url.pathname}` })

    try {
      const result = await route.handler({
        params: route.params,
        query: url.searchParams,
        body: () => readBody(request),
      })
      send(response, 200, result ?? { ok: true })
    } catch (error) {
      if (error instanceof ThreadsApiError) {
        return send(response, statusFor(error), {
          error: error.message,
          code: error.code,
          subcode: error.subcode,
          traceId: error.traceId,
        })
      }
      if (error instanceof HttpError) return send(response, error.status, { error: error.message })
      if (error instanceof DraftError) {
        return send(response, error.reason === 'missing' ? 404 : 400, { error: error.message })
      }
      const message = error instanceof Error ? error.message : String(error)
      console.error('[api] unhandled', error)
      send(response, 500, { error: message })
    }
  }
}
