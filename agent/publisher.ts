import { ThreadsApiError, ThreadsClient } from '../src/threads/index.ts'
import type { AgentConfig } from './config.ts'
import { dueItems, listPublished, settleItem, type QueueItem } from './queue.ts'

export interface GuardrailViolation {
  rule: 'maxLength' | 'minLength' | 'bannedPhrase' | 'empty'
  detail: string
}

/** Everything checked before a post can leave the queue. */
export function checkGuardrails(config: AgentConfig, text: string): GuardrailViolation[] {
  const violations: GuardrailViolation[] = []
  const trimmed = text.trim()

  if (!trimmed) violations.push({ rule: 'empty', detail: 'текст порожній' })
  if (trimmed.length > config.guardrails.maxLength) {
    violations.push({
      rule: 'maxLength',
      detail: `${trimmed.length} символів, дозволено ${config.guardrails.maxLength}`,
    })
  }
  if (trimmed && trimmed.length < config.guardrails.minLength) {
    violations.push({
      rule: 'minLength',
      detail: `${trimmed.length} символів, мінімум ${config.guardrails.minLength}`,
    })
  }
  for (const phrase of config.guardrails.bannedPhrases) {
    if (phrase && trimmed.toLowerCase().includes(phrase.toLowerCase())) {
      violations.push({ rule: 'bannedPhrase', detail: `заборонена фраза: «${phrase}»` })
    }
  }
  return violations
}

/** How many items were already published in the current calendar day. */
export function publishedToday(config: AgentConfig, now = new Date()): number {
  const today = now.toISOString().slice(0, 10)
  return listPublished(config).filter((item) => item.publishedAt?.startsWith(today)).length
}

export interface RunResult {
  item: QueueItem
  action: 'published' | 'blocked' | 'failed' | 'skipped'
  detail?: string
  postId?: string
  permalink?: string
}

export interface RunOptions {
  /** Without this nothing is published — the run only reports what it would do. */
  commit?: boolean
  now?: Date
  client?: ThreadsClient
}

/**
 * Publishes everything that is due, within the daily cap.
 *
 * Dry by default: publishing is irreversible from the reader's side even when
 * the post is deleted seconds later, so the caller has to ask for it.
 */
export async function runDue(config: AgentConfig, options: RunOptions = {}): Promise<RunResult[]> {
  const now = options.now ?? new Date()
  const due = dueItems(config, now)
  if (due.length === 0) return []

  const results: RunResult[] = []
  let budget = Math.max(0, config.schedule.maxPerDay - publishedToday(config, now))
  const client = options.commit ? (options.client ?? ThreadsClient.fromEnv()) : undefined

  for (const item of due) {
    const violations = checkGuardrails(config, item.text)
    if (violations.length > 0) {
      results.push({
        item,
        action: 'blocked',
        detail: violations.map((violation) => violation.detail).join('; '),
      })
      continue
    }

    if (budget <= 0) {
      results.push({
        item,
        action: 'skipped',
        detail: `денний ліміт ${config.schedule.maxPerDay} вичерпано`,
      })
      continue
    }

    if (!client) {
      results.push({ item, action: 'skipped', detail: 'пробний запуск, публікації не було' })
      budget -= 1
      continue
    }

    try {
      const post = await client.publishText(item.text)
      settleItem(config, item, {
        status: 'published',
        postId: post.id,
        permalink: post.permalink,
      })
      budget -= 1
      results.push({ item, action: 'published', postId: post.id, permalink: post.permalink })
    } catch (cause) {
      const detail = cause instanceof ThreadsApiError ? cause.message : String(cause)
      settleItem(config, item, { status: 'failed', note: detail })
      results.push({ item, action: 'failed', detail })
    }
  }

  return results
}
