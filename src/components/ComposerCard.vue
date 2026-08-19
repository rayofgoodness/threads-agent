<script setup lang="ts">
import { computed, ref } from 'vue'
import { api, ApiError } from '../api/client.ts'
import type { ThreadsPost } from '../threads/types.ts'

const emit = defineEmits<{ published: [post: ThreadsPost] }>()

/** Threads rejects anything past this; the counter turns red before the API does. */
const MAX_LENGTH = 500

const text = ref('')
const publishing = ref(false)
const error = ref<string>()
const published = ref<ThreadsPost>()

const remaining = computed(() => MAX_LENGTH - text.value.length)
const canPublish = computed(() => text.value.trim().length > 0 && remaining.value >= 0)

async function publish() {
  if (!canPublish.value || publishing.value) return
  publishing.value = true
  error.value = undefined
  published.value = undefined
  try {
    const post = await api.publish(text.value)
    published.value = post
    text.value = ''
    emit('published', post)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : String(cause)
  } finally {
    publishing.value = false
  }
}
</script>

<template>
  <section class="card" aria-labelledby="composer-heading">
    <h2 id="composer-heading">Новий пост</h2>

    <!-- Ctrl/Cmd+Enter mirrors what every posting UI does; the button stays the
         primary path so keyboard-only users are not forced into a shortcut. -->
    <textarea
      v-model="text"
      :aria-describedby="'composer-counter'"
      :disabled="publishing"
      placeholder="Що публікуємо?"
      @keydown.ctrl.enter="publish"
      @keydown.meta.enter="publish"
    ></textarea>

    <div class="row">
      <span
        id="composer-counter"
        class="small"
        :class="remaining < 0 ? 'error' : 'muted'"
        aria-live="polite"
      >
        {{ remaining }} символів лишилось
      </span>
      <button class="primary" :disabled="!canPublish || publishing" @click="publish">
        {{ publishing ? 'Публікую…' : 'Опублікувати' }}
      </button>
    </div>

    <p v-if="error" class="error small" role="alert">{{ error }}</p>
    <p v-else-if="published" class="small" role="status">
      Опубліковано ·
      <a :href="published.permalink" target="_blank" rel="noreferrer noopener">відкрити в Threads</a>
    </p>
  </section>
</template>

<style scoped>
h2 {
  font-size: 1rem;
  margin-block-end: 0.75rem;
}

.row {
  display: flex;
  align-items: safe center;
  gap: 1rem;
  margin-block-start: 0.75rem;
}

.row button {
  margin-inline-start: auto;
}

p {
  margin-block: 0.75rem 0;
}
</style>
