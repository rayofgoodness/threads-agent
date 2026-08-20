<script setup lang="ts">
import { computed, ref } from 'vue'
import { api, ApiError, type GenerationRecord } from '../api/client.ts'
import { useResource } from '../composables/useResource.ts'
import { useDashboard } from '../composables/useDashboard.ts'
import AppIcon from './AppIcon.vue'

/**
 * What was generated before, and what became of it.
 *
 * Kept in Postgres rather than in `content/`: a text that was written and then
 * discarded is worth remembering, but it is not content, and it would only add
 * noise to a directory whose whole value is that every file in it is real.
 */
const { db, afterKept } = useDashboard()

const history = useResource(() => api.generations(10))

const items = computed(() => history.data.value ?? [])
const off = computed(() => db.data.value?.enabled === false)

const busy = ref<string>()
const error = ref<string>()
const openRun = ref<number>()

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
    await afterKept()
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : String(cause)
  } finally {
    busy.value = undefined
  }
}
</script>

<template>
  <section class="panel" aria-labelledby="history-heading">
    <div class="panel-head">
      <h2 id="history-heading">Історія генерацій</h2>
      <button v-if="!off" class="quiet spread" :disabled="history.pending.value" @click="history.refresh">
        <AppIcon name="refresh" />
        Оновити
      </button>
    </div>

    <p v-if="off" class="panel-body muted small">
      Історія не ведеться — нема <code>DATABASE_URL</code>. Без неї варіант, який не забрали
      відразу, зникає назавжди. Підняти базу:
      <code>npm run db:up &amp;&amp; npm run db:migrate</code>.
    </p>

    <template v-else>
      <p v-if="history.error.value" class="panel-body error small" role="alert">
        {{ history.error.value }}
      </p>

      <p
        v-else-if="history.pending.value && !history.loaded.value"
        class="panel-body muted small"
      >
        Читаю історію…
      </p>

      <p v-else-if="!items.length" class="panel-body muted small">Ще нічого не генерувалося.</p>

      <p v-if="error" class="panel-body error small" role="alert">{{ error }}</p>

      <ol v-if="items.length" class="runs">
        <li v-for="record in items" :key="record.id">
          <button
            class="quiet run-head"
            :aria-expanded="openRun === record.id"
            @click="openRun = openRun === record.id ? undefined : record.id"
          >
            <time class="num small" :datetime="record.createdAt">{{ when(record.createdAt) }}</time>
            <span class="tiny faint brief">{{ record.brief ?? 'без завдання' }}</span>
            <span class="tiny faint num spread">
              {{ record.drafts.length }} вар. · {{ record.inputTokens }}→{{ record.outputTokens }}
            </span>
          </button>

          <ul v-if="openRun === record.id" class="drafts">
            <li v-for="draft in record.drafts" :key="draft.position">
              <div class="draft-head">
                <strong class="tiny">{{ draft.topic }}</strong>
                <span v-if="draft.status === 'queued'" class="tiny faint spread">
                  пішло далі · {{ draft.queueFile }}
                </span>
                <button
                  :class="{ spread: draft.status !== 'queued' }"
                  :disabled="busy === `${record.id}:${draft.position}`"
                  @click="keep(record, draft.position)"
                >
                  <AppIcon name="shelf" />
                  На полицю
                </button>
              </div>
              <p class="text">{{ draft.text }}</p>
            </li>
          </ul>
        </li>
      </ol>
    </template>
  </section>
</template>

<style scoped>
.runs {
  list-style: none;
  margin: 0;
  padding: 0;
}

.runs > li {
  border-block-start: 1px solid var(--border);
}

.run-head {
  inline-size: 100%;
  justify-content: flex-start;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-5);
  border-radius: 0;
  min-block-size: 2.75rem;
}

.brief {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-inline-size: 0;
}

.drafts {
  list-style: none;
  margin: 0;
  padding: 0 var(--s-5) var(--s-4);
  display: grid;
  gap: var(--s-3);
}

.drafts > li {
  display: grid;
  gap: var(--s-1);
  padding-inline-start: var(--s-3);
  border-inline-start: 1px solid var(--border);
}

.draft-head {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.draft-head button {
  min-block-size: 1.75rem;
  padding: 0.125rem var(--s-2);
  font-size: var(--fs-sm);
}

.text {
  font-size: var(--fs-base);
  color: var(--fg-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
