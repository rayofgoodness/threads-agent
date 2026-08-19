<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api, ApiError } from '../api/client.ts'
import { useResource } from '../composables/useResource.ts'
import StatusLine from './StatusLine.vue'

/**
 * The content plan: one markdown file, edited as text.
 *
 * Deliberately not a task list widget. The file is also the model's context —
 * free prose about direction matters as much as the checkboxes — and a form
 * would quietly drop everything that is not a topic line.
 */
const loaded = useResource(api.plan)

const draft = ref('')
const saving = ref(false)
const error = ref<string>()

watch(loaded.data, (value) => {
  if (value && !dirty.value) draft.value = value.raw
})

const dirty = computed(() => Boolean(loaded.data.value) && draft.value !== loaded.data.value?.raw)
const open = computed(() => loaded.data.value?.topics.filter((topic) => !topic.done) ?? [])
const total = computed(() => loaded.data.value?.topics.length ?? 0)

async function save() {
  if (saving.value) return
  saving.value = true
  error.value = undefined
  try {
    const plan = await api.savePlan(draft.value)
    loaded.data.value = plan
    draft.value = plan.raw
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : String(cause)
  } finally {
    saving.value = false
  }
}

defineExpose({ refresh: loaded.refresh })
</script>

<template>
  <section class="card" aria-labelledby="plan-heading">
    <div class="head">
      <h2 id="plan-heading">Контент-план</h2>
      <span class="small muted">{{ open.length }} відкритих з {{ total }}</span>
    </div>

    <StatusLine :error="loaded.error.value" :pending="loaded.pending.value && !loaded.loaded.value" />

    <!-- `- [ ] тема` is the only line the generator reads as a topic; the rest
         is context it still sees. -->
    <textarea
      v-model="draft"
      :disabled="saving"
      aria-label="Текст контент-плану"
      placeholder="## Теми&#10;- [ ] Перша тема"
    ></textarea>

    <div class="row">
      <span class="small muted">Теми: рядки виду <code>- [ ] текст</code></span>
      <button class="primary" :disabled="!dirty || saving" @click="save">
        {{ saving ? 'Зберігаю…' : 'Зберегти план' }}
      </button>
    </div>

    <p v-if="error" class="error small" role="alert">{{ error }}</p>
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

.head span {
  margin-inline-start: auto;
}

textarea {
  min-block-size: 8lh;
}

.row {
  display: flex;
  align-items: safe center;
  gap: 1rem;
  margin-block-start: 0.75rem;
}

.row button {
  margin-inline-start: auto;
}

code {
  font-size: 0.85em;
}

p {
  margin-block: 0.6rem 0;
}
</style>
