import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { AgentConfig } from './config.ts'

/**
 * A single line of the plan that names something to write about.
 *
 * `- [ ] тема` is still open, `- [x] тема` has already been turned into a post.
 * Everything else in the file is free prose — direction for the month, notes,
 * whatever — and goes to the model as context untouched.
 */
export interface PlanTopic {
  /** Zero-based line index in the file; used to rewrite the checkbox in place. */
  line: number
  text: string
  done: boolean
}

export interface ContentPlan {
  /** The file as written, so the dashboard round-trips it without loss. */
  raw: string
  topics: PlanTopic[]
}

const TOPIC = /^\s*[-*]\s+\[( |x|X)\]\s+(.*)$/

const TEMPLATE = `# Контент-план

Вільний текст тут — напрямок на найближчі тижні, що зараз важливо сказати,
чого не чіпати. Усе це йде в модель як контекст.

## Теми

- [ ] Перша тема
`

export function parsePlan(raw: string): ContentPlan {
  const topics: PlanTopic[] = []
  raw.split('\n').forEach((line, index) => {
    const match = TOPIC.exec(line)
    if (!match) return
    const text = (match[2] ?? '').trim()
    if (text) topics.push({ line: index, text, done: match[1] !== ' ' })
  })
  return { raw, topics }
}

export function readPlan(config: AgentConfig): ContentPlan {
  const path = config.content.planFile
  if (!existsSync(path)) return parsePlan('')
  return parsePlan(readFileSync(path, 'utf8'))
}

export function writePlan(config: AgentConfig, raw: string): ContentPlan {
  const path = config.content.planFile
  mkdirSync(dirname(path), { recursive: true })
  const body = raw.trim() ? `${raw.trimEnd()}\n` : TEMPLATE
  writeFileSync(path, body)
  return parsePlan(body)
}

export function pendingTopics(plan: ContentPlan): PlanTopic[] {
  return plan.topics.filter((topic) => !topic.done)
}

/**
 * Ticks a topic off once a draft written from it reaches the queue.
 *
 * Matched on the line index rather than the text: two topics can legitimately
 * read the same, and rewriting both would silently lose one.
 */
export function markTopicDone(config: AgentConfig, line: number): boolean {
  const plan = readPlan(config)
  const topic = plan.topics.find((candidate) => candidate.line === line && !candidate.done)
  if (!topic) return false

  const lines = plan.raw.split('\n')
  const current = lines[line]
  if (current === undefined) return false
  lines[line] = current.replace('[ ]', '[x]')
  writeFileSync(config.content.planFile, lines.join('\n'))
  return true
}
