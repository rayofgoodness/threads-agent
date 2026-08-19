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
import { ThreadsClient } from '../src/threads/index.ts'
import type { AccountMetric, PostMetric, ReplyControl } from '../src/threads/types.ts'
import { createHandler, HttpError, Router } from './http.ts'

// `.env` is not exported into the shell automatically; load it if the token is absent.
if (!process.env.THREADS_ACCESS_TOKEN) {
  try {
    process.loadEnvFile('.env')
  } catch {
    // No .env here — fall through to the check below.
  }
}

const PORT = Number(process.env.PORT ?? 8787)
const client = ThreadsClient.fromEnv()

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

router.get('/api/health', async () => ({ ok: true, port: PORT }))

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

const server = createServer(createHandler(router))

server.listen(PORT, () => {
  console.log(`[api] listening on http://localhost:${PORT}`)
})
