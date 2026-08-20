<script setup lang="ts">
import { ref } from 'vue'
import { api, ApiError } from '../api/client.ts'
import type { InsightMetric, ThreadsPost } from '../threads/types.ts'
import AppIcon from './AppIcon.vue'

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
  <article class="post">
    <header>
      <time v-if="post.timestamp" class="tiny faint num" :datetime="post.timestamp">
        {{ formatted(post.timestamp) }}
      </time>
      <span v-if="post.media_type && post.media_type !== 'TEXT_POST'" class="tiny faint">
        {{ post.media_type }}
      </span>
    </header>

    <p class="text">{{ post.text || '(без тексту)' }}</p>

    <dl v-if="metrics" class="metrics">
      <div v-for="metric in metrics" :key="metric.name">
        <dt class="tiny faint">{{ METRIC_LABELS[metric.name] ?? metric.name }}</dt>
        <dd class="num">{{ metric.values?.[0]?.value ?? metric.total_value?.value ?? 0 }}</dd>
      </div>
    </dl>

    <p v-if="error" class="tiny error" role="alert">{{ error }}</p>

    <footer>
      <a
        v-if="post.permalink"
        class="tiny"
        :href="post.permalink"
        target="_blank"
        rel="noreferrer noopener"
      >
        <AppIcon name="external" :size="13" />
        Відкрити
      </a>
      <button v-if="!metrics" class="quiet" :disabled="metricsPending" @click="loadMetrics">
        <AppIcon name="chart" :size="13" />
        {{ metricsPending ? 'Рахую…' : 'Метрики' }}
      </button>
      <button
        v-if="canDelete"
        class="danger spread"
        :disabled="deleting"
        @click="remove"
        @blur="confirming = false"
      >
        <AppIcon name="trash" :size="13" />
        {{ deleting ? 'Видаляю…' : confirming ? 'Точно видалити?' : 'Видалити' }}
      </button>
    </footer>
  </article>
</template>

<style scoped>
.post {
  display: grid;
  gap: var(--s-2);
  padding: var(--s-4) var(--s-5);
  border-block-start: 1px solid var(--border);
}

header {
  display: flex;
  align-items: baseline;
  gap: var(--s-3);
}

header span:last-child {
  margin-inline-start: auto;
}

.text {
  font-size: var(--fs-body);
  line-height: 1.55;
  white-space: pre-wrap;
  /* Post bodies can carry unbroken URLs. */
  overflow-wrap: anywhere;
  text-wrap: pretty;
  max-inline-size: 68ch;
}

.metrics {
  display: flex;
  flex-flow: row wrap;
  gap: var(--s-2) var(--s-5);
  margin: var(--s-1) 0 0;
  padding: var(--s-3) 0 0;
  border-block-start: 1px solid var(--border);
}

.metrics div {
  display: grid;
}

.metrics dd {
  margin: 0;
  font-size: var(--fs-md);
  font-weight: 600;
  line-height: 1.2;
}

footer {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  margin-block-start: var(--s-1);
}

footer a {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
</style>
