<script setup lang="ts">
import { ref } from 'vue'
import { api, ApiError } from '../api/client.ts'
import type { InsightMetric, ThreadsPost } from '../threads/types.ts'

const props = defineProps<{ post: ThreadsPost; canDelete: boolean }>()
const emit = defineEmits<{ deleted: [id: string] }>()

const metrics = ref<InsightMetric[]>()
const metricsPending = ref(false)
const error = ref<string>()
/** Deleting is irreversible, so the button asks once before it acts. */
const confirming = ref(false)
const deleting = ref(false)

const METRIC_LABELS: Record<string, string> = {
  views: 'переглядів',
  likes: 'лайків',
  replies: 'відповідей',
  reposts: 'репостів',
  quotes: 'цитувань',
}

function formatted(date?: string) {
  if (!date) return ''
  return new Date(date).toLocaleString('uk-UA', { dateStyle: 'medium', timeStyle: 'short' })
}

async function loadMetrics() {
  if (metrics.value || metricsPending.value) return
  metricsPending.value = true
  error.value = undefined
  try {
    metrics.value = await api.postInsights(props.post.id)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : String(cause)
  } finally {
    metricsPending.value = false
  }
}

async function remove() {
  if (!confirming.value) {
    confirming.value = true
    return
  }
  deleting.value = true
  error.value = undefined
  try {
    await api.remove(props.post.id)
    emit('deleted', props.post.id)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : String(cause)
    confirming.value = false
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <article class="card post">
    <header>
      <time v-if="post.timestamp" class="muted small" :datetime="post.timestamp">
        {{ formatted(post.timestamp) }}
      </time>
      <span class="muted small type">{{ post.media_type }}</span>
    </header>

    <p class="text">{{ post.text || '(без тексту)' }}</p>

    <ul v-if="metrics" class="metrics small">
      <li v-for="metric in metrics" :key="metric.name">
        <strong>{{ metric.values?.[0]?.value ?? metric.total_value?.value ?? 0 }}</strong>
        {{ METRIC_LABELS[metric.name] ?? metric.name }}
      </li>
    </ul>

    <p v-if="error" class="error small" role="alert">{{ error }}</p>

    <footer>
      <a v-if="post.permalink" :href="post.permalink" target="_blank" rel="noreferrer noopener">
        Відкрити
      </a>
      <button v-if="!metrics" :disabled="metricsPending" @click="loadMetrics">
        {{ metricsPending ? 'Рахую…' : 'Метрики' }}
      </button>
      <button
        v-if="canDelete"
        class="danger"
        :disabled="deleting"
        @click="remove"
        @blur="confirming = false"
      >
        {{ deleting ? 'Видаляю…' : confirming ? 'Точно видалити?' : 'Видалити' }}
      </button>
    </footer>
  </article>
</template>

<style scoped>
.post {
  display: grid;
  gap: 0.6rem;
}

header {
  display: flex;
  gap: 0.75rem;
  align-items: baseline;
}

.type {
  margin-inline-start: auto;
}

.text {
  margin: 0;
  white-space: pre-wrap;
  /* Post bodies can carry unbroken URLs. */
  overflow-wrap: anywhere;
  text-wrap: pretty;
}

.metrics {
  display: flex;
  flex-flow: row wrap;
  gap: 0.35rem 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
  color: var(--muted);
}

.metrics strong {
  color: var(--fg);
  font-variant-numeric: tabular-nums;
}

footer {
  display: flex;
  align-items: safe center;
  gap: 0.5rem;
}

footer button:last-child {
  margin-inline-start: auto;
}

p.error {
  margin: 0;
}
</style>
