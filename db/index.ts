/**
 * Postgres for generation history and post analytics.
 *
 * Optional by design: without `DATABASE_URL` every function here is a no-op
 * and the agent keeps working out of `content/`. The database records what
 * git cannot — what the model was asked, what it cost, and how a published
 * post performed over the following days.
 */
import { Pool } from 'pg'
import type { GenerationResult } from '../agent/generator.ts'

export interface GenerationRow {
  id: number
  createdAt: string
  model: string
  brief: string | null
  inputTokens: number
  outputTokens: number
  cachedTokens: number
  drafts: {
    position: number
    topic: string
    planLine: number | null
    text: string
    note: string | null
    status: string
    queueFile: string | null
  }[]
}

export interface MetricSample {
  postId: string
  capturedAt: string
  views: number | null
  likes: number | null
  replies: number | null
  reposts: number | null
  quotes: number | null
}

let pool: Pool | undefined

export function isDbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

function getPool(): Pool | undefined {
  if (!isDbEnabled()) return undefined
  // A single lazy pool: the CLI opens it for one command, the server keeps it
  // for its lifetime, and neither should pay for it when the URL is unset.
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 4 })
  return pool
}

export async function closeDb(): Promise<void> {
  if (!pool) return
  const closing = pool
  pool = undefined
  await closing.end()
}

/** Applies `db/schema.sql`. Idempotent — every statement is `IF NOT EXISTS`. */
export async function migrate(sql: string): Promise<boolean> {
  const active = getPool()
  if (!active) return false
  await active.query(sql)
  return true
}

/**
 * Best-effort wrapper for the bookkeeping calls.
 *
 * The history is worth less than the thing being recorded: a stopped container
 * must not lose a generation that already cost an Anthropic call, or refuse a
 * draft that is already on disk. Failures are reported, not raised.
 */
export async function tryRecord<T>(what: string, run: () => Promise<T>): Promise<T | undefined> {
  try {
    return await run()
  } catch (cause) {
    console.error(`[db] ${what} не записано: ${cause instanceof Error ? cause.message : String(cause)}`)
    return undefined
  }
}

/**
 * Stores one generation and its drafts.
 *
 * Returns the generation id, or undefined when no database is configured —
 * callers pass that straight back into `markDraftQueued`, which then does
 * nothing too, so the no-database path needs no branching upstream.
 */
export async function recordGeneration(result: GenerationResult): Promise<number | undefined> {
  const active = getPool()
  if (!active) return undefined

  const client = await active.connect()
  try {
    await client.query('BEGIN')
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO generations (model, brief, input_tokens, output_tokens, cached_tokens)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [result.model, result.brief ?? null, result.usage.input, result.usage.output, result.usage.cached],
    )
    const id = Number(inserted.rows[0]?.id)

    for (const [position, draft] of result.drafts.entries()) {
      await client.query(
        `INSERT INTO drafts (generation_id, position, topic, plan_line, body, note, violations)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          id,
          position,
          draft.topic,
          draft.planLine ?? null,
          draft.text,
          draft.note,
          JSON.stringify(draft.violations),
        ],
      )
    }
    await client.query('COMMIT')
    return id
  } catch (cause) {
    await client.query('ROLLBACK')
    throw cause
  } finally {
    client.release()
  }
}

/** Marks the draft at `position` as having reached the queue as `file`. */
export async function markDraftQueued(
  generationId: number | undefined,
  position: number,
  file: string,
): Promise<void> {
  const active = getPool()
  if (!active || generationId === undefined) return
  await active.query(
    `UPDATE drafts SET status = 'queued', queue_file = $3
     WHERE generation_id = $1 AND position = $2`,
    [generationId, position, file],
  )
}

export async function listGenerations(limit = 20): Promise<GenerationRow[]> {
  const active = getPool()
  if (!active) return []

  const { rows } = await active.query<{
    id: string
    created_at: Date
    model: string
    brief: string | null
    input_tokens: number
    output_tokens: number
    cached_tokens: number
    drafts: GenerationRow['drafts'] | null
  }>(
    `SELECT g.id, g.created_at, g.model, g.brief, g.input_tokens, g.output_tokens, g.cached_tokens,
            json_agg(json_build_object(
              'position', d.position, 'topic', d.topic, 'planLine', d.plan_line,
              'text', d.body, 'note', d.note, 'status', d.status, 'queueFile', d.queue_file
            ) ORDER BY d.position) FILTER (WHERE d.id IS NOT NULL) AS drafts
     FROM generations g
     LEFT JOIN drafts d ON d.generation_id = g.id
     GROUP BY g.id
     ORDER BY g.created_at DESC
     LIMIT $1`,
    [limit],
  )

  return rows.map((row) => ({
    id: Number(row.id),
    createdAt: row.created_at.toISOString(),
    model: row.model,
    brief: row.brief,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cachedTokens: row.cached_tokens,
    drafts: row.drafts ?? [],
  }))
}

/** Appends a reading for one post. Repeated calls build the curve. */
export async function recordMetrics(
  postId: string,
  values: Partial<Omit<MetricSample, 'postId' | 'capturedAt'>>,
): Promise<boolean> {
  const active = getPool()
  if (!active) return false
  await active.query(
    `INSERT INTO post_metrics (post_id, views, likes, replies, reposts, quotes)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      postId,
      values.views ?? null,
      values.likes ?? null,
      values.replies ?? null,
      values.reposts ?? null,
      values.quotes ?? null,
    ],
  )
  return true
}

export async function metricsHistory(postId: string, limit = 100): Promise<MetricSample[]> {
  const active = getPool()
  if (!active) return []
  const { rows } = await active.query<{
    post_id: string
    captured_at: Date
    views: number | null
    likes: number | null
    replies: number | null
    reposts: number | null
    quotes: number | null
  }>(
    `SELECT * FROM post_metrics WHERE post_id = $1 ORDER BY captured_at DESC LIMIT $2`,
    [postId, limit],
  )
  return rows.map((row) => ({
    postId: row.post_id,
    capturedAt: row.captured_at.toISOString(),
    views: row.views,
    likes: row.likes,
    replies: row.replies,
    reposts: row.reposts,
    quotes: row.quotes,
  }))
}
