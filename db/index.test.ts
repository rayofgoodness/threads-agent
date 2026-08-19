import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isDbEnabled, listGenerations, markDraftQueued, metricsHistory, recordGeneration } from './index.ts'

const original = process.env.DATABASE_URL

beforeEach(() => {
  delete process.env.DATABASE_URL
})

afterEach(() => {
  if (original === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = original
})

/**
 * The database is optional: the agent has to keep drafting and queueing on a
 * machine that never ran `docker compose up`. Nothing here may connect.
 */
describe('without DATABASE_URL', () => {
  it('reports itself as off', () => {
    expect(isDbEnabled()).toBe(false)
  })

  it('records nothing and answers with no id', async () => {
    const id = await recordGeneration({
      model: 'claude-opus-5',
      drafts: [{ topic: 'Тема', text: 'текст', note: 'кут', violations: [] }],
      usage: { input: 1, output: 2, cached: 0 },
    })
    expect(id).toBeUndefined()
  })

  it('takes an undefined generation id without complaint', async () => {
    await expect(markDraftQueued(undefined, 0, 'file.md')).resolves.toBeUndefined()
  })

  it('reads back as empty rather than failing', async () => {
    expect(await listGenerations()).toEqual([])
    expect(await metricsHistory('123')).toEqual([])
  })
})
