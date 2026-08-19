/**
 * Browser-side access to the app's own `/api` routes.
 *
 * Deliberately not the Threads client: that one carries the access token and
 * lives in `server/`. Everything here is same-origin, so the token never
 * reaches the bundle. Only *types* are shared across the boundary.
 */
import type {
  InsightMetric,
  Paged,
  PublishingLimit,
  ThreadsPost,
  ThreadsProfile,
  ThreadsReply,
} from '../threads/types.ts'

export interface Signal {
  kind: 'reply' | 'mention' | 'keyword'
  id: string
  username?: string
  text: string
  permalink?: string
  timestamp?: string
  matched?: string
}

export interface MonitorReport {
  signals: Signal[]
  unavailable: { source: string; reason: string }[]
  checkedAt: string
}

/** Tone of voice — the `voice` block of `agent.config.json`, editable here. */
export interface Voice {
  persona: string
  audience: string
  language: string
  tone: string[]
  rules: string[]
  avoid: string[]
  emoji: 'none' | 'sparingly' | 'free'
  samples: string[]
}

export interface PlanTopic {
  line: number
  text: string
  done: boolean
}

export interface ContentPlan {
  raw: string
  topics: PlanTopic[]
}

export interface GuardrailViolation {
  rule: 'maxLength' | 'minLength' | 'bannedPhrase' | 'empty'
  detail: string
}

export interface QueueItem {
  file: string
  path: string
  /** `draft` items live on the shelf and have no slot — they cannot publish. */
  status: 'draft' | 'queued' | 'published' | 'failed'
  publishAt?: string
  publishedAt?: string
  postId?: string
  permalink?: string
  note?: string
  topic?: string
  text: string
  violations?: GuardrailViolation[]
}

export interface Draft {
  topic: string
  text: string
  note: string
  planLine?: number
  violations: GuardrailViolation[]
}

export interface Generation {
  /** Null when no database is configured — drafting works without one. */
  id: number | null
  model: string
  brief?: string
  drafts: Draft[]
  usage: { input: number; output: number; cached: number }
  /** Suggested slot per draft, in order, so the UI can show where it would go. */
  slots: string[]
}

/** A past generation as the database kept it. */
export interface GenerationRecord {
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
    /** `queued` once the draft left the generator for the queue or the shelf. */
    status: string
    queueFile: string | null
  }[]
}

export interface TokenStatus {
  valid: boolean
  expiresAt: string | null
  scopes: string[]
  canPublish: boolean
  canDelete: boolean
}

/** A non-2xx answer from `/api`, carrying whatever detail the server sent. */
export class ApiError extends Error {
  readonly status: number
  readonly code?: number

  constructor(status: number, message: string, code?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

const TOKEN_KEY = 'threads-agent-token'

/**
 * Access token for this dashboard — not the Threads token, which never leaves
 * the server. Only needed when the deployment sets `THREADS_AGENT_TOKEN`; a
 * loopback-only server accepts requests without it.
 */
export function getAccessToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}

export function setAccessToken(value: string) {
  if (value) localStorage.setItem(TOKEN_KEY, value)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAccessToken()
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new ApiError(0, 'Сервер недоступний — запусти `npm run server`')
  }

  const payload: unknown = await response.json().catch(() => ({}))

  if (!response.ok) {
    const detail = payload as { error?: string; code?: number }
    throw new ApiError(response.status, detail.error ?? `Запит завершився з ${response.status}`, detail.code)
  }
  return payload as T
}

export const api = {
  profile: () => request<ThreadsProfile>('/profile'),
  token: () => request<TokenStatus>('/token'),
  limits: () => request<PublishingLimit | undefined>('/limits'),
  insights: () => request<InsightMetric[]>('/insights'),
  posts: (limit = 25) => request<Paged<ThreadsPost>>(`/posts?limit=${limit}`),
  postInsights: (id: string) => request<InsightMetric[]>(`/posts/${id}/insights`),
  replies: (id: string) => request<Paged<ThreadsReply>>(`/posts/${id}/replies`),
  publish: (text: string) =>
    request<ThreadsPost>('/posts', { method: 'POST', body: JSON.stringify({ text }) }),
  signals: (all = false) => request<MonitorReport>(`/signals${all ? '?all=1' : ''}`),

  voice: () => request<Voice>('/voice'),
  saveVoice: (voice: Voice) => request<Voice>('/voice', { method: 'PUT', body: JSON.stringify(voice) }),

  plan: () => request<ContentPlan>('/plan'),
  savePlan: (raw: string) =>
    request<ContentPlan>('/plan', { method: 'PUT', body: JSON.stringify({ raw }) }),

  queue: () => request<QueueItem[]>('/queue'),
  enqueue: (payload: {
    text: string
    publishAt?: string
    planLine?: number
    generationId?: number
    position?: number
  }) => request<QueueItem>('/queue', { method: 'POST', body: JSON.stringify(payload) }),

  drafts: () => request<QueueItem[]>('/drafts'),
  /** Keeps a text without a slot. Nothing on the shelf can publish. */
  keepDraft: (payload: {
    text: string
    topic?: string
    planLine?: number
    generationId?: number
    position?: number
  }) => request<QueueItem>('/drafts', { method: 'POST', body: JSON.stringify(payload) }),
  updateDraft: (file: string, text: string) =>
    request<QueueItem>(`/drafts/${encodeURIComponent(file)}`, {
      method: 'PUT',
      body: JSON.stringify({ text }),
    }),
  dropDraft: (file: string) =>
    request<{ deleted: boolean }>(`/drafts/${encodeURIComponent(file)}`, { method: 'DELETE' }),
  /** The one door from the shelf into the queue. */
  scheduleDraft: (file: string, publishAt?: string) =>
    request<QueueItem>(`/drafts/${encodeURIComponent(file)}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ publishAt }),
    }),

  /** Past generations. Empty without a database — the history is optional. */
  generations: (limit = 20) => request<GenerationRecord[]>(`/generations?limit=${limit}`),
  dbStatus: () => request<{ enabled: boolean }>('/db'),

  /** Costs an Anthropic call and can take a while; nothing is queued by it. */
  generate: (payload: { brief?: string; count?: number }) =>
    request<Generation>('/generate', { method: 'POST', body: JSON.stringify(payload) }),
  remove: (id: string) => request<{ deleted: boolean }>(`/posts/${id}`, { method: 'DELETE' }),
}
