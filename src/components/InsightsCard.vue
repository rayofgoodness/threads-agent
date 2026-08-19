<script setup lang="ts">
import { computed } from 'vue'
import { api } from '../api/client.ts'
import { useResource } from '../composables/useResource.ts'
import StatusLine from './StatusLine.vue'

const insights = useResource(api.insights)

const LABELS: Record<string, string> = {
  views: 'Перегляди профілю',
  likes: 'Лайки',
  replies: 'Відповіді',
  reposts: 'Репости',
  quotes: 'Цитування',
  followers_count: 'Підписники',
}

/** Daily metrics arrive as a series, aggregates as a single total. */
const metrics = computed(() =>
  (insights.data.value ?? []).map((metric) => ({
    name: metric.name,
    label: LABELS[metric.name] ?? metric.name,
    value: metric.total_value?.value ?? metric.values?.at(-1)?.value ?? 0,
  })),
)
</script>

<template>
  <section class="card" aria-labelledby="insights-heading">
    <h2 id="insights-heading">Акаунт</h2>
    <StatusLine :error="insights.error.value" :pending="insights.pending.value" />

    <dl v-if="metrics.length" class="grid">
      <div v-for="metric in metrics" :key="metric.name">
        <dt class="muted small">{{ metric.label }}</dt>
        <dd>{{ metric.value }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
h2 {
  font-size: 1rem;
  margin-block-end: 0.75rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
  gap: 0.75rem 1rem;
  margin: 0;
}

dt,
dd {
  margin: 0;
}

dd {
  font-size: 1.35rem;
  font-variant-numeric: tabular-nums;
}
</style>
