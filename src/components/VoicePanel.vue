<script setup lang="ts">
import { ref, watch } from 'vue'
import { api, ApiError, type Voice } from '../api/client.ts'
import { useResource } from '../composables/useResource.ts'
import AppIcon from './AppIcon.vue'

/**
 * Tone of voice — what the generator writes from.
 *
 * The list fields are edited as one item per line rather than as a tag widget:
 * a rule is a sentence, and a textarea is the only control that does not fight
 * that. The parsing is trivially reversible, so nothing is lost on a round trip.
 */
const loaded = useResource(api.voice)

const draft = ref<Voice>()
const saving = ref(false)
const saved = ref(false)
const error = ref<string>()

// The form is a local copy: editing must not mutate the loaded value, or a
// failed save would leave the panel showing changes that never reached disk.
watch(loaded.data, (value) => {
  if (value) draft.value = structuredClone(value)
})

const lines = (value: string[]) => value.join('\n')
const parse = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

function edit<K extends keyof Voice>(key: K, value: Voice[K]) {
  if (draft.value) draft.value[key] = value
  saved.value = false
}

async function save() {
  if (!draft.value || saving.value) return
  saving.value = true
  error.value = undefined
  saved.value = false
  try {
    loaded.data.value = await api.saveVoice(draft.value)
    saved.value = true
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : String(cause)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="panel" aria-labelledby="voice-heading">
    <div class="panel-head">
      <h2 id="voice-heading">Голос</h2>
      <p class="tiny faint spread">іде в кожну генерацію</p>
    </div>

    <p v-if="loaded.error.value" class="panel-body error small" role="alert">
      {{ loaded.error.value }}
    </p>

    <p v-else-if="!draft" class="panel-body muted small">Читаю голос…</p>

    <div v-else class="panel-body fields">
      <label>
        Хто говорить
        <textarea
          :value="draft.persona"
          rows="2"
          @input="edit('persona', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
      </label>

      <label>
        До кого
        <textarea
          :value="draft.audience"
          rows="2"
          @input="edit('audience', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
      </label>

      <div class="pair">
        <label>
          Мова постів
          <input
            type="text"
            :value="draft.language"
            @input="edit('language', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label>
          Емодзі
          <select
            :value="draft.emoji"
            @change="edit('emoji', ($event.target as HTMLSelectElement).value as Voice['emoji'])"
          >
            <option value="none">не використовувати</option>
            <option value="sparingly">рідко</option>
            <option value="free">вільно</option>
          </select>
        </label>
      </div>

      <label>
        Тон — по одному слову на рядок
        <textarea
          :value="lines(draft.tone)"
          @input="edit('tone', parse(($event.target as HTMLTextAreaElement).value))"
        ></textarea>
      </label>

      <label>
        Правила — по одному на рядок
        <textarea
          :value="lines(draft.rules)"
          @input="edit('rules', parse(($event.target as HTMLTextAreaElement).value))"
        ></textarea>
      </label>

      <label>
        Ніколи — по одному на рядок
        <textarea
          :value="lines(draft.avoid)"
          @input="edit('avoid', parse(($event.target as HTMLTextAreaElement).value))"
        ></textarea>
      </label>

      <label>
        Фрагменти в потрібному голосі — по одному на рядок
        <textarea
          :value="lines(draft.samples)"
          @input="edit('samples', parse(($event.target as HTMLTextAreaElement).value))"
        ></textarea>
      </label>

      <div class="row">
        <span v-if="saved" class="tiny muted" role="status">Записано в agent.config.json</span>
        <button class="primary spread" :disabled="saving" @click="save">
          <AppIcon name="check" />
          {{ saving ? 'Зберігаю…' : 'Зберегти' }}
        </button>
      </div>

      <p v-if="error" class="small error" role="alert">{{ error }}</p>
    </div>
  </section>
</template>

<style scoped>
.fields {
  display: grid;
  gap: var(--s-4);
}

.pair {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: var(--s-4);
}

.fields textarea {
  min-block-size: 3lh;
}
</style>
