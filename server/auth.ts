import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

/**
 * Shared-secret gate for the API.
 *
 * The dashboard can publish and delete, so once the origin is reachable from
 * anywhere — a tunnel, a proxy, a forwarded port — an unauthenticated `/api` is
 * an open door into the Threads account. The secret comes from
 * `THREADS_AGENT_TOKEN`; when it is absent the server refuses to listen on
 * anything but loopback (see `resolveBinding`).
 */
export function checkAuth(request: IncomingMessage, secret: string | undefined): boolean {
  if (!secret) return true

  const header = request.headers.authorization
  const presented = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!presented) return false

  const expected = Buffer.from(secret)
  const actual = Buffer.from(presented)
  // Compare in constant time, and only when the lengths already match —
  // timingSafeEqual throws on a mismatch instead of returning false.
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export interface Binding {
  host: string
  port: number
}

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost'])

/**
 * Decides where to listen, and refuses the combination that would expose an
 * unauthenticated API.
 */
export function resolveBinding(
  env: Record<string, string | undefined>,
  secret: string | undefined,
): Binding {
  const host = env.HOST ?? '127.0.0.1'
  const port = Number(env.PORT ?? 8787)

  if (!LOOPBACK.has(host) && !secret) {
    throw new Error(
      `Відмовляюсь слухати ${host} без THREADS_AGENT_TOKEN: /api дозволяє публікацію ` +
        'та видалення. Задай токен або лишись на 127.0.0.1 за тунелем.',
    )
  }
  return { host, port }
}
