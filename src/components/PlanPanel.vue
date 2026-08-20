<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api, ApiError } from '../api/client.ts'
import { useDashboard } from '../composables/useDashboard.ts'
import AppIcon from './AppIcon.vue'

/**
 * The content plan: one markdown file, edited as text.
 *
 * Deliberately not a task-list widget. The file is also the model's context —
 * free prose about direction matters as much as the checkboxes — and a form
 * would quietly drop everything that is not a topic line.
 */
const { plan } = useDashboard()

const draft = ref('')
const saving = ref(false)
const error = ref<string>()

watch(plan.data, (value) => {
  if (value && !dirty.value) draft.value = value.raw
})

const dirty = computed(() => Boolean(plan.data.value) && draft.value !== plan.data.value?.raw)
const open = computed(() => plan.data.value?.topics.filter((topic) => !topic.done) ?? [])
const total = computed(() => plan.data.value?.topics.length ?? 0)

async function save() {
  if (saving.value) return
  saving.value = true
  error.value = undefined
  try {
    const saved = await api.savePlan(draft.value)
    plan.data.value = saved
    draft.value = saved.raw
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : String(cause)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="panel" aria-labelledby="plan-heading">
    <div class="panel-head">
      <h2 id="plan-heading">Контент-план</h2>
      <p class="tiny faint spread num">{{ open.length }} відкритих з {{ total }}</p>
    </div>

    <p v-if="plan.error.value" class="panel-body error small" role="alert">{{ plan.error.value }}</p>

    <div v-else class="panel-body body">
      <ul v-if="open.length" class="topics">
        <li v-for="topic in open.slice(0, 5)" :key="topic.line">
          <AppIcon name="pen" :size="13" />
          {{ topic.text }}
        </li>
      </ul>

      <!-- `- [ ] тема` is the only line the generator reads as a topic; the
           rest is context it still sees. -->
      <textarea
        v-model="draft"
        :disabled="saving || (plan.pending.value && !plan.loaded.value)"
        aria-label="Текст контент-плану"
        placeholder="## Теми&#10;- [ ] Перша тема"
      ></textarea>

      <div class="row">
        <span class="tiny faint">Тема — рядок виду <code>- [ ] текст</code></span>
        <button class="primary spread" :disabled="!dirty || saving" @click="save">
          <AppIcon name="check" />
          {{ saving ? 'Зберігаю…' : 'Зберегти план' }}
        </button>
      </div>

      <p v-if="error" class="error small" role="alert">{{ error }}</p>
    </div>
  </section>
</template>

<style scoped>
.body {
  display: grid;
  gap: var(--s-3);
}

.topics {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--s-2);
}

.topics li {
  display: flex;
  align-items: baseline;
  gap: var(--s-2);
  font-size: var(--fs-base);
  color: var(--fg-2);
}

textarea {
  min-block-size: 8lh;
  font-family: var(--font-mono);
  font-size: var(--fs-base);
}
</style>
