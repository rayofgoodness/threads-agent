import { computed, inject, provide, type InjectionKey } from 'vue'
import { api } from '../api/client.ts'
import { useResource } from './useResource.ts'

/**
 * The state every view shares.
 *
 * Before this, each card owned its own copy and the shell poked siblings
 * through template refs — which worked while everything was on one page and
 * stops working the moment the queue lives on a different screen from the
 * generator that fills it. One store, one refresh, and a view that is not
 * mounted still gets the new value when it comes back.
 */
export function createDashboard() {
  const profile = useResource(api.profile)
  const token = useResource(api.token)
  const limits = useResource(api.limits)
  const settings = useResource(api.settings)
  const db = useResource(api.dbStatus)

  const feed = useResource(() => api.posts(25))
  const queue = useResource(api.queue)
  const drafts = useResource(api.drafts)
  const plan = useResource(api.plan)

  const posts = computed(() => feed.data.value?.data ?? [])
  const queued = computed(() => queue.data.value ?? [])
  const shelf = computed(() => drafts.data.value ?? [])

  /** A 401 means the deployment is gated; everything else stays as it was. */
  const locked = computed(() =>
    [profile.error.value, feed.error.value].some((message) =>
      message?.includes('Authorization: Bearer'),
    ),
  )

  /**
   * The server itself is unreachable — a Pi that is off, or a tunnel that is
   * down. Distinguished from a failed call because it is one fact about the
   * whole page, not five identical errors inside five panels.
   */
  const offline = computed(() => {
    const messages = [profile.error.value, feed.error.value, settings.error.value]
    return !locked.value && messages.every((message) => message?.includes('Сервер недоступний'))
  })

  const canDelete = computed(() => token.data.value?.canDelete ?? false)
  const canPublish = computed(() => token.data.value?.canPublish ?? false)

  /** Days before the 60-day token has to be re-issued by hand. */
  const tokenDays = computed(() => {
    const expiresAt = token.data.value?.expiresAt
    if (!expiresAt) return undefined
    return Math.round((Date.parse(expiresAt) - Date.now()) / 86_400_000)
  })

  /**
   * `/me/threads` lags behind writes — measured at roughly five seconds for
   * both publishing and deleting. Correct the list locally first and re-read
   * once the API has caught up; refreshing sooner brings back a deleted post.
   */
  const FEED_SETTLE_MS = 6000
  function refreshFeedSoon() {
    window.setTimeout(() => void feed.refresh(), FEED_SETTLE_MS)
  }

  /** A queued draft may also have ticked a topic off the plan. */
  async function afterQueued() {
    await Promise.all([queue.refresh(), plan.refresh()])
  }

  async function afterKept() {
    await Promise.all([drafts.refresh(), plan.refresh()])
  }

  /** Scheduling empties one shelf into the other. */
  async function afterScheduled() {
    await Promise.all([queue.refresh(), drafts.refresh()])
  }

  return {
    profile,
    token,
    limits,
    settings,
    db,
    feed,
    queue,
    drafts,
    plan,
    posts,
    queued,
    shelf,
    locked,
    offline,
    canDelete,
    canPublish,
    tokenDays,
    refreshFeedSoon,
    afterQueued,
    afterKept,
    afterScheduled,
  }
}

export type Dashboard = ReturnType<typeof createDashboard>

const KEY: InjectionKey<Dashboard> = Symbol('dashboard')

export function provideDashboard(dashboard: Dashboard) {
  provide(KEY, dashboard)
}

export function useDashboard(): Dashboard {
  const dashboard = inject(KEY)
  if (!dashboard) throw new Error('useDashboard() used outside the dashboard shell')
  return dashboard
}
