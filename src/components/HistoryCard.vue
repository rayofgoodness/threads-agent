<script setup lang="ts">
import { computed } from 'vue'
import { api, ApiError, type GenerationRecord } from '../api/client.ts'
import { useResource } from '../composables/useResource.ts'
import StatusLine from './StatusLine.vue'
import { ref } from 'vue'

/**
 * What was generated before, and what became of it.
 *
 * Kept in Postgres rather than in `content/`: a text that was written and then
 * discarded is worth remembering, but it is not content, and it would only add
 * noise to a directory whose whole value is that every file in it is real.
 */
const emit = defineEmits<{ kept: [] }>()

const status = useResource(api.dbStatus)
const history = useResource(() => api.generations(10))

const items = computed(() => history.data.value ?? [])
const off = computed(() => status.data.value?.enabled === false)

const busy = ref<string>()
const error = ref<string>()

function when(value: string): string {
  return new Date(value).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })
}

/** Pulls an old draft back onto the shelf so it can be worked on again. */
async function keep(record: GenerationRecord, position: number) {
  const draft = record.drafts.find((candidate) => candidate.position === position)
  const key = `${record.id}:${position}`
  if (!draft || busy.value) return

  busy.value = key
  error.value = undefined
  try {
    await api.keepDraft({ text: draft.text, topic: draft.topic })
    emit('kept')
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : String(cause)
  } finally {
    busy.value = undefined
  }
}

defineExpose({ refresh: history.refresh })
</script>

<template>
  <section class="card" aria-labelledby="history-heading">
    <div class="head">
      <h2 id="history-heading">Історія генерацій</h2>
      <button :disabled="history.pending.value" @click="history.refresh">Оновити</button>
    </div>

    <p v-if="off" class="small muted">
      Історія не ведеться — нема <code>DATABASE_URL</code>. Підняти базу:
      <code>npm run db:up &amp;&amp; npm run db:migrate</code>.
    </p>

    <template v-else>
      <StatusLine
        :error="history.error.value"
        :pending="history.pending.value && !history.loaded.value"
      />

      <p v-if="history.loaded.value && !items.length" class="small muted">
        Ще нічого не генерувалося.
      </p>

      <p v-if="error" class="error small" role="alert">{{ error }}</p>

      <ol class="runs">
        <li v-for="record in items" :key="record.id">
          <div class="head">
            <span class="small muted">{{ when(record.createdAt) }}</span>
            <span class="small muted">
              {{ record.inputTokens }}→{{ record.outputTokens }}
              <template v-if="record.cachedTokens">· {{ record.cachedTokens }} з кешу</template>
            </span>
          </div>

          <p v-if="record.brief" class="small brief">{{ record.brief }}</p>

          <ul>
            <li v-for="draft in record.drafts" :key="draft.position">
              <div class="draft-head">
                <strong class="small">{{ draft.topic }}</strong>
                <button
                  :disabled="busy === `${record.id}:${draft.position}`"
                  @click="keep(record, draft.position)"
                >
                  У чернетки
                </button>
              </div>
              <p class="small">{{ draft.text }}</p>
              <p v-if="draft.status === 'queued'" class="small muted">
                пішло далі · {{ draft.queueFile }}
              </p>
            </li>
          </ul>
        </li>
      </ol>
    </template>
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
  margin-block-end: 0.5rem;
}

.head button {
  margin-inline-start: auto;
}

.runs {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 1rem;
}

.runs > li {
  border-block-start: 1px solid var(--border);
  padding-block-start: 0.85rem;
}

.runs > li:first-child {
  border-block-start: none;
  padding-block-start: 0;
}

.runs ul {
  list-style: none;
  margin: 0.5rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}

.runs ul li {
  border-inline-start: 2px solid var(--border);
  padding-inline-start: 0.7rem;
}

.draft-head {
  display: flex;
  align-items: safe center;
  gap: 0.75rem;
}

.draft-head button {
  margin-inline-start: auto;
  padding: 0.2rem 0.5rem;
  font-size: 0.8rem;
}

.brief {
  margin-block: 0.25rem;
  color: var(--muted);
}

p {
  margin-block: 0.35rem 0;
  white-space: pre-wrap;
}
</style>
