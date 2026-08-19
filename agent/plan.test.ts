import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultConfig, type AgentConfig } from './config.ts'
import { markTopicDone, parsePlan, pendingTopics, readPlan, writePlan } from './plan.ts'

let root: string
let config: AgentConfig

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'plan-'))
  config = defaultConfig()
  config.content.planFile = join(root, 'plan.md')
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('parsePlan', () => {
  it('reads checkbox lines as topics and leaves prose alone', () => {
    const plan = parsePlan('# План\n\nПрозовий контекст.\n\n- [ ] Перша\n- [x] Друга\n')
    expect(plan.topics).toEqual([
      { line: 4, text: 'Перша', done: false },
      { line: 5, text: 'Друга', done: true },
    ])
    expect(plan.raw).toContain('Прозовий контекст.')
  })

  it('ignores plain bullets and empty checkboxes', () => {
    const plan = parsePlan('- звичайний пункт\n- [ ] \n* [ ] зірочка теж пункт\n')
    expect(plan.topics).toEqual([{ line: 2, text: 'зірочка теж пункт', done: false }])
  })

  it('treats an uppercase X as done', () => {
    expect(parsePlan('- [X] Готова').topics[0]?.done).toBe(true)
  })
})

describe('pendingTopics', () => {
  it('keeps only what is still open', () => {
    const plan = parsePlan('- [ ] A\n- [x] B\n- [ ] C\n')
    expect(pendingTopics(plan).map((topic) => topic.text)).toEqual(['A', 'C'])
  })
})

describe('readPlan', () => {
  it('answers with an empty plan when the file does not exist', () => {
    expect(readPlan(config)).toEqual({ raw: '', topics: [] })
  })
})

describe('writePlan', () => {
  it('round-trips the text it was given', () => {
    const plan = writePlan(config, '## Теми\n\n- [ ] Тема')
    expect(plan.topics).toHaveLength(1)
    expect(readFileSync(config.content.planFile, 'utf8')).toBe('## Теми\n\n- [ ] Тема\n')
  })

  it('falls back to a template rather than writing an empty file', () => {
    expect(writePlan(config, '   ').topics.length).toBeGreaterThan(0)
  })
})

describe('markTopicDone', () => {
  beforeEach(() => {
    writeFileSync(config.content.planFile, '- [ ] Перша\n- [ ] Друга\n')
  })

  it('ticks the line it was pointed at and leaves the rest', () => {
    expect(markTopicDone(config, 1)).toBe(true)
    expect(readFileSync(config.content.planFile, 'utf8')).toBe('- [ ] Перша\n- [x] Друга\n')
  })

  it('does nothing for a line that is already done or is not a topic', () => {
    markTopicDone(config, 0)
    expect(markTopicDone(config, 0)).toBe(false)
    expect(markTopicDone(config, 99)).toBe(false)
  })

  // Two topics can legitimately read the same; matching on text would tick both.
  it('ticks only one of two identical topics', () => {
    writeFileSync(config.content.planFile, '- [ ] Однакова\n- [ ] Однакова\n')
    markTopicDone(config, 0)
    expect(readFileSync(config.content.planFile, 'utf8')).toBe('- [x] Однакова\n- [ ] Однакова\n')
  })
})
