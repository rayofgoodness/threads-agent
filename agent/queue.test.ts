import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultConfig, type AgentConfig } from './config.ts'
import {
  addDraft,
  addItem,
  DraftError,
  dueItems,
  listDrafts,
  listPublished,
  listQueue,
  removeDraft,
  scheduleDraft,
  settleItem,
  updateDraft,
} from './queue.ts'

let root: string
let config: AgentConfig

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'queue-'))
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
    guardrails: { maxLength: 500, minLength: 40, bannedPhrases: [] },
    voice: defaultConfig().voice,
    generation: defaultConfig().generation,
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

describe('drafts', () => {
  it('keeps a draft out of the queue entirely', () => {
    addDraft(config, 'Текст чернетки')
    expect(listQueue(config)).toEqual([])
    expect(dueItems(config)).toEqual([])
    expect(listDrafts(config)).toHaveLength(1)
  })

  it('records the topic it was written for', () => {
    const draft = addDraft(config, 'Текст', 'Тема поста')
    expect(listDrafts(config)[0]?.topic).toBe('Тема поста')
    expect(readFileSync(draft.path, 'utf8')).toContain('topic: Тема поста')
  })

  // The shelf has no schedule, so newest-first is the only ordering that means
  // anything — and the file name is the timestamp it was kept at.
  it('lists the newest first', () => {
    mkdirSync(config.content.draftsDir, { recursive: true })
    for (const [name, text] of [
      ['2026-01-01T00-00-00-000Z.md', 'Стара'],
      ['2026-08-01T00-00-00-000Z.md', 'Свіжа'],
    ]) {
      writeFileSync(join(config.content.draftsDir, name!), `---\nstatus: draft\n---\n\n${text}\n`)
    }
    expect(listDrafts(config).map((item) => item.text)).toEqual(['Свіжа', 'Стара'])
  })

  it('rewrites the text and keeps the status', () => {
    const draft = addDraft(config, 'Було', 'Тема')
    const updated = updateDraft(config, draft.file, 'Стало')
    expect(updated.text).toBe('Стало')
    expect(updated.status).toBe('draft')
    expect(listDrafts(config)[0]?.topic).toBe('Тема')
  })

  it('deletes on request', () => {
    const draft = addDraft(config, 'Тимчасова')
    removeDraft(config, draft.file)
    expect(listDrafts(config)).toEqual([])
  })

  it('moves into the queue with a slot, and only then becomes due', () => {
    const draft = addDraft(config, 'Готова до публікації', 'Тема')
    const queued = scheduleDraft(config, draft.file, '2020-01-01T00:00:00.000Z')

    expect(listDrafts(config)).toEqual([])
    expect(queued.status).toBe('queued')
    expect(queued.topic).toBe('Тема')
    expect(dueItems(config).map((item) => item.text)).toEqual(['Готова до публікації'])
  })

  // The file name reaches this from the browser; a path separator in it would
  // let a request read or write outside the drafts directory.
  it('refuses a name that is not a plain file in the drafts directory', () => {
    expect(() => removeDraft(config, '../plan.md')).toThrow(DraftError)
    expect(() => removeDraft(config, 'note.txt')).toThrow(DraftError)
    try {
      removeDraft(config, '../plan.md')
    } catch (error) {
      expect((error as DraftError).reason).toBe('invalid')
    }
  })

  it('reports a missing draft as missing, not as invalid', () => {
    try {
      updateDraft(config, '2020-01-01T00-00-00-000Z.md', 'текст')
      expect.unreachable()
    } catch (error) {
      expect((error as DraftError).reason).toBe('missing')
    }
  })

  // A file that ends up in the wrong directory must not be treated as due.
  it('never treats a draft status as publishable', () => {
    mkdirSync(config.content.queueDir, { recursive: true })
    writeFileSync(join(config.content.queueDir, 'stray.md'), '---\nstatus: draft\n---\n\nЗабрела сюди')
    expect(dueItems(config)).toEqual([])
  })
})
