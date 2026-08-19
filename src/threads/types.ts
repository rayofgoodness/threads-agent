/** Shapes returned by the Threads Graph API (https://graph.threads.net). */

export type MediaType = 'TEXT' | 'IMAGE' | 'VIDEO' | 'CAROUSEL'

/** `media_type` as it comes back on a published post — differs from the publishing input. */
export type PublishedMediaType = 'TEXT_POST' | 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REPOST_FACADE'

/** Who may reply to a post. */
export type ReplyControl = 'everyone' | 'accounts_you_follow' | 'mentioned_only'

export interface ThreadsProfile {
  id: string
  username?: string
  name?: string
  threads_biography?: string
  threads_profile_picture_url?: string
}

export interface ThreadsPost {
  id: string
  media_type?: PublishedMediaType
  media_url?: string
  permalink?: string
  owner?: { id: string }
  username?: string
  text?: string
  timestamp?: string
  shortcode?: string
  is_quote_post?: boolean
  has_replies?: boolean
  reply_audience?: ReplyControl
}

export interface ThreadsReply extends ThreadsPost {
  hide_status?: 'NOT_HUSHED' | 'UNHUSHED' | 'HIDDEN' | 'COVERED' | 'BLOCKED' | 'RESTRICTED'
  replied_to?: { id: string }
  is_reply?: boolean
  root_post?: { id: string }
}

/** Cursor-paginated collection. `paging.cursors.after` feeds the next call's `after`. */
export interface Paged<T> {
  data: T[]
  paging?: {
    cursors?: { before?: string; after?: string }
    next?: string
    previous?: string
  }
}

export type AccountMetric =
  | 'views'
  | 'likes'
  | 'replies'
  | 'reposts'
  | 'quotes'
  | 'followers_count'
  | 'follower_demographics'

export type PostMetric = 'views' | 'likes' | 'replies' | 'reposts' | 'quotes' | 'shares'

/**
 * Insight metrics come back in one of two shapes: a `values` time series (daily
 * metrics such as profile views) or a single `total_value` (aggregates).
 */
export interface InsightMetric {
  name: string
  period: string
  title?: string
  description?: string
  id: string
  values?: Array<{ value: number; end_time?: string }>
  total_value?: { value: number }
}

export interface PublishingLimit {
  quota_usage: number
  config: { quota_total: number; quota_duration: number }
  reply_quota_usage?: number
  reply_config?: { quota_total: number; quota_duration: number }
  delete_quota_usage?: number
  delete_config?: { quota_total: number; quota_duration: number }
}

export interface PublishOptions {
  /** Post body. Required for TEXT, optional caption for the other types. */
  text?: string
  /** Public https URL of the image. Required for IMAGE. */
  imageUrl?: string
  /** Public https URL of the video. Required for VIDEO. */
  videoUrl?: string
  /** Container ids from `createCarouselItem`. Required for CAROUSEL, 2–20 items. */
  children?: string[]
  /** Post id being replied to. */
  replyToId?: string
  /** Who may reply. */
  replyControl?: ReplyControl
  /** Accessibility text for IMAGE and VIDEO. */
  altText?: string
  /** Location id from the location search endpoint (needs threads_location_tagging). */
  locationId?: string
  /** Link attached to a TEXT post. */
  linkAttachment?: string
}

export interface TokenInfo {
  app_id?: string
  application?: string
  type?: string
  is_valid: boolean
  /** Unix seconds. Reflects the account's original authorization, not this token's issuance. */
  issued_at?: number
  expires_at?: number
  data_access_expires_at?: number
  scopes?: string[]
  user_id?: string
}
