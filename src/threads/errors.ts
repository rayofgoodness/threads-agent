/** Error envelope the Threads API returns on failure. */
export interface ThreadsErrorBody {
  message?: string
  type?: string
  code?: number
  error_subcode?: number
  fbtrace_id?: string
}

/**
 * A failed Threads API call.
 *
 * The API is inconsistent about status codes — a missing permission arrives as
 * HTTP 500 with `code: 10`, while a deleted or invisible object arrives as HTTP
 * 400 with `code: 100, error_subcode: 33`. Branch on `code`, not on `status`.
 */
export class ThreadsApiError extends Error {
  readonly status: number
  readonly code?: number
  readonly subcode?: number
  readonly type?: string
  readonly traceId?: string
  readonly endpoint: string

  constructor(endpoint: string, status: number, body: ThreadsErrorBody) {
    super(body.message ?? `Threads API request failed with HTTP ${status}`)
    this.name = 'ThreadsApiError'
    this.endpoint = endpoint
    this.status = status
    this.code = body.code
    this.subcode = body.error_subcode
    this.type = body.type
    this.traceId = body.fbtrace_id
  }

  /**
   * The token lacks a permission the endpoint needs. On publish/delete this
   * fires only after the post already exists, so check scopes beforehand.
   */
  get isPermissionDenied(): boolean {
    return this.code === 10 || this.code === 200 || this.code === 3
  }

  /** The object is gone, was never visible to this token, or is the wrong type. */
  get isNotFound(): boolean {
    return this.code === 100 && this.subcode === 33
  }

  /** Expired or revoked token — re-issue it, do not retry. */
  get isAuthError(): boolean {
    return this.code === 190 || this.code === 102
  }

  /** Quota exhausted. Retrying immediately will fail the same way. */
  get isRateLimited(): boolean {
    return this.code === 4 || this.code === 17 || this.code === 32 || this.code === 613
  }

  /** Transient upstream failure — safe to retry after a pause. */
  get isTransient(): boolean {
    return this.code === 1 || this.code === 2 || this.status === 503 || this.status === 504
  }
}
