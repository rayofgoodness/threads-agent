import { onMounted, onUnmounted, ref, computed } from 'vue'

/**
 * Which screen is showing, kept in `location.hash`.
 *
 * Four screens are not worth a router: the hash gives back and forward, a
 * link that survives being sent to a phone, and a reload that lands where it
 * left — which is the whole of what a router would have been used for here.
 */
export const VIEWS = [
  { id: 'overview', title: 'Огляд', icon: 'gauge' },
  { id: 'content', title: 'Контент', icon: 'pen' },
  { id: 'feed', title: 'Стрічка', icon: 'stream' },
  { id: 'settings', title: 'Налаштування', icon: 'sliders' },
] as const

export type ViewId = (typeof VIEWS)[number]['id']

const DEFAULT: ViewId = 'overview'

/**
 * A hash that names no view leaves the current one alone.
 *
 * The skip link points at `#view`, and so would any in-page anchor added
 * later; resetting to the overview because someone jumped to a heading would
 * be a navigation bug wearing a routing costume.
 */
function fromHash(fallback: ViewId = DEFAULT): ViewId {
  const id = window.location.hash.replace(/^#\/?/, '')
  return VIEWS.some((view) => view.id === id) ? (id as ViewId) : fallback
}

export function useView() {
  const current = ref<ViewId>(fromHash())

  function sync() {
    current.value = fromHash(current.value)
  }

  function go(id: ViewId) {
    // Writing the hash and letting the listener set the value keeps one source
    // of truth, so a back button and a nav click cannot disagree.
    if (current.value === id) return
    window.location.hash = `#/${id}`
  }

  onMounted(() => window.addEventListener('hashchange', sync))
  onUnmounted(() => window.removeEventListener('hashchange', sync))

  const title = computed(() => VIEWS.find((view) => view.id === current.value)?.title ?? '')

  return { current, go, title }
}
