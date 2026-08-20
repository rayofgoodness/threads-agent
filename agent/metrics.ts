/**
 * Periodic metric capture.
 *
 * `post_metrics` is one row per reading, so a post's curve only exists if
 * somebody took the readings. Until now the only thing that did was a manual
 * `POST /api/posts/:id/metrics`, which meant the table held whatever anyone
 * happened to click — a shape, not a history.
 *
 * This sweep takes them on a schedule instead: often while a post is still
 * moving, rarely once it has settled, never after it has stopped. The cadence
 * is the point. Reading every post every quarter of an hour would burn the
 * account's rate limit to record a flat line.
 */
import type { ThreadsClient } from '../src/threads/client.ts'
import type { ThreadsPost } from '../src/threads/types.ts'
import { lastCaptures, recordMetrics, isDbEnabled } from '../db/index.ts'

/** Read this often while a post is younger than `untilHours`. Ordered. */
export interface CadenceStep {
  untilHours: number
  everyHours: number
}

/**
 * Dense for two days, then daily to the end of the first week.
 *
 * A Threads post does almost all of its work in the first 48 hours; after a
 * week the number has stopped being news and the row would only cost quota.
 */
export const DEFAULT_CADENCE: CadenceStep[] = [
  { untilHours: 48, everyHours: 3 },
  { untilHours: 24 * 7, everyHours: 24 },
]

export interface CollectOptions {
  client: Pick<ThreadsClient, 'listPosts' | 'postInsights'>
  /** Injected in tests; the sweep is entirely a function of the clock. */
  now?: Date
  cadence?: CadenceStep[]
  /** How far back to look for posts worth reading. */
  limit?: number
  readLastCaptures?: (postIds: string[]) => Promise<Map<string, string>>
  write?: (postId: string, values: MetricValues) => Promise<boolean>
}

export interface MetricValues {
  views: number | null
  likes: number | null
  replies: number | null
  reposts: number | null
  quotes: number | null
}

export interface CollectReport {
  at: string
  /** False without `DATABASE_URL` — nothing was read, and nothing was lost. */
  enabled: boolean
  considered: number
  captured: string[]
  /** Not due yet, or past the window where a reading would say anything. */
  skipped: number
  failed: { postId: string; reason: string }[]
}

const HOUR_MS = 3_600_000

/**
 * How often this post should be read right now, or `undefined` once it has
 * aged out of every step.
 */
export function intervalFor(ageHours: number, cadence = DEFAULT_CADENCE): number | undefined {
  for (const step of cadence) if (ageHours < step.untilHours) return step.everyHours
  return undefined
}

export function isDue(
  timestamp: string | undefined,
  lastCaptureAt: string | undefined,
  now: Date,
  cadence = DEFAULT_CADENCE,
): boolean {
  // A post with no timestamp has no age, so no cadence applies to it. Reading
  // it on every sweep forever is the failure mode worth avoiding here.
  if (!timestamp) return false
  const published = Date.parse(timestamp)
  if (Number.isNaN(published)) return false

  const ageHours = (now.getTime() - published) / HOUR_MS
  if (ageHours < 0) return false

  const every = intervalFor(ageHours, cadence)
  if (every === undefined) return false

  // Never read means always due, as long as the post is still inside a step.
  if (!lastCaptureAt) return true
  const last = Date.parse(lastCaptureAt)
  if (Number.isNaN(last)) return true
  return now.getTime() - last >= every * HOUR_MS
}

/** Threads answers with a single total or a series, depending on the metric. */
function valueOf(insights: { name: string; total_value?: { value: number }; values?: { value: number }[] }[], name: string) {
  const metric = insights.find((candidate) => candidate.name === name)
  return metric?.total_value?.value ?? metric?.values?.[0]?.value ?? null
}

/**
 * Read every post that is due and store one row per reading.
 *
 * Each post fails on its own: one deleted or restricted post must not cost the
 * sweep the readings it already has in hand.
 */
export async function collectMetrics(options: CollectOptions): Promise<CollectReport> {
  const {
    client,
    now = new Date(),
    cadence = DEFAULT_CADENCE,
    limit = 25,
    readLastCaptures = lastCaptures,
    write = (postId: string, values: MetricValues) => recordMetrics(postId, values),
  } = options

  const report: CollectReport = {
    at: now.toISOString(),
    enabled: isDbEnabled(),
    considered: 0,
    captured: [],
    skipped: 0,
    failed: [],
  }

  // Without a database there is nowhere to put a reading, and taking one
  // anyway would spend quota to throw the answer away.
  if (!report.enabled) return report

  let posts: ThreadsPost[]
  try {
    const page = await client.listPosts({ limit })
    posts = page.data ?? []
  } catch (cause) {
    report.failed.push({ postId: '*', reason: describe(cause) })
    return report
  }

  report.considered = posts.length
  const seen = await readLastCaptures(posts.map((post) => post.id))

  for (const post of posts) {
    if (!isDue(post.timestamp, seen.get(post.id), now, cadence)) {
      report.skipped += 1
      continue
    }
    try {
      const insights = await client.postInsights(post.id)
      await write(post.id, {
        views: valueOf(insights, 'views'),
        likes: valueOf(insights, 'likes'),
        replies: valueOf(insights, 'replies'),
        reposts: valueOf(insights, 'reposts'),
        quotes: valueOf(insights, 'quotes'),
      })
      report.captured.push(post.id)
    } catch (cause) {
      report.failed.push({ postId: post.id, reason: describe(cause) })
    }
  }

  return report
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
