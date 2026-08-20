<script setup lang="ts">
import { computed } from 'vue'
import { api } from '../api/client.ts'
import { useResource } from '../composables/useResource.ts'
import type { ViewId } from '../composables/useView.ts'
import StatTile from '../components/StatTile.vue'
import SlotStrip from '../components/SlotStrip.vue'
import PerformancePanel from '../components/PerformancePanel.vue'
import SignalsPanel from '../components/SignalsPanel.vue'

/**
 * The morning check.
 *
 * Three questions, in the order they get asked: did anything land, is there
 * something to say tomorrow, and did anyone say anything to us.
 */
const emit = defineEmits<{ go: [id: ViewId] }>()

const DAY = 86_400
const now = Math.floor(Date.now() / 1000)

/**
 * Two windows of equal length, because a number without a comparison is a
 * number nobody can act on. Threads counts in whole days from `since`.
 */
const week = useResource(() => api.insights({ since: now - 7 * DAY, until: now }))
const priorWeek = useResource(() => api.insights({ since: now - 14 * DAY, until: now - 7 * DAY }))
const total = useResource(() => api.insights())

/** Daily values for a series metric, oldest first. */
function daily(metrics: typeof week.data.value, name: string): number[] {
  const metric = metrics?.find((candidate) => candidate.name === name)
  return (metric?.values ?? []).map((point) => point.value)
}

function sum(metrics: typeof week.data.value, name: string): number | undefined {
  const metric = metrics?.find((candidate) => candidate.name === name)
  if (!metric) return undefined
  if (metric.total_value) return metric.total_value.value
  if (!metric.values?.length) return undefined
  return metric.values.reduce((carry, point) => carry + point.value, 0)
}

const views = computed(() => sum(week.data.value, 'views'))
const viewsBefore = computed(() => sum(priorWeek.data.value, 'views'))
const viewsSeries = computed(() => daily(week.data.value, 'views'))

const likes = computed(() => sum(week.data.value, 'likes'))
const likesBefore = computed(() => sum(priorWeek.data.value, 'likes'))

const replies = computed(() => sum(week.data.value, 'replies'))
const repliesBefore = computed(() => sum(priorWeek.data.value, 'replies'))

/** Followers is a running total, so a seven-day window says nothing about it. */
const followers = computed(() => sum(total.data.value, 'followers_count'))

const failure = computed(() => week.error.value ?? total.error.value)
</script>

<template>
  <p v-if="failure" class="panel notice error small" role="alert">
    Статистика акаунта не читається: {{ failure }}
  </p>

  <div class="tiles">
    <StatTile
      label="Перегляди · 7 днів"
      :value="views"
      :previous="viewsBefore"
      :series="viewsSeries"
      :pending="week.pending.value"
    />
    <StatTile
      label="Лайки · 7 днів"
      :value="likes"
      :previous="likesBefore"
      :pending="week.pending.value"
    />
    <StatTile
      label="Відповіді · 7 днів"
      :value="replies"
      :previous="repliesBefore"
      :pending="week.pending.value"
    />
    <StatTile
      label="Підписники"
      :value="followers"
      note="усього, без порівняння — Threads віддає лише поточне число"
      :pending="total.pending.value"
    />
  </div>

  <SlotStrip @fill="emit('go', 'content')" />

  <PerformancePanel />

  <SignalsPanel />
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: var(--s-4);
}

.notice {
  padding: var(--s-4) var(--s-5);
}
</style>
