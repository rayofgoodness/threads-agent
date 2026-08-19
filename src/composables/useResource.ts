import { ref, shallowRef, onMounted } from 'vue'
import { ApiError } from '../api/client.ts'

/**
 * Loads one async value and tracks its state.
 *
 * Keeps the previous value visible while reloading, so refreshing the feed
 * after publishing does not blank the screen.
 */
export function useResource<T>(load: () => Promise<T>, options: { immediate?: boolean } = {}) {
  const data = shallowRef<T | undefined>(undefined)
  const error = ref<string | undefined>(undefined)
  const pending = ref(false)
  const loaded = ref(false)

  async function refresh() {
    pending.value = true
    error.value = undefined
    try {
      data.value = await load()
      loaded.value = true
    } catch (cause) {
      error.value = cause instanceof ApiError ? cause.message : String(cause)
    } finally {
      pending.value = false
    }
  }

  if (options.immediate !== false) onMounted(refresh)

  return { data, error, pending, loaded, refresh }
}
