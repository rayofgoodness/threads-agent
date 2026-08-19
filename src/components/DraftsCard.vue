<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api, ApiError, type QueueItem } from '../api/client.ts'
import { useResource } from '../composables/useResource.ts'
import StatusLine from './StatusLine.vue'

/**
 * The draft shelf: kept texts with no slot.
 *
 * Nothing here can publish — that is the whole point of the shelf. Scheduling
 * is the one door out of it, and it is a separate, deliberate click.
 */
const emit = defineEmits<{ scheduled: [] }>()

const MAX_LENGTH = 500

const drafts = useResource(api.drafts)

/** Edits by file name, so a refresh does not throw away what is being typed. */
const edits = ref(new Map<string, string>())
const busy = ref<string>()
const error = ref<string>()

const items = computed(() => drafts.data.value ?? [])

// A draft the server no longer has cannot be edited; drop its buffer so a
// deleted item does not keep text alive forever.
watch(items, (value) => {
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
    emit('scheduled')
  })

const drop = (item: QueueItem) => run(item.file, () => api.dropDraft(item.file))

defineExpose({ refresh: drafts.refresh })
</script>

<template>
  <section class="card" aria-labelledby="drafts-heading">
    <div class="head">
      <h2 id="drafts-heading">Чернетки</h2>
      <button :disabled="drafts.pending.value" @click="drafts.refresh">Оновити</button>
    </div>

    <StatusLine
      :error="drafts.error.value"
      :pending="drafts.pending.value && !drafts.loaded.value"
    />

    <p v-if="drafts.loaded.value && !items.length" class="small muted">
      Порожньо. Згенеровані пости можна зберегти сюди — вони чекатимуть без слоту.
    </p>

    <p v-if="error" class="error small" role="alert">{{ error }}</p>

    <ul>
      <li v-for="item in items" :key="item.file">
        <p v-if="item.topic" class="small muted topic">{{ item.topic }}</p>

        <textarea
          :value="textOf(item)"
          :disabled="busy === item.file"
          :aria-label="`Текст чернетки ${item.file}`"
          @input="edit(item, ($event.target as HTMLTextAreaElement).value)"
        ></textarea>

        <div class="row">
          <span class="small" :class="textOf(item).length > MAX_LENGTH ? 'error' : 'muted'">
            {{ textOf(item).length }} / {{ MAX_LENGTH }}
          </span>
          <button v-if="changed(item)" :disabled="busy === item.file" @click="save(item)">
            Зберегти
          </button>
          <button class="primary" :disabled="busy === item.file" @click="schedule(item)">
            У чергу
          </button>
          <button class="danger" :disabled="busy === item.file" @click="drop(item)">
            Видалити
          </button>
        </div>
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
  gap: 1rem;
}

li {
  border-block-start: 1px solid var(--border);
  padding-block-start: 0.85rem;
}

li:first-child {
  border-block-start: none;
  padding-block-start: 0;
}

.topic {
  margin-block: 0 0.4rem;
}

textarea {
  min-block-size: 4lh;
}

.row {
  display: flex;
  align-items: safe center;
  gap: 0.5rem;
  margin-block-start: 0.5rem;
}

.row span {
  margin-inline-end: auto;
}

p {
  margin-block: 0.5rem 0;
}
</style>
