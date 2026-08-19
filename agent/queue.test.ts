import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AgentConfig } from './config.ts'
import { addItem, dueItems, listPublished, listQueue, settleItem } from './queue.ts'

let root: string
let config: AgentConfig

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'queue-'))
  config = {
    account: 'calendarsync',
    timezone: 'Europe/Kyiv',
    content: {
      queueDir: join(root, 'queue'),
      publishedDir: join(root, 'published'),
      knowledgeDir: join(root, 'knowledge'),
    },
    schedule: { slots: ['09:30'], maxPerDay: 2 },
    guardrails: { maxLength: 500, minLength: 40, bannedPhrases: [] },
    monitor: { keywords: [] },
  }
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('queue files', () => {
  it('writes front matter and reads it back unchanged', () => {
    addItem(config, 'Текст поста', '2026-08-20T09:30:00+03:00')

    const [item] = listQueue(config)
    expect(item?.status).toBe('queued')
    expect(item?.publishAt).toBe('2026-08-20T09:30:00+03:00')
    expect(item?.text).toBe('Текст поста')
  })

  it('sorts by slot, not by file creation order', () => {
    addItem(config, 'пізніший', '2026-09-01T09:00:00+03:00')
    addItem(config, 'раніший', '2026-08-01T09:00:00+03:00')

    expect(listQueue(config).map((item) => item.text)).toEqual(['раніший', 'пізніший'])
  })

  it('treats an item with no slot as due immediately', () => {
    mkdirSync(config.content.queueDir, { recursive: true })
    writeFileSync(join(config.content.queueDir, 'a.md'), '---\nstatus: queued\n---\n\nбез часу\n')

    expect(dueItems(config).map((item) => item.text)).toEqual(['без часу'])
  })

  it('leaves a future slot alone', () => {
    addItem(config, 'завтра', '2099-01-01T09:00:00+03:00')

    expect(dueItems(config)).toHaveLength(0)
  })

  it('moves a published item out of the queue and records the post id', () => {
    addItem(config, 'у ефір', '2026-08-01T09:00:00+03:00')
    const [item] = listQueue(config)

    const target = settleItem(config, item!, {
      status: 'published',
      postId: '123',
      permalink: 'https://example.test/p/1',
    })

    expect(listQueue(config)).toHaveLength(0)
    const [published] = listPublished(config)
    expect(published?.postId).toBe('123')
    expect(published?.publishedAt).toBeTruthy()
    expect(readFileSync(target, 'utf8')).toContain('status: published')
  })

  it('keeps a failed item queued, with the reason attached', () => {
    addItem(config, 'проблемний', '2026-08-01T09:00:00+03:00')
    const [item] = listQueue(config)

    settleItem(config, item!, { status: 'failed', note: 'квота вичерпана' })

    const [failed] = listQueue(config)
    expect(failed?.status).toBe('failed')
    expect(failed?.note).toBe('квота вичерпана')
    // A failed item is no longer due — it needs a human before it retries.
    expect(dueItems(config)).toHaveLength(0)
  })

  it('survives a file with no front matter at all', () => {
    mkdirSync(config.content.queueDir, { recursive: true })
    writeFileSync(join(config.content.queueDir, 'plain.md'), 'просто текст\n')

    const [item] = listQueue(config)
    expect(item?.status).toBe('queued')
    expect(item?.text).toBe('просто текст')
  })
})
