<script setup lang="ts">
import { computed } from 'vue'
import { api } from '../api/client.ts'
import { useResource } from '../composables/useResource.ts'
import StatusLine from './StatusLine.vue'

/**
 * What is waiting to go out. Read-only on purpose: publishing is the
 * scheduler's job, and a delete button here would be a second, quieter way to
 * change what the account says.
 */
const queue = useResource(api.queue)

const items = computed(() => queue.data.value ?? [])

function when(value?: string): string {
  if (!value) return 'без часу'
  return new Date(value).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })
}

defineExpose({ refresh: queue.refresh })
</script>

<template>
  <section class="card" aria-labelledby="queue-heading">
    <div class="head">
      <h2 id="queue-heading">Черга</h2>
      <button :disabled="queue.pending.value" @click="queue.refresh">Оновити</button>
    </div>

    <StatusLine :error="queue.error.value" :pending="queue.pending.value && !queue.loaded.value" />

    <p v-if="queue.loaded.value && !items.length" class="small muted">
      Черга порожня. Згенеруй або додай пост вище.
    </p>

    <ul>
      <li v-for="item in items" :key="item.file">
        <div class="meta small muted">
          <span>{{ when(item.publishAt) }}</span>
          <span v-if="item.status !== 'queued'" class="error">{{ item.status }}</span>
        </div>
        <p>{{ item.text }}</p>
        <p v-if="item.note" class="error small">{{ item.note }}</p>
      </li>
    </ul>
  </section>
</template>

<style scoped>
h2 {
  font-size: 1rem;
}

.head {
  display: flex;
  align-items: safe center;
  gap: 1rem;
  margin-block-end: 0.75rem;
}

.head button {
  margin-inline-start: auto;
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.85rem;
}

li {
  border-block-start: 1px solid var(--border);
  padding-block-start: 0.7rem;
}

li:first-child {
  border-block-start: none;
  padding-block-start: 0;
}

.meta {
  display: flex;
  gap: 0.75rem;
}

p {
  margin-block: 0.35rem 0;
  white-space: pre-wrap;
}
</style>
