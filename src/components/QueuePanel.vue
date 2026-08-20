<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '../composables/useDashboard.ts'
import AppIcon from './AppIcon.vue'

/**
 * What is waiting to go out.
 *
 * Read-only on purpose: publishing is the scheduler's job, and an edit or a
 * delete button here would be a second, quieter way to change what the account
 * says. Anything that still needs work belongs on the shelf, not in the queue.
 */
const { queue, queued, settings } = useDashboard()

/**
 * The file's `status` is written by `agent/queue.ts` in English; nothing on
 * this surface is. Every other enum here goes through a map — this one is no
 * different just because it appears rarely.
 */
const STATUS_LABELS: Record<string, string> = {
  failed: 'не вдалося',
  published: 'опубліковано',
  draft: 'чернетка',
}

const sorted = computed(() =>
  [...queued.value].sort((a, b) => (a.publishAt ?? '').localeCompare(b.publishAt ?? '')),
)

function when(value?: string): string {
  if (!value) return 'без часу'
  return new Date(value).toLocaleString('uk-UA', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: settings.data.value?.timezone,
  })
}
</script>

<template>
  <section class="panel" aria-labelledby="queue-heading">
    <div class="panel-head">
      <h2 id="queue-heading">Черга</h2>
      <p class="tiny faint spread num">{{ queued.length }} у розкладі</p>
    </div>

    <p v-if="queue.error.value" class="panel-body error small" role="alert">
      {{ queue.error.value }}
    </p>

    <p v-else-if="queue.pending.value && !queue.loaded.value" class="panel-body muted small">
      Читаю чергу…
    </p>

    <p v-else-if="!sorted.length" class="panel-body muted small">
      Порожньо. Черга наповнюється з полиці або прямо з генерації — тут нічого не редагують, бо
      все, що тут лежить, публікується саме.
    </p>

    <ul v-else class="items">
      <li v-for="item in sorted" :key="item.file">
        <div class="meta">
          <time class="num small" :datetime="item.publishAt">{{ when(item.publishAt) }}</time>
          <span v-if="item.status !== 'queued'" class="tiny status">
            <AppIcon name="alert" :size="12" />
            {{ STATUS_LABELS[item.status] ?? item.status }}
          </span>
        </div>
        <p class="text">{{ item.text }}</p>
        <p v-if="item.note" class="tiny error">{{ item.note }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.items {
  list-style: none;
  margin: 0;
  padding: 0;
}

.items li {
  display: grid;
  gap: var(--s-1);
  padding: var(--s-3) var(--s-5);
  border-block-start: 1px solid var(--border);
}

.items li:first-child {
  border-block-start: none;
}

.meta {
  display: flex;
  align-items: baseline;
  gap: var(--s-3);
}

.meta time {
  font-weight: 500;
}

.status {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--danger);
}

.text {
  font-size: var(--fs-base);
  color: var(--fg-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
