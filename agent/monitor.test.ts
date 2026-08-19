import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig, type AgentConfig } from './config.ts'
import { collectSignals } from './monitor.ts'
import { ThreadsApiError, type ThreadsClient } from '../src/threads/index.ts'

let root: string
let statePath: string
let config: AgentConfig

const ACCESS_DENIED = new ThreadsApiError('GET /me/mentions', 500, {
  code: 10,
  message: 'Application does not have permission for this action',
})

interface FakeParts {
  posts?: { id: string; has_replies?: boolean }[]
  replies?: Record<string, { id: string; username: string; text: string }[]>
  mentions?: { id: string; username: string; text: string }[]
  hits?: Record<string, { id: string; username: string; text: string }[]>
  mentionsFail?: boolean
}

function fakeClient(parts: FakeParts): ThreadsClient {
  return {
    listPosts: vi.fn(async () => ({ data: parts.posts ?? [] })),
    listReplies: vi.fn(async (postId: string) => ({ data: parts.replies?.[postId] ?? [] })),
    listMentions: vi.fn(async () => {
      if (parts.mentionsFail) throw ACCESS_DENIED
      return { data: parts.mentions ?? [] }
    }),
    keywordSearch: vi.fn(async (keyword: string) => ({ data: parts.hits?.[keyword] ?? [] })),
  } as unknown as ThreadsClient
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'monitor-'))
  statePath = join(root, 'state.json')
  config = {
    account: 'calendarsync',
    timezone: 'Europe/Kyiv',
    content: {
      queueDir: join(root, 'q'),
      publishedDir: join(root, 'p'),
      knowledgeDir: join(root, 'k'),
      planFile: join(root, 'plan.md'),
    },
    schedule: { slots: [], maxPerDay: 2 },
    guardrails: { maxLength: 500, minLength: 40, bannedPhrases: [] },
    voice: defaultConfig().voice,
    generation: defaultConfig().generation,
    monitor: { keywords: ['casy'] },
  }
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('collectSignals', () => {
  it('reports replies written by other people', async () => {
    const client = fakeClient({
      posts: [{ id: 'p1', has_replies: true }],
      replies: { p1: [{ id: 'r1', username: 'majstrynia', text: 'А нагадування у Viber є?' }] },
    })

    const report = await collectSignals(config, { client, statePath })

    expect(report.signals.map((signal) => signal.id)).toEqual(['r1'])
    expect(report.signals[0]?.kind).toBe('reply')
  })

  it('ignores the account replying to itself', async () => {
    const client = fakeClient({
      posts: [{ id: 'p1', has_replies: true }],
      replies: { p1: [{ id: 'own', username: 'calendarsync', text: 'наша відповідь' }] },
    })

    expect((await collectSignals(config, { client, statePath })).signals).toHaveLength(0)
  })

  it('skips posts that have no replies instead of asking for them', async () => {
    const client = fakeClient({ posts: [{ id: 'p1', has_replies: false }] })

    await collectSignals(config, { client, statePath })

    expect(client.listReplies).not.toHaveBeenCalled()
  })

  it('drops our own posts out of keyword hits', async () => {
    const client = fakeClient({
      hits: {
        casy: [
          { id: 'k1', username: 'salon_kyiv', text: 'Хтось користувався casy?' },
          { id: 'k2', username: 'calendarsync', text: 'наш власний пост' },
        ],
      },
    })

    const report = await collectSignals(config, { client, keywords: ['casy'], statePath })

    expect(report.signals.map((signal) => signal.id)).toEqual(['k1'])
    expect(report.signals[0]?.matched).toBe('casy')
  })

  it('keeps the other channels when mentions are blocked', async () => {
    const client = fakeClient({
      posts: [{ id: 'p1', has_replies: true }],
      replies: { p1: [{ id: 'r1', username: 'someone', text: 'питання' }] },
      mentionsFail: true,
    })

    const report = await collectSignals(config, { client, statePath })

    expect(report.signals).toHaveLength(1)
    expect(report.unavailable[0]?.source).toBe('mention')
    expect(report.unavailable[0]?.reason).toContain('App Review')
  })

  it('reports each signal once across runs, unless asked for all', async () => {
    const client = fakeClient({
      posts: [{ id: 'p1', has_replies: true }],
      replies: { p1: [{ id: 'r1', username: 'someone', text: 'питання' }] },
    })

    expect((await collectSignals(config, { client, statePath })).signals).toHaveLength(1)
    expect((await collectSignals(config, { client, statePath })).signals).toHaveLength(0)
    expect((await collectSignals(config, { client, statePath, all: true })).signals).toHaveLength(1)
  })

  it('starts clean when the state file is corrupt', async () => {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(statePath, 'не json')
    const client = fakeClient({
      posts: [{ id: 'p1', has_replies: true }],
      replies: { p1: [{ id: 'r1', username: 'someone', text: 'питання' }] },
    })

    expect((await collectSignals(config, { client, statePath })).signals).toHaveLength(1)
  })
})
