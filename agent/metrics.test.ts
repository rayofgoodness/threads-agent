import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { collectMetrics, intervalFor, isDue, type MetricValues } from './metrics.ts'
import type { ThreadsClient } from '../src/threads/index.ts'

const NOW = new Date('2026-08-20T12:00:00.000Z')

/** Hours before NOW, as an ISO timestamp. */
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString()

interface FakeParts {
  posts?: { id: string; timestamp?: string }[]
  insights?: Record<string, { name: string; total_value?: { value: number } }[]>
  failing?: string[]
  listFails?: boolean
}

function fakeClient(parts: FakeParts) {
  return {
    listPosts: vi.fn(async () => {
      if (parts.listFails) throw new Error('graph.threads.net unreachable')
      return { data: parts.posts ?? [] }
    }),
    postInsights: vi.fn(async (postId: string) => {
      if (parts.failing?.includes(postId)) throw new Error(`no insights for ${postId}`)
      return parts.insights?.[postId] ?? []
    }),
  } as unknown as ThreadsClient
}

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://test//unused'
})

afterEach(() => {
  delete process.env.DATABASE_URL
})

describe('intervalFor', () => {
  it('reads a fresh post every three hours', () => {
    expect(intervalFor(0)).toBe(3)
    expect(intervalFor(47.9)).toBe(3)
  })

  it('drops to daily after the second day', () => {
    expect(intervalFor(48)).toBe(24)
    expect(intervalFor(24 * 6)).toBe(24)
  })

  it('stops reading after a week', () => {
    expect(intervalFor(24 * 7)).toBeUndefined()
    expect(intervalFor(24 * 30)).toBeUndefined()
  })
})

describe('isDue', () => {
  it('is due when a post inside the window has never been read', () => {
    expect(isDue(ago(1), undefined, NOW)).toBe(true)
  })

  it('is not due again before the interval has passed', () => {
    expect(isDue(ago(10), ago(1), NOW)).toBe(false)
    expect(isDue(ago(10), ago(3), NOW)).toBe(true)
  })

  it('applies the slower interval to an older post', () => {
    // Three days old: a reading from six hours ago is still fresh enough.
    expect(isDue(ago(72), ago(6), NOW)).toBe(false)
    expect(isDue(ago(72), ago(25), NOW)).toBe(true)
  })

  it('never reads a post that has aged out, however long since the last one', () => {
    expect(isDue(ago(24 * 20), ago(24 * 19), NOW)).toBe(false)
  })

  it('ignores a post with no usable timestamp rather than reading it forever', () => {
    expect(isDue(undefined, undefined, NOW)).toBe(false)
    expect(isDue('not a date', undefined, NOW)).toBe(false)
  })

  it('ignores a timestamp in the future', () => {
    expect(isDue(new Date(NOW.getTime() + 3_600_000).toISOString(), undefined, NOW)).toBe(false)
  })
})

describe('collectMetrics', () => {
  it('does nothing without a database, because there is nowhere to put a reading', async () => {
    delete process.env.DATABASE_URL
    const client = fakeClient({ posts: [{ id: 'a', timestamp: ago(1) }] })

    const report = await collectMetrics({ client, now: NOW })

    expect(report.enabled).toBe(false)
    expect(report.captured).toEqual([])
    expect(client.listPosts).not.toHaveBeenCalled()
  })

  it('reads only the posts that are due and stores one row each', async () => {
    const written: [string, MetricValues][] = []
    const client = fakeClient({
      posts: [
        { id: 'fresh', timestamp: ago(1) },
        { id: 'recent', timestamp: ago(10) },
        { id: 'old', timestamp: ago(24 * 30) },
      ],
      insights: {
        fresh: [
          { name: 'views', total_value: { value: 120 } },
          { name: 'likes', total_value: { value: 4 } },
        ],
      },
    })

    const report = await collectMetrics({
      client,
      now: NOW,
      readLastCaptures: async () => new Map([['recent', ago(1)]]),
      write: async (postId, values) => {
        written.push([postId, values])
        return true
      },
    })

    expect(report.captured).toEqual(['fresh'])
    expect(report.skipped).toBe(2)
    expect(report.considered).toBe(3)
    expect(written).toEqual([
      ['fresh', { views: 120, likes: 4, replies: null, reposts: null, quotes: null }],
    ])
  })

  it('keeps the readings it has when one post fails', async () => {
    const client = fakeClient({
      posts: [
        { id: 'ok', timestamp: ago(1) },
        { id: 'gone', timestamp: ago(2) },
      ],
      failing: ['gone'],
    })

    const report = await collectMetrics({
      client,
      now: NOW,
      readLastCaptures: async () => new Map(),
      write: async () => true,
    })

    expect(report.captured).toEqual(['ok'])
    expect(report.failed).toEqual([{ postId: 'gone', reason: 'no insights for gone' }])
  })

  it('reports a failure to list posts instead of throwing', async () => {
    const client = fakeClient({ listFails: true })

    const report = await collectMetrics({
      client,
      now: NOW,
      readLastCaptures: async () => new Map(),
      write: async () => true,
    })

    expect(report.captured).toEqual([])
    expect(report.failed[0]?.postId).toBe('*')
  })
})
