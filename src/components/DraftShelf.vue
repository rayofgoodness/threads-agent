<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api, ApiError, type QueueItem } from '../api/client.ts'
import { useDashboard } from '../composables/useDashboard.ts'
import AppIcon from './AppIcon.vue'

/**
 * The draft shelf: kept texts with no slot.
 *
 * Nothing here can publish — that is the whole point of the shelf. Scheduling
 * is the one door out of it, and it is a separate, deliberate click.
 */
const { drafts, shelf, settings, afterScheduled } = useDashboard()

/** Edits by file name, so a refresh does not throw away what is being typed. */
const edits = ref(new Map<string, string>())
const busy = ref<string>()
const error = ref<string>()

const limit = computed(() => settings.data.value?.guardrails.maxLength ?? 500)

// A draft the server no longer has cannot be edited; drop its buffer so a
// deleted item does not keep text alive forever.
watch(shelf, (value) => {
  const alive = new Set(value.map((item) => item.file))
  for (const file of edits.value.keys()) if (!alive.has(file)) edits.value.delete(file)
})

const textOf = (item: QueueItem) => edits.value.get(item.file) ?? item.text
const changed = (item: QueueItem) => textOf(item) !== item.text

function edit(item: QueueItem, value: string) {
  edits.value = new Map(edits.value).set(item.file, value)
}

async function run(file: string, action: () => Promise<unknown>) {
  if (busy.value) return
  busy.value = file
  error.value = undefined
  try {
    await action()
    await drafts.refresh()
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : String(cause)
  } finally {
    busy.value = undefined
  }
}

const save = (item: QueueItem) =>
  run(item.file, async () => {
    await api.updateDraft(item.file, textOf(item))
    edits.value.delete(item.file)
  })

const schedule = (item: QueueItem) =>
  run(item.file, async () => {
    // Save first: scheduling an edited draft must carry the edit, not the
    // version still on disk.
    if (changed(item)) await api.updateDraft(item.file, textOf(item))
    await api.scheduleDraft(item.file)
    await afterScheduled()
  })

const drop = (item: QueueItem) => run(item.file, () => api.dropDraft(item.file))
</script>

<template>
  <section class="panel" aria-labelledby="shelf-heading">
    <div class="panel-head">
      <h2 id="shelf-heading">Полиця</h2>
      <p class="tiny faint spread num">{{ shelf.length }} без слоту</p>
    </div>

    <p v-if="drafts.error.value" class="panel-body error small" role="alert">
      {{ drafts.error.value }}
    </p>

    <p v-else-if="drafts.pending.value && !drafts.loaded.value" class="panel-body muted small">
      Читаю полицю…
    </p>

    <p v-else-if="!shelf.length" class="panel-body muted small">
      Порожньо. Згенерований варіант можна відкласти сюди — він чекатиме без слоту й ніколи не
      опублікується сам.
    </p>

    <p v-if="error" class="panel-body error small" role="alert">{{ error }}</p>

    <ul v-if="shelf.length" class="items">
      <li v-for="item in shelf" :key="item.file">
        <p v-if="item.topic" class="tiny faint">{{ item.topic }}</p>

        <textarea
          :value="textOf(item)"
          :disabled="busy === item.file"
          :aria-label="`Текст чернетки ${item.file}`"
          @input="edit(item, ($event.target as HTMLTextAreaElement).value)"
        ></textarea>

        <div class="row">
          <span class="tiny num" :class="textOf(item).length > limit ? 'error' : 'faint'">
            {{ textOf(item).length }} / {{ limit }}
          </span>
          <button
            v-if="changed(item)"
            class="spread"
            :disabled="busy === item.file"
            @click="save(item)"
          >
            <AppIcon name="check" />
            Зберегти
          </button>
          <button
            class="primary"
            :class="{ spread: !changed(item) }"
            :disabled="busy === item.file"
            @click="schedule(item)"
          >
            <AppIcon name="clock" />
            У чергу
          </button>
          <button
            class="danger"
            :disabled="busy === item.file"
            :aria-label="`Видалити чернетку ${item.file}`"
            @click="drop(item)"
          >
            <AppIcon name="trash" />
          </button>
        </div>
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
  gap: var(--s-2);
  padding: var(--s-4) var(--s-5);
  border-block-start: 1px solid var(--border);
}

.items li:first-child {
  border-block-start: none;
}
</style>
