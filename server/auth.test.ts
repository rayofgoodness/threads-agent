import { describe, expect, it } from 'vitest'
import type { IncomingMessage } from 'node:http'
import { checkAuth, resolveBinding } from './auth.ts'

const request = (authorization?: string) =>
  ({ headers: authorization ? { authorization } : {} }) as IncomingMessage

describe('checkAuth', () => {
  it('lets everything through when no secret is configured', () => {
    expect(checkAuth(request(), undefined)).toBe(true)
  })

  it('accepts the exact bearer token and nothing else', () => {
    expect(checkAuth(request('Bearer s3cret'), 's3cret')).toBe(true)
    expect(checkAuth(request('Bearer wrong!'), 's3cret')).toBe(false)
    expect(checkAuth(request('Bearer s3cre'), 's3cret')).toBe(false)
    expect(checkAuth(request('s3cret'), 's3cret')).toBe(false)
    expect(checkAuth(request(), 's3cret')).toBe(false)
  })
})

describe('resolveBinding', () => {
  it('defaults to loopback', () => {
    expect(resolveBinding({}, undefined)).toEqual({ host: '127.0.0.1', port: 8788 })
  })

  it('refuses a public interface without a secret', () => {
    expect(() => resolveBinding({ HOST: '0.0.0.0' }, undefined)).toThrow(/THREADS_AGENT_TOKEN/)
  })

  it('allows a public interface once a secret exists', () => {
    expect(resolveBinding({ HOST: '0.0.0.0', PORT: '9000' }, 'k')).toEqual({
      host: '0.0.0.0',
      port: 9000,
    })
  })
})
