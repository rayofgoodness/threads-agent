import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultConfig, type AgentConfig } from './config.ts'
import { buildSystemPrompt, buildUserPrompt, generateDrafts, type CreateMessage } from './generator.ts'
import { parsePlan } from './plan.ts'

let root: string
let config: AgentConfig

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'generator-'))
  config = defaultConfig()
  config.content.queueDir = join(root, 'queue')
  config.content.publishedDir = join(root, 'published')
  config.content.knowledgeDir = join(root, 'knowledge')
  config.content.planFile = join(root, 'plan.md')
  config.voice = {
    persona: 'Засновник Casy',
    audience: 'Майстри манікюру',
    language: 'українська',
    tone: ['прямо'],
    rules: ['Одна думка на пост'],
    avoid: ['хештеги'],
    emoji: 'none',
    samples: ['Клієнтка написала о 23:40.'],
  }
  config.guardrails = { maxLength: 120, minLength: 20, bannedPhrases: ['Не пропустіть'] }
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

/** A stand-in for the Anthropic call: the schema is enforced by the API, not here. */
function fakeModel(drafts: unknown[]): CreateMessage {
  return vi.fn(async () => ({
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5',
    content: [{ type: 'text', text: JSON.stringify({ drafts }), citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 20 },
  })) as unknown as CreateMessage
}

describe('buildSystemPrompt', () => {
  it('carries the voice, the guardrails and the samples', () => {
    const prompt = buildSystemPrompt(config, [])
    expect(prompt).toContain('Засновник Casy')
    expect(prompt).toContain('Майстри манікюру')
    expect(prompt).toContain('Одна думка на пост')
    expect(prompt).toContain('хештеги')
    expect(prompt).toContain('Емодзі не використовувати')
    expect(prompt).toContain('від 20 до 120 символів')
    expect(prompt).toContain('Не пропустіть')
    expect(prompt).toContain('Клієнтка написала о 23:40.')
  })

  // Without material the model has nothing to be specific from, and inventing
  // a case study is worse than writing a vaguer post.
  it('warns the model off invented specifics when there is no knowledge', () => {
    expect(buildSystemPrompt(config, [])).toContain('жодних цифр')
  })

  it('includes knowledge files under their own names', () => {
    const prompt = buildSystemPrompt(config, [{ name: 'posts/one.md', text: 'реальний пост' }])
    expect(prompt).toContain('posts/one.md')
    expect(prompt).toContain('реальний пост')
    expect(prompt).not.toContain('жодних цифр')
  })
})

describe('buildUserPrompt', () => {
  const plan = parsePlan('# План\n\n- [ ] Відкрита\n- [x] Закрита\n')

  it('offers the open topics with their line numbers and hides the closed ones', () => {
    const prompt = buildUserPrompt(config, plan, [], {})
    expect(prompt).toContain('2: Відкрита')
    expect(prompt).not.toContain('3: Закрита')
  })

  it('passes the whole plan as context, not just the topics', () => {
    expect(buildUserPrompt(config, plan, [], {})).toContain('# План')
  })

  it('asks for the configured number of drafts unless told otherwise', () => {
    expect(buildUserPrompt(config, plan, [], {})).toContain('Напиши 3 різних')
    expect(buildUserPrompt(config, plan, [], { count: 1 })).toContain('Напиши 1 різних')
  })

  it('lists what has already been published as material not to repeat', () => {
    expect(buildUserPrompt(config, plan, ['старий пост'], {})).toContain('старий пост')
  })

  it('invites its own topics only when the plan is empty and no brief was given', () => {
    const empty = parsePlan('')
    expect(buildUserPrompt(config, empty, [], {})).toContain('запропонуй свої')
    expect(buildUserPrompt(config, empty, [], { brief: 'про ціни' })).not.toContain('запропонуй свої')
  })
})

describe('generateDrafts', () => {
  const draft = (over: Record<string, unknown> = {}) => ({
    topic: 'Тема',
    planLine: -1,
    text: 'Текст поста, достатньо довгий щоб пройти обмеження.',
    note: 'кут',
    ...over,
  })

  it('returns the drafts with the usage of the call', async () => {
    const result = await generateDrafts(config, { createMessage: fakeModel([draft()]) })
    expect(result.model).toBe('claude-opus-5')
    expect(result.usage).toEqual({ input: 100, output: 50, cached: 20 })
    expect(result.drafts[0]?.topic).toBe('Тема')
  })

  it('drops the plan line when the model says the topic was improvised', async () => {
    const result = await generateDrafts(config, { createMessage: fakeModel([draft()]) })
    expect(result.drafts[0]?.planLine).toBeUndefined()
  })

  it('keeps a plan line the model did use', async () => {
    const result = await generateDrafts(config, { createMessage: fakeModel([draft({ planLine: 4 })]) })
    expect(result.drafts[0]?.planLine).toBe(4)
  })

  // The same guardrails the publisher applies, so a too-long draft is visible
  // before anyone queues it rather than at publish time.
  it('reports guardrail violations instead of dropping the draft', async () => {
    const long = draft({ text: 'x'.repeat(200) })
    const result = await generateDrafts(config, { createMessage: fakeModel([long]) })
    expect(result.drafts[0]?.violations.map((violation) => violation.rule)).toEqual(['maxLength'])
  })

  it('reads knowledge files into the system prompt it sends', async () => {
    mkdirSync(join(config.content.knowledgeDir, 'posts'), { recursive: true })
    writeFileSync(join(config.content.knowledgeDir, 'posts', 'one.md'), 'справжній пост')
    const createMessage = fakeModel([draft()])

    await generateDrafts(config, { createMessage })

    const params = vi.mocked(createMessage).mock.calls[0]?.[0]
    expect(JSON.stringify(params?.system)).toContain('справжній пост')
  })

  it('refuses to guess when the model declined', async () => {
    const refusing = vi.fn(async () => ({
      content: [],
      model: 'claude-opus-5',
      stop_reason: 'refusal',
      usage: { input_tokens: 1, output_tokens: 0 },
    })) as unknown as CreateMessage

    await expect(generateDrafts(config, { createMessage: refusing })).rejects.toThrow('відмовилася')
  })
})
