import { ThreadsApiError, type ThreadsErrorBody } from './errors.ts'
import type {
  AccountMetric,
  InsightMetric,
  MediaType,
  Paged,
  PostMetric,
  PublishOptions,
  PublishingLimit,
  ThreadsPost,
  ThreadsProfile,
  ThreadsReply,
  TokenInfo,
} from './types.ts'

const API_HOST = 'https://graph.threads.net'
const DEFAULT_VERSION = 'v1.0'

const DEFAULT_POST_FIELDS =
  'id,media_type,media_url,permalink,text,timestamp,shortcode,is_quote_post,has_replies'
const DEFAULT_REPLY_FIELDS =
  'id,text,username,timestamp,permalink,has_replies,hide_status,replied_to,is_reply'

export interface ThreadsClientOptions {
  accessToken: string
  /** Threads user id, or `me` (default) to resolve from the token. */
  userId?: string
  apiVersion?: string
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch
  /** Retries for transient upstream failures. Auth, permission and quota errors never retry. */
  maxRetries?: number
}

export interface ListOptions {
  fields?: string
  limit?: number
  /** ISO date or unix seconds. */
  since?: string | number
  until?: string | number
  after?: string
  before?: string
}

type Query = Record<string, string | number | undefined>

/**
 * Thin typed wrapper over the Threads Graph API.
 *
 * Server-side only: it carries a long-lived access token, and Threads sends no
 * CORS headers, so calling it from the Vue bundle would both leak the token and
 * fail. Keep it behind a Node script or a backend route.
 */
export class ThreadsClient {
  private readonly token: string
  private readonly userId: string
  private readonly version: string
  private readonly fetchImpl: typeof fetch
  private readonly maxRetries: number

  constructor(options: ThreadsClientOptions) {
    if (!options.accessToken) throw new Error('ThreadsClient requires an accessToken')
    this.token = options.accessToken
    this.userId = options.userId ?? 'me'
    this.version = options.apiVersion ?? DEFAULT_VERSION
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch
    this.maxRetries = options.maxRetries ?? 2
  }

  /**
   * Build a client from `THREADS_ACCESS_TOKEN` in the environment.
   *
   * `src/` is typed for the DOM, so `process` is reached through `globalThis`
   * rather than assumed — this constructor only makes sense under Node anyway.
   */
  static fromEnv(env: Record<string, string | undefined> = readProcessEnv()): ThreadsClient {
    const accessToken = env.THREADS_ACCESS_TOKEN
    if (!accessToken) {
      throw new Error('THREADS_ACCESS_TOKEN is not set — run `source .env` first')
    }
    return new ThreadsClient({ accessToken })
  }

  // ─── profile ──────────────────────────────────────────────────────────────

  getProfile(fields = 'id,username,name,threads_biography,threads_profile_picture_url') {
    return this.request<ThreadsProfile>('GET', `/${this.userId}`, { fields })
  }

  // ─── reading posts ────────────────────────────────────────────────────────

  listPosts(options: ListOptions = {}) {
    return this.request<Paged<ThreadsPost>>('GET', `/${this.userId}/threads`, {
      fields: options.fields ?? DEFAULT_POST_FIELDS,
      limit: options.limit,
      since: options.since,
      until: options.until,
      after: options.after,
      before: options.before,
    })
  }

  /** Walk the cursor pagination and yield every post, newest first. */
  async *iteratePosts(options: ListOptions = {}): AsyncGenerator<ThreadsPost> {
    let after = options.after
    for (;;) {
      const page = await this.listPosts({ ...options, after })
      for (const post of page.data) yield post
      after = page.paging?.cursors?.after
      if (!after || page.data.length === 0) return
    }
  }

  getPost(postId: string, fields = DEFAULT_POST_FIELDS) {
    return this.request<ThreadsPost>('GET', `/${postId}`, { fields })
  }

  // ─── publishing ───────────────────────────────────────────────────────────

  /**
   * Publish in one call: create the container, then publish it.
   *
   * TEXT is ready immediately. IMAGE, VIDEO and CAROUSEL are processed
   * asynchronously, so those wait for the container to report `FINISHED` —
   * publishing a container still `IN_PROGRESS` fails.
   */
  async publish(mediaType: MediaType, options: PublishOptions): Promise<ThreadsPost> {
    const creationId = await this.createContainer(mediaType, options)
    if (mediaType !== 'TEXT') await this.waitForContainer(creationId)
    const { id } = await this.publishContainer(creationId)
    return this.getPost(id)
  }

  /** Shorthand for the common case. */
  publishText(text: string, options: Omit<PublishOptions, 'text'> = {}) {
    return this.publish('TEXT', { ...options, text })
  }

  /** Post a reply to an existing post. */
  reply(replyToId: string, text: string, options: Omit<PublishOptions, 'text' | 'replyToId'> = {}) {
    return this.publish('TEXT', { ...options, text, replyToId })
  }

  /** Step one of publishing: returns the container (creation) id. */
  async createContainer(mediaType: MediaType, options: PublishOptions): Promise<string> {
    const { id } = await this.request<{ id: string }>('POST', `/${this.userId}/threads`, {
      media_type: mediaType,
      text: options.text,
      image_url: options.imageUrl,
      video_url: options.videoUrl,
      children: options.children?.join(','),
      reply_to_id: options.replyToId,
      reply_control: options.replyControl,
      alt_text: options.altText,
      location_id: options.locationId,
      link_attachment: options.linkAttachment,
    })
    return id
  }

  /** A single carousel slide. Feed the returned ids to `publish('CAROUSEL', { children })`. */
  async createCarouselItem(
    mediaType: Extract<MediaType, 'IMAGE' | 'VIDEO'>,
    options: Pick<PublishOptions, 'imageUrl' | 'videoUrl' | 'altText'>,
  ): Promise<string> {
    const { id } = await this.request<{ id: string }>('POST', `/${this.userId}/threads`, {
      media_type: mediaType,
      is_carousel_item: 'true',
      image_url: options.imageUrl,
      video_url: options.videoUrl,
      alt_text: options.altText,
    })
    return id
  }

  /** Step two of publishing: turns a finished container into a live post. */
  publishContainer(creationId: string) {
    return this.request<{ id: string }>('POST', `/${this.userId}/threads_publish`, {
      creation_id: creationId,
    })
  }

  getContainerStatus(creationId: string) {
    return this.request<{ id: string; status: string; error_message?: string }>(
      'GET',
      `/${creationId}`,
      { fields: 'status,error_message' },
    )
  }

  /** Poll a media container until it finishes processing. */
  async waitForContainer(creationId: string, timeoutMs = 120_000, intervalMs = 3_000) {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const { status, error_message } = await this.getContainerStatus(creationId)
      if (status === 'FINISHED') return
      if (status === 'ERROR' || status === 'EXPIRED') {
        throw new Error(`Container ${creationId} ended as ${status}: ${error_message ?? 'no detail'}`)
      }
      if (Date.now() >= deadline) {
        throw new Error(`Container ${creationId} still ${status} after ${timeoutMs}ms`)
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }

  /** Needs `threads_delete`. Without it the call fails only after the post is live. */
  async deletePost(postId: string): Promise<boolean> {
    const result = await this.request<{ success?: boolean }>('DELETE', `/${postId}`)
    return result.success === true
  }

  // ─── replies ──────────────────────────────────────────────────────────────

  /** Direct replies to one post. */
  listReplies(postId: string, options: ListOptions = {}) {
    return this.request<Paged<ThreadsReply>>('GET', `/${postId}/replies`, {
      fields: options.fields ?? DEFAULT_REPLY_FIELDS,
      limit: options.limit,
      after: options.after,
    })
  }

  /** The whole thread under a post, nested replies included. */
  listConversation(postId: string, options: ListOptions = {}) {
    return this.request<Paged<ThreadsReply>>('GET', `/${postId}/conversation`, {
      fields: options.fields ?? DEFAULT_REPLY_FIELDS,
      limit: options.limit,
      after: options.after,
    })
  }

  /** Replies across the whole profile — the inbox view. */
  listAllReplies(options: ListOptions = {}) {
    return this.request<Paged<ThreadsReply>>('GET', `/${this.userId}/replies`, {
      fields: options.fields ?? DEFAULT_REPLY_FIELDS,
      limit: options.limit,
      after: options.after,
    })
  }

  /** Needs `threads_manage_replies`. */
  async hideReply(replyId: string, hide = true): Promise<boolean> {
    const result = await this.request<{ success?: boolean }>('POST', `/${replyId}/manage_reply`, {
      hide: String(hide),
    })
    return result.success === true
  }

  // ─── discovery ────────────────────────────────────────────────────────────

  /**
   * Keyword search across Threads. Needs `threads_keyword_search`.
   *
   * Two limits worth knowing before relying on it: the query is a single
   * keyword (multi-word phrases match nothing, they do not fall back to OR),
   * and at the app's default access level results are restricted to the
   * account's own content — seeing other people's posts needs Advanced Access.
   */
  keywordSearch(
    query: string,
    options: { type?: 'TOP' | 'RECENT'; fields?: string; limit?: number } = {},
  ) {
    return this.request<Paged<ThreadsPost>>('GET', '/keyword_search', {
      q: query,
      search_type: options.type ?? 'RECENT',
      fields: options.fields ?? DEFAULT_POST_FIELDS + ',username',
      limit: options.limit,
    })
  }

  /**
   * Posts that mention this account. Needs `threads_manage_mentions` *and* an
   * app access level above the default — otherwise it answers `code 10`
   * regardless of the token's scopes.
   */
  listMentions(options: ListOptions = {}) {
    return this.request<Paged<ThreadsPost>>('GET', `/${this.userId}/mentions`, {
      fields: options.fields ?? DEFAULT_POST_FIELDS + ',username',
      limit: options.limit,
      after: options.after,
    })
  }

  // ─── insights ─────────────────────────────────────────────────────────────

  async accountInsights(
    metrics: AccountMetric[] = ['views', 'likes', 'replies', 'reposts', 'quotes', 'followers_count'],
    range: { since?: number; until?: number } = {},
  ): Promise<InsightMetric[]> {
    const result = await this.request<{ data: InsightMetric[] }>(
      'GET',
      `/${this.userId}/threads_insights`,
      { metric: metrics.join(','), since: range.since, until: range.until },
    )
    return result.data
  }

  async postInsights(
    postId: string,
    metrics: PostMetric[] = ['views', 'likes', 'replies', 'reposts', 'quotes'],
  ): Promise<InsightMetric[]> {
    const result = await this.request<{ data: InsightMetric[] }>('GET', `/${postId}/insights`, {
      metric: metrics.join(','),
    })
    return result.data
  }

  /** Posts, replies and deletes used against the rolling 24-hour quotas. */
  async publishingLimit(): Promise<PublishingLimit | undefined> {
    const result = await this.request<{ data: PublishingLimit[] }>(
      'GET',
      `/${this.userId}/threads_publishing_limit`,
      { fields: 'quota_usage,config,reply_quota_usage,reply_config' },
    )
    return result.data[0]
  }

  // ─── token ────────────────────────────────────────────────────────────────

  /** What the token is actually allowed to do. Check this before any publish test. */
  async inspectToken(): Promise<TokenInfo> {
    const result = await this.requestAbsolute<{ data: TokenInfo }>(
      'GET',
      `${API_HOST}/debug_token`,
      { input_token: this.token, access_token: this.token },
    )
    return result.data
  }

  hasScope(info: TokenInfo, scope: string): boolean {
    return info.scopes?.includes(scope) ?? false
  }

  /**
   * Extend a long-lived token by another 60 days. The token must be at least 24
   * hours old and still valid; an expired one needs a fresh authorization.
   */
  refreshLongLivedToken() {
    return this.requestAbsolute<{ access_token: string; token_type: string; expires_in: number }>(
      'GET',
      `${API_HOST}/refresh_access_token`,
      { grant_type: 'th_refresh_token', access_token: this.token },
    )
  }

  /** Turn a short-lived token (User Token Generator, OAuth) into a 60-day one. */
  static exchangeForLongLivedToken(shortLivedToken: string, appSecret: string) {
    return requestJson<{ access_token: string; token_type: string; expires_in: number }>(
      globalThis.fetch,
      'GET',
      `${API_HOST}/access_token`,
      { grant_type: 'th_exchange_token', client_secret: appSecret, access_token: shortLivedToken },
      undefined,
      0,
    )
  }

  // ─── transport ────────────────────────────────────────────────────────────

  private request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, query: Query = {}) {
    return this.requestAbsolute<T>(method, `${API_HOST}/${this.version}${path}`, query)
  }

  private requestAbsolute<T>(method: 'GET' | 'POST' | 'DELETE', url: string, query: Query = {}) {
    return requestJson<T>(this.fetchImpl, method, url, query, this.token, this.maxRetries)
  }
}

/** Node's `process.env`, or an empty object when running anywhere else. */
function readProcessEnv(): Record<string, string | undefined> {
  const runtime = globalThis as { process?: { env?: Record<string, string | undefined> } }
  return runtime.process?.env ?? {}
}

/**
 * One HTTP call against the Threads API.
 *
 * POST parameters go in the query string rather than a body — that is what the
 * API expects, and it keeps the two-step publish flow readable. The token
 * travels in the Authorization header instead, so it stays out of URLs and logs.
 */
async function requestJson<T>(
  fetchImpl: typeof fetch,
  method: 'GET' | 'POST' | 'DELETE',
  url: string,
  query: Query,
  token: string | undefined,
  maxRetries: number,
): Promise<T> {
  const target = new URL(url)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') target.searchParams.set(key, String(value))
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  let lastError: ThreadsApiError | undefined
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetchImpl(target, { method, headers })
    const raw = await response.text()
    const parsed: unknown = raw ? JSON.parse(raw) : {}

    if (response.ok) return parsed as T

    const body = (parsed as { error?: ThreadsErrorBody }).error ?? {}
    const error = new ThreadsApiError(`${method} ${target.pathname}`, response.status, body)
    if (!error.isTransient || attempt === maxRetries) throw error
    lastError = error
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt))
  }

  throw lastError
}
