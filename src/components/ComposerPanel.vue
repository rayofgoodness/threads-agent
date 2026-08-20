<script setup lang="ts">
import { computed, ref } from 'vue'
import { api, ApiError } from '../api/client.ts'
import { useDashboard } from '../composables/useDashboard.ts'
import type { ThreadsPost } from '../threads/types.ts'
import AppIcon from './AppIcon.vue'

/**
 * Publishing by hand, without the queue.
 *
 * The only control on this surface that puts words in front of people the
 * instant it is pressed, so it says so and it is never the default path.
 */
const { canPublish, settings, refreshFeedSoon } = useDashboard()

const text = ref('')
const publishing = ref(false)
const error = ref<string>()
const published = ref<ThreadsPost>()

const limit = computed(() => settings.data.value?.guardrails.maxLength ?? 500)
const remaining = computed(() => limit.value - text.value.length)
const ready = computed(() => text.value.trim().length > 0 && remaining.value >= 0)

async function publish() {
  if (!ready.value || publishing.value) return
  publishing.value = true
  error.value = undefined
  published.value = undefined
  try {
    published.value = await api.publish(text.value)
    text.value = ''
    refreshFeedSoon()
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : String(cause)
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <section class="panel" aria-labelledby="composer-heading">
    <div class="panel-head">
      <h2 id="composer-heading">Опублікувати зараз</h2>
      <p class="tiny faint spread">повз чергу, без розкладу</p>
    </div>

    <div class="panel-body body">
      <!-- Ctrl/Cmd+Enter mirrors what every posting UI does; the button stays
           the primary path so keyboard-only users are not forced into it. -->
      <textarea
        v-model="text"
        aria-describedby="composer-counter"
        :disabled="publishing || !canPublish"
        placeholder="Що публікуємо?"
        @keydown.ctrl.enter="publish"
        @keydown.meta.enter="publish"
      ></textarea>

      <div class="row">
        <span
          id="composer-counter"
          class="tiny num"
          :class="remaining < 0 ? 'error' : 'faint'"
          aria-live="polite"
        >
          {{ remaining }} символів лишилось
        </span>
        <button class="primary spread" :disabled="!ready || publishing || !canPublish" @click="publish">
          <AppIcon name="stream" />
          {{ publishing ? 'Публікую…' : 'Опублікувати' }}
        </button>
      </div>

      <p v-if="!canPublish" class="small muted">
        Токен не має дозволу <code>threads_content_publish</code> — публікація недоступна, поки він
        не перевиданий.
      </p>
      <p v-if="error" class="small error" role="alert">{{ error }}</p>
      <p v-else-if="published" class="small muted" role="status">
        Опубліковано ·
        <a :href="published.permalink" target="_blank" rel="noreferrer noopener">
          відкрити в Threads
        </a>
      </p>
    </div>
  </section>
</template>

<style scoped>
.body {
  display: grid;
  gap: var(--s-3);
}

/* The same measure the published post will have in the feed. */
textarea,
.row {
  max-inline-size: 68ch;
}
</style>
