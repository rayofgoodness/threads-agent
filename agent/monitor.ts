import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { ThreadsApiError, ThreadsClient } from '../src/threads/index.ts'
import type { AgentConfig } from './config.ts'

export type SignalKind = 'reply' | 'mention' | 'keyword'

export interface Signal {
  kind: SignalKind
  id: string
  username?: string
  text: string
  permalink?: string
  timestamp?: string
  /** Which watch term surfaced it, for keyword hits. */
  matched?: string
}

export interface MonitorReport {
  signals: Signal[]
  /** Channels that could not be read, with the reason. Empty when all worked. */
  unavailable: { source: SignalKind; reason: string }[]
  checkedAt: string
}

const STATE_FILE = 'content/monitor-state.json'

interface MonitorState {
  seen: string[]
  lastRun?: string
}

function loadState(path = STATE_FILE): MonitorState {
  if (!existsSync(path)) return { seen: [] }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<MonitorState>
    return { seen: parsed.seen ?? [], lastRun: parsed.lastRun }
  } catch {
    return { seen: [] }
  }
}

function saveState(state: MonitorState, path = STATE_FILE) {
  mkdirSync(dirname(path), { recursive: true })
  // Keep the tail only — the list is a dedupe guard, not an archive.
  const seen = state.seen.slice(-500)
  writeFileSync(path, JSON.stringify({ ...state, seen }, null, 2) + '\n')
}

function describe(error: unknown): string {
  if (!(error instanceof ThreadsApiError)) return String(error)
  if (error.code === 10) {
    // Reads like an access-level verdict and often is not: the same code comes
    // back when the permission is simply absent from the use case, which is a
    // checkbox in the App Dashboard rather than a review.
    return 'застосунок не має дозволу — звірити Permissions and features у Use Case'
  }
  return error.message
}

export interface MonitorOptions {
  client?: ThreadsClient
  /** Single keywords; multi-word terms match nothing in the Threads API. */
  keywords?: string[]
  /**
   * Whether to run the keyword channel. Off is a decision, not a failure: the
   * channel is skipped silently and reports nothing at all.
   */
  keywordSearch?: boolean
  /** Report everything, not just what has not been seen before. */
  all?: boolean
  /** How many recent posts to read replies from. One API call per post. */
  postsToScan?: number
  statePath?: string
}

/**
 * Collects inbound signals: replies to the account, mentions of it, and posts
 * matching the watched keywords.
 *
 * Channels fail independently — one blocked source must not hide the others.
 * A channel turned off in the config is a third state: not read, not reported,
 * and absent from `unavailable`, which carries breakage and not choices.
 */
export async function collectSignals(
  config: AgentConfig,
  options: MonitorOptions = {},
): Promise<MonitorReport> {
  const client = options.client ?? ThreadsClient.fromEnv()
  const statePath = options.statePath ?? STATE_FILE
  const state = loadState(statePath)
  const seen = new Set(state.seen)

  const signals: Signal[] = []
  const unavailable: MonitorReport['unavailable'] = []

  // `/me/replies` returns replies *written by* the account, which is outbound
  // noise. Inbound means walking our own posts and reading each thread.
  try {
    const posts = await client.listPosts({ limit: options.postsToScan ?? 15 })
    for (const post of posts.data) {
      if (!post.has_replies) continue
      const replies = await client.listReplies(post.id, { limit: 25 })
      for (const reply of replies.data) {
        if (reply.username === config.account) continue
        signals.push({
          kind: 'reply',
          id: reply.id,
          username: reply.username,
          text: reply.text ?? '',
          permalink: reply.permalink,
          timestamp: reply.timestamp,
          matched: post.id,
        })
      }
    }
  } catch (error) {
    unavailable.push({ source: 'reply', reason: describe(error) })
  }

  try {
    const mentions = await client.listMentions({ limit: 25 })
    for (const mention of mentions.data) {
      signals.push({
        kind: 'mention',
        id: mention.id,
        username: mention.username,
        text: mention.text ?? '',
        permalink: mention.permalink,
        timestamp: mention.timestamp,
      })
    }
  } catch (error) {
    unavailable.push({ source: 'mention', reason: describe(error) })
  }

  // `?? true` keeps a config written before this flag existed behaving as it
  // did. Silence here is deliberate: an off channel is not an unavailable one.
  const keywords = (options.keywordSearch ?? true) ? (options.keywords ?? []) : []
  for (const keyword of keywords) {
    try {
      const hits = await client.keywordSearch(keyword, { type: 'RECENT', limit: 15 })
      for (const hit of hits.data) {
        // Our own posts always match our own keywords; that is noise, not signal.
        if (hit.username === config.account) continue
        signals.push({
          kind: 'keyword',
          id: hit.id,
          username: hit.username,
          text: hit.text ?? '',
          permalink: hit.permalink,
          timestamp: hit.timestamp,
          matched: keyword,
        })
      }
    } catch (error) {
      unavailable.push({ source: 'keyword', reason: `«${keyword}»: ${describe(error)}` })
    }
  }

  const fresh = options.all ? signals : signals.filter((signal) => !seen.has(signal.id))
  const checkedAt = new Date().toISOString()

  saveState({ seen: [...state.seen, ...signals.map((signal) => signal.id)], lastRun: checkedAt }, statePath)

  fresh.sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
  return { signals: fresh, unavailable, checkedAt }
}
