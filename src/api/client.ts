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
  remove: (id: string) => request<{ deleted: boolean }>(`/posts/${id}`, { method: 'DELETE' }),
}
