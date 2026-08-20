import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig, type AgentConfig } from './config.ts'
import { addItem, listPublished, listQueue } from './queue.ts'
import { checkGuardrails, publishedToday, runDue } from './publisher.ts'
import { ThreadsApiError, type ThreadsClient } from '../src/threads/index.ts'

let root: string
let config: AgentConfig

const PAST = '2020-01-01T09:00:00+03:00'
const LONG_ENOUGH = 'Достатньо довгий текст поста, який проходить нижню межу обмежень.'

function fakeClient(publish: ThreadsClient['publishText']): ThreadsClient {
  return { publishText: publish } as unknown as ThreadsClient
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'publisher-'))
  config = {
    account: 'calendarsync',
    timezone: 'Europe/Kyiv',
    content: {
      queueDir: join(root, 'queue'),
      draftsDir: join(root, 'drafts'),
      publishedDir: join(root, 'published'),
      knowledgeDir: join(root, 'knowledge'),
      planFile: join(root, 'plan.md'),
    },
    schedule: { slots: ['09:30'], maxPerDay: 2 },
    guardrails: { maxLength: 100, minLength: 40, bannedPhrases: ['Не пропустіть'] },
    voice: defaultConfig().voice,
    generation: defaultConfig().generation,
    monitor: { keywords: [], keywordSearch: true },
  }
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('guardrails', () => {
  it('passes text inside the bounds', () => {
    expect(checkGuardrails(config, LONG_ENOUGH)).toEqual([])
  })

  it('flags text that is too short, too long, or empty', () => {
    expect(checkGuardrails(config, 'коротко')[0]?.rule).toBe('minLength')
    expect(checkGuardrails(config, 'я'.repeat(101))[0]?.rule).toBe('maxLength')
    expect(checkGuardrails(config, '   ')[0]?.rule).toBe('empty')
  })

  it('matches banned phrases regardless of case', () => {
    const violations = checkGuardrails(config, `${LONG_ENOUGH} не пропустіть!`)
    expect(violations.map((violation) => violation.rule)).toContain('bannedPhrase')
  })
})

describe('runDue', () => {
  it('publishes nothing without commit', async () => {
    addItem(config, LONG_ENOUGH, PAST)
    const publish = vi.fn()

    const results = await runDue(config, { client: fakeClient(publish) })

    expect(publish).not.toHaveBeenCalled()
    expect(results[0]?.action).toBe('skipped')
    expect(listQueue(config)).toHaveLength(1)
  })

  it('publishes a due item and moves its file', async () => {
    addItem(config, LONG_ENOUGH, PAST)
    const publish = vi.fn(async () => ({ id: '42', permalink: 'https://example.test/p/42' }))

    const results = await runDue(config, { commit: true, client: fakeClient(publish) })

    expect(publish).toHaveBeenCalledOnce()
    expect(results[0]?.action).toBe('published')
    expect(listQueue(config)).toHaveLength(0)
    expect(listPublished(config)[0]?.postId).toBe('42')
  })

  it('blocks an item that violates the guardrails instead of publishing it', async () => {
    addItem(config, 'закоротко', PAST)
    const publish = vi.fn()

    const results = await runDue(config, { commit: true, client: fakeClient(publish) })

    expect(publish).not.toHaveBeenCalled()
    expect(results[0]?.action).toBe('blocked')
    // A blocked item stays queued so it can be edited rather than retyped.
    expect(listQueue(config)).toHaveLength(1)
  })

  it('stops at the daily cap', async () => {
    for (let index = 0; index < 3; index++) addItem(config, `${LONG_ENOUGH} ${index}`, PAST)
    const publish = vi.fn(async () => ({ id: 'x', permalink: 'https://example.test/p/x' }))

    const results = await runDue(config, { commit: true, client: fakeClient(publish) })

    expect(publish).toHaveBeenCalledTimes(2)
    expect(results.map((result) => result.action)).toEqual(['published', 'published', 'skipped'])
    expect(results[2]?.detail).toContain('ліміт')
  })

  it('counts what already went out today against the cap', async () => {
    addItem(config, LONG_ENOUGH, PAST)
    await runDue(config, {
      commit: true,
      client: fakeClient(vi.fn(async () => ({ id: '1', permalink: 'p' }))),
    })

    expect(publishedToday(config)).toBe(1)

    addItem(config, `${LONG_ENOUGH} другий`, PAST)
    addItem(config, `${LONG_ENOUGH} третій`, PAST)
    const publish = vi.fn(async () => ({ id: '2', permalink: 'p' }))
    const results = await runDue(config, { commit: true, client: fakeClient(publish) })

    expect(publish).toHaveBeenCalledOnce()
    expect(results.map((result) => result.action)).toEqual(['published', 'skipped'])
  })

  it('records the reason on a failed publish and leaves the item queued', async () => {
    addItem(config, LONG_ENOUGH, PAST)
    const publish = vi.fn(async () => {
      throw new ThreadsApiError('POST /me/threads_publish', 500, {
        code: 10,
        message: 'Application does not have permission for this action',
      })
    })

    const results = await runDue(config, { commit: true, client: fakeClient(publish) })

    expect(results[0]?.action).toBe('failed')
    const [item] = listQueue(config)
    expect(item?.status).toBe('failed')
    expect(item?.note).toContain('permission')
  })
})
