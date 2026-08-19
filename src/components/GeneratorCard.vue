<script setup lang="ts">
import { computed, ref } from 'vue'
import { api, ApiError, type Generation } from '../api/client.ts'

/**
 * Drafting. One button, one Anthropic call, nothing published.
 *
 * Every draft stays editable here: the model gets the voice and the plan, but
 * the last word is a human's, and forcing a queue-then-edit round trip through
 * the filesystem would make small fixes cost more than they should.
 */
const emit = defineEmits<{ queued: []; kept: [] }>()

const MAX_LENGTH = 500

const brief = ref('')
const count = ref(3)
const generating = ref(false)
const error = ref<string>()
const result = ref<Generation>()

/** Local, editable copies — the returned drafts are the starting point. */
const texts = ref<string[]>([])
/** Index → what happened to it, so a handled draft stops offering both buttons. */
const settled = ref(new Map<number, 'queued' | 'kept'>())
const busy = ref<number>()

const drafts = computed(() => result.value?.drafts ?? [])

async function generate() {
  if (generating.value) return
  generating.value = true
  error.value = undefined
  try {
    const generation = await api.generate({
      brief: brief.value.trim() || undefined,
      count: count.value,
    })
    result.value = generation
    texts.value = generation.drafts.map((draft) => draft.text)
    settled.value = new Map()
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : String(cause)
  } finally {
    generating.value = false
  }
}

/** Fields both destinations record: which topic it answered, which call it came from. */
function provenance(index: number) {
  const draft = drafts.value[index]
  return {
    // Only tick the plan line when the text still answers that topic; an
    // edited draft may no longer, but that call is the reviewer's, not ours.
    ...(draft?.planLine !== undefined ? { planLine: draft.planLine } : {}),
    ...(result.value?.id !== null && result.value?.id !== undefined
      ? { generationId: result.value.id, position: index }
      : {}),
  }
}

async function act(index: number, where: 'queued' | 'kept') {
  const text = texts.value[index]
  if (!text || busy.value !== undefined) return

  busy.value = index
  error.value = undefined
  try {
    if (where === 'queued') {
      await api.enqueue({ text, publishAt: result.value?.slots[index], ...provenance(index) })
    } else {
      await api.keepDraft({ text, topic: drafts.value[index]?.topic, ...provenance(index) })
    }
    settled.value = new Map(settled.value).set(index, where)
    if (where === 'queued') emit('queued')
    else emit('kept')
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : String(cause)
  } finally {
    busy.value = undefined
  }
}

function slotLabel(index: number): string {
  const slot = result.value?.slots[index]
  if (!slot) return ''
  return new Date(slot).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' })
}
</script>

<template>
  <section class="card" aria-labelledby="generator-heading">
    <h2 id="generator-heading">Генерація</h2>
    <p class="small muted">
      Пише за голосом і контент-планом. Нічого не публікує — чернетки йдуть у чергу вручну.
    </p>

    <label>
      Завдання на цю генерацію — необовʼязково
      <textarea
        v-model="brief"
        rows="2"
        :disabled="generating"
        placeholder="Напр.: про те, що клієнтки пишуть о 23:00, а відповідь чекають зранку"
      ></textarea>
    </label>

    <div class="row">
      <label class="count">
        Варіантів
        <input v-model.number="count" type="number" min="1" max="5" :disabled="generating" />
      </label>
      <button class="primary" :disabled="generating" @click="generate">
        {{ generating ? 'Пишу…' : 'Згенерувати' }}
      </button>
    </div>

    <p v-if="error" class="error small" role="alert">{{ error }}</p>

    <p v-if="result" class="small muted" role="status">
      {{ result.model }} · {{ result.usage.input }}→{{ result.usage.output }} токенів<template
        v-if="result.usage.cached"
      >
        · {{ result.usage.cached }} з кешу</template
      ><template v-if="result.id === null"> · без бази, історія не збережена</template>
    </p>

    <ol v-if="drafts.length" class="drafts">
      <li v-for="(draft, index) in drafts" :key="index">
        <div class="head">
          <strong>{{ draft.topic }}</strong>
          <span class="small muted">{{ slotLabel(index) }}</span>
        </div>
        <p class="small muted note">{{ draft.note }}</p>

        <textarea v-model="texts[index]" :aria-label="`Текст варіанта ${index + 1}`"></textarea>

        <div class="row actions">
          <span
            class="small"
            :class="(texts[index]?.length ?? 0) > MAX_LENGTH ? 'error' : 'muted'"
          >
            {{ texts[index]?.length ?? 0 }} / {{ MAX_LENGTH }}
          </span>
          <!-- Keeping is the softer of the two and comes first: a draft on the
               shelf has no slot and cannot publish, so it is the safe default
               for anything that still needs work. -->
          <button
            :disabled="settled.has(index) || busy !== undefined"
            @click="act(index, 'kept')"
          >
            {{
              settled.get(index) === 'kept'
                ? 'У чернетках'
                : busy === index
                  ? 'Зберігаю…'
                  : 'У чернетки'
            }}
          </button>
          <button
            class="primary"
            :disabled="settled.has(index) || busy !== undefined"
            @click="act(index, 'queued')"
          >
            {{ settled.get(index) === 'queued' ? 'У черзі' : 'У чергу' }}
          </button>
        </div>

        <p v-for="violation in draft.violations" :key="violation.rule" class="error small">
          {{ violation.detail }}
        </p>
      </li>
    </ol>
  </section>
</template>

<style scoped>
h2 {
  font-size: 1rem;
}

label {
  margin-block-start: 0.85rem;
}

label textarea {
  min-block-size: 3lh;
}

.row {
  display: flex;
  align-items: safe end;
  gap: 1rem;
  margin-block-start: 0.75rem;
}

.row button {
  margin-inline-start: auto;
}

/* Two buttons here, so only the first one takes the free space. */
.actions button + button {
  margin-inline-start: 0;
}

.count {
  inline-size: 6rem;
}

.drafts {
  list-style: none;
  margin: 1rem 0 0;
  padding: 0;
  display: grid;
  gap: 1rem;
}

.drafts li {
  border-block-start: 1px solid var(--border);
  padding-block-start: 0.85rem;
}

.head {
  display: flex;
  align-items: safe center;
  gap: 1rem;
}

.head span {
  margin-inline-start: auto;
  white-space: nowrap;
}

.note {
  margin-block: 0.25rem 0.6rem;
}

p {
  margin-block: 0.6rem 0;
}
</style>
