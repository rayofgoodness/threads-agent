/**
 * JSON API in front of the Threads client.
 *
 *   node server/index.ts        (or: npm run server)
 *
 * The access token lives here and never reaches the browser — Vite proxies
 * `/api` to this process in development, so the Vue app talks to same-origin
 * routes and Threads never sees a cross-origin request.
 */
import { createServer } from 'node:http'
import { join } from 'node:path'
import { ThreadsClient } from '../src/threads/index.ts'
import type { AccountMetric, PostMetric, ReplyControl } from '../src/threads/types.ts'
import { loadConfig, saveVoice, type VoiceConfig } from '../agent/config.ts'
import { collectSignals } from '../agent/monitor.ts'
import { generateDrafts } from '../agent/generator.ts'
import { markTopicDone, readPlan, writePlan } from '../agent/plan.ts'
import { nextSlots } from '../agent/schedule.ts'
import {
  addDraft,
  addItem,
  listDrafts,
  listQueue,
  removeDraft,
  scheduleDraft,
  updateDraft,
} from '../agent/queue.ts'
import { checkGuardrails } from '../agent/publisher.ts'
import {
  isDbEnabled,
  listGenerations,
  markDraftQueued,
  metricsHistory,
  recordGeneration,
  recordMetrics,
  tryRecord,
} from '../db/index.ts'
import { checkAuth, resolveBinding } from './auth.ts'
import { createHandler, HttpError, Router, send } from './http.ts'
import { serveStatic } from './static.ts'

// `.env` is not exported into the shell automatically; load it if the token is absent.
if (!process.env.THREADS_ACCESS_TOKEN) {
  try {
    process.loadEnvFile('.env')
  } catch {
    // No .env here — fall through to the check below.
  }
}

const secret = process.env.THREADS_AGENT_TOKEN
const { host, port } = resolveBinding(process.env, secret)
const client = ThreadsClient.fromEnv()
// Boot-time config, used where nothing edits it (the monitor's keywords).
// Routes that touch the voice, the plan or the queue call `loadConfig()` per
// request instead — the dashboard writes those back, and a config captured
// here would keep serving the old values until a restart.
const config = loadConfig()
const distRoot = join(process.cwd(), 'dist')

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `"${key}" is required and must be a non-empty string`)
  }
  return value
}

function optionalString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function splitMetrics<T extends string>(query: URLSearchParams): T[] | undefined {
  const raw = query.get('metric')
  return raw ? (raw.split(',') as T[]) : undefined
}

const router = new Router()

router.get('/api/health', async () => ({ ok: true, port }))

router.get('/api/token', async () => {
  const info = await client.inspectToken()
  return {
    valid: info.is_valid,
    expiresAt: info.expires_at ? new Date(info.expires_at * 1000).toISOString() : null,
    scopes: info.scopes ?? [],
    canPublish: client.hasScope(info, 'threads_content_publish'),
    canDelete: client.hasScope(info, 'threads_delete'),
  }
})

router.get('/api/profile', async () => client.getProfile())

router.get('/api/limits', async () => client.publishingLimit())

router.get('/api/posts', async ({ query }) =>
  client.listPosts({
    limit: query.has('limit') ? Number(query.get('limit')) : undefined,
    after: query.get('after') ?? undefined,
    since: query.get('since') ?? undefined,
    until: query.get('until') ?? undefined,
  }),
)

router.get('/api/posts/:id', async ({ params }) => client.getPost(params.id!))

router.get('/api/posts/:id/insights', async ({ params, query }) =>
  client.postInsights(params.id!, splitMetrics<PostMetric>(query)),
)

router.get('/api/posts/:id/replies', async ({ params, query }) =>
  client.listReplies(params.id!, {
    limit: query.has('limit') ? Number(query.get('limit')) : undefined,
    after: query.get('after') ?? undefined,
  }),
)

router.get('/api/insights', async ({ query }) =>
  client.accountInsights(splitMetrics<AccountMetric>(query)),
)

router.get('/api/replies', async ({ query }) =>
  client.listAllReplies({ limit: query.has('limit') ? Number(query.get('limit')) : undefined }),
)

/**
 * Inbound signals. Reads replies across recent posts, so it costs one API call
 * per post — the UI asks for it on demand rather than on load.
 */
router.get('/api/signals', async ({ query }) =>
  collectSignals(config, {
    client,
    keywords: config.monitor.keywords,
    all: query.get('all') === '1',
  }),
)

/** Voice: the tone-of-voice block of `agent.config.json`. */
router.get('/api/voice', async () => loadConfig().voice)

router.put('/api/voice', async ({ body }) => saveVoice((await body()) as unknown as VoiceConfig))

/** Content plan: one markdown file, round-tripped as text. */
router.get('/api/plan', async () => readPlan(loadConfig()))

router.put('/api/plan', async ({ body }) => {
  const payload = await body()
  const raw = payload.raw
  if (typeof raw !== 'string') throw new HttpError(400, '"raw" must be a string')
  return writePlan(loadConfig(), raw)
})

/** The queue as the dashboard sees it — drafts, not published posts. */
router.get('/api/queue', async () => listQueue(loadConfig()))

router.post('/api/queue', async ({ body }) => {
  const payload = await body()
  const current = loadConfig()
  const text = requireString(payload, 'text')
  const at = optionalString(payload, 'publishAt') ?? nextSlots(current, 1)[0]
  const item = addItem(current, text, at)

  // Ticking the plan line and marking the draft queued are bookkeeping: a
  // failure there must not undo an item that is already on disk.
  const planLine = typeof payload.planLine === 'number' ? payload.planLine : undefined
  if (planLine !== undefined) markTopicDone(current, planLine)
  const generationId = typeof payload.generationId === 'number' ? payload.generationId : undefined
  const position = typeof payload.position === 'number' ? payload.position : undefined
  if (generationId !== undefined && position !== undefined) {
    await tryRecord('чернетку в черзі', () => markDraftQueued(generationId, position, item.file))
  }

  return { ...item, violations: checkGuardrails(current, text) }
})

/**
 * The draft shelf. Nothing here has a slot, so nothing here can publish —
 * `scheduleDraft` is the one door into the queue, and it is always a
 * deliberate act.
 */
router.get('/api/drafts', async () => listDrafts(loadConfig()))

router.post('/api/drafts', async ({ body }) => {
  const payload = await body()
  const current = loadConfig()
  const text = requireString(payload, 'text')
  const item = addDraft(current, text, optionalString(payload, 'topic'))

  // Same bookkeeping as queueing: the topic has been written up either way,
  // and a failure here must not undo a draft that is already on disk.
  const planLine = typeof payload.planLine === 'number' ? payload.planLine : undefined
  if (planLine !== undefined) markTopicDone(current, planLine)
  const generationId = typeof payload.generationId === 'number' ? payload.generationId : undefined
  const position = typeof payload.position === 'number' ? payload.position : undefined
  if (generationId !== undefined && position !== undefined) {
    await tryRecord('чернетку', () => markDraftQueued(generationId, position, item.file))
  }

  return { ...item, violations: checkGuardrails(current, text) }
})

router.put('/api/drafts/:file', async ({ params, body }) => {
  const payload = await body()
  const current = loadConfig()
  const text = requireString(payload, 'text')
  const item = updateDraft(current, params.file!, text)
  return { ...item, violations: checkGuardrails(current, text) }
})

router.delete('/api/drafts/:file', async ({ params }) => ({
  deleted: removeDraft(loadConfig(), params.file!),
}))

/** The draft leaves the shelf and takes a slot. */
router.post('/api/drafts/:file/schedule', async ({ params, body }) => {
  const payload = await body()
  const current = loadConfig()
  const at = optionalString(payload, 'publishAt') ?? nextSlots(current, 1)[0]
  return scheduleDraft(current, params.file!, at)
})

/**
 * Drafting. Costs an Anthropic call, so it is a POST and never runs on load —
 * and it writes nothing to the queue: the reviewer decides what is kept.
 */
router.post('/api/generate', async ({ body }) => {
  const payload = await body()
  const current = loadConfig()
  const result = await generateDrafts(current, {
    count: typeof payload.count === 'number' ? payload.count : undefined,
    brief: optionalString(payload, 'brief'),
  })
  const id = await tryRecord('генерацію', () => recordGeneration(result))
  return { ...result, id: id ?? null, slots: nextSlots(current, result.drafts.length) }
})

/** Generation history. Empty without a database — the feature is optional. */
router.get('/api/generations', async ({ query }) =>
  listGenerations(query.has('limit') ? Number(query.get('limit')) : undefined),
)

router.get('/api/db', async () => ({ enabled: isDbEnabled() }))

/** Analytics: one row per reading, so the numbers can be compared over time. */
router.get('/api/posts/:id/metrics', async ({ params }) => metricsHistory(params.id!))

router.post('/api/posts/:id/metrics', async ({ params }) => {
  const insights = await client.postInsights(params.id!)
  // Threads reports a metric either as a single `total_value` or as a series;
  // which one depends on the metric, so both are read.
  const value = (name: string) => {
    const metric = insights.find((candidate) => candidate.name === name)
    return metric?.total_value?.value ?? metric?.values?.[0]?.value ?? null
  }
  const stored = await recordMetrics(params.id!, {
    views: value('views'),
    likes: value('likes'),
    replies: value('replies'),
    reposts: value('reposts'),
    quotes: value('quotes'),
  })
  return { stored, insights }
})

/** Publishing and deleting are the only state-changing routes; both are explicit. */
router.post('/api/posts', async ({ body }) => {
  const payload = await body()
  const text = requireString(payload, 'text')
  return client.publishText(text, {
    replyControl: optionalString(payload, 'replyControl') as ReplyControl | undefined,
    linkAttachment: optionalString(payload, 'linkAttachment'),
  })
})

router.post('/api/posts/:id/replies', async ({ params, body }) => {
  const payload = await body()
  return client.reply(params.id!, requireString(payload, 'text'))
})

router.delete('/api/posts/:id', async ({ params }) => ({
  deleted: await client.deletePost(params.id!),
}))

const api = createHandler(router)

const server = createServer((request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname

  if (pathname.startsWith('/api/')) {
    if (!checkAuth(request, secret)) {
      return send(response, 401, { error: 'Потрібен Authorization: Bearer <THREADS_AGENT_TOKEN>' })
    }
    return void api(request, response)
  }

  // Anything outside /api is the dashboard, when it has been built.
  if (!serveStatic(distRoot, pathname, response)) {
    send(response, 404, { error: 'Дашборд не зібраний — виконай npm run build' })
  }
})

server.listen(port, host, () => {
  console.log(`[api] listening on http://${host}:${port}`)
  console.log(secret ? '[api] доступ за токеном' : '[api] без токена, лише loopback')
})
