<script setup lang="ts">
import { computed, ref } from 'vue'
import { api, ApiError, type Generation } from '../api/client.ts'
import { useDashboard } from '../composables/useDashboard.ts'
import AppIcon from './AppIcon.vue'

/**
 * Drafting. One button, one Anthropic call, nothing published.
 *
 * Every draft stays editable here: the model gets the voice and the plan, but
 * the last word is a human's, and forcing a queue-then-edit round trip through
 * the filesystem would make small fixes cost more than they should.
 */
const { settings, afterQueued, afterKept } = useDashboard()

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
const limit = computed(() => settings.data.value?.guardrails.maxLength ?? MAX_LENGTH)

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
      await afterQueued()
    } else {
      await api.keepDraft({ text, topic: drafts.value[index]?.topic, ...provenance(index) })
      await afterKept()
    }
    settled.value = new Map(settled.value).set(index, where)
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
  <section class="panel" aria-labelledby="generator-heading">
    <div class="panel-head">
      <h2 id="generator-heading">Генерація</h2>
      <p v-if="settings.data.value" class="tiny faint spread">
        {{ settings.data.value.generation.model }}
      </p>
    </div>

    <div class="panel-body form">
      <p class="small muted">
        Пише за голосом і контент-планом. Нічого не публікує: варіант іде або на полицю без слоту,
        або в чергу — і це два різні кліки.
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
        <button class="primary spread" :disabled="generating" @click="generate">
          <AppIcon name="spark" />
          {{ generating ? 'Пишу…' : 'Згенерувати' }}
        </button>
      </div>

      <p v-if="error" class="error small" role="alert">{{ error }}</p>

      <p v-if="result" class="tiny faint num" role="status">
        {{ result.usage.input }}→{{ result.usage.output }} токенів<template
          v-if="result.usage.cached"
        >
          · {{ result.usage.cached }} з кешу</template
        ><template v-if="result.id === null"> · без бази, історія не збережена</template>
      </p>
    </div>

    <ol v-if="drafts.length" class="drafts">
      <li v-for="(draft, index) in drafts" :key="index">
        <div class="head">
          <strong class="small">{{ draft.topic }}</strong>
          <span v-if="slotLabel(index)" class="tiny faint num spread">
            <AppIcon name="clock" :size="12" />
            {{ slotLabel(index) }}
          </span>
        </div>

        <p v-if="draft.note" class="tiny faint note">{{ draft.note }}</p>

        <textarea v-model="texts[index]" :aria-label="`Текст варіанта ${index + 1}`"></textarea>

        <p v-for="violation in draft.violations" :key="violation.rule" class="error tiny">
          <AppIcon name="alert" :size="12" />
          {{ violation.detail }}
        </p>

        <div class="row actions">
          <span class="tiny num" :class="(texts[index]?.length ?? 0) > limit ? 'error' : 'faint'">
            {{ texts[index]?.length ?? 0 }} / {{ limit }}
          </span>
          <!-- Keeping comes first because it is the softer of the two: a draft
               on the shelf has no slot and cannot publish, so it is the safe
               destination for anything that still needs work. -->
          <button
            class="spread"
            :disabled="settled.has(index) || busy !== undefined"
            @click="act(index, 'kept')"
          >
            <AppIcon name="shelf" />
            {{
              settled.get(index) === 'kept'
                ? 'На полиці'
                : busy === index
                  ? 'Зберігаю…'
                  : 'На полицю'
            }}
          </button>
          <button
            class="primary"
            :disabled="settled.has(index) || busy !== undefined"
            @click="act(index, 'queued')"
          >
            <AppIcon name="clock" />
            {{ settled.get(index) === 'queued' ? 'У черзі' : 'У чергу' }}
          </button>
        </div>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.form {
  display: grid;
  gap: var(--s-4);
}

.count {
  inline-size: 6rem;
}

.count input {
  font-variant-numeric: tabular-nums;
}

.row {
  align-items: end;
}

.drafts {
  list-style: none;
  margin: 0;
  padding: 0;
}

.drafts li {
  display: grid;
  gap: var(--s-2);
  padding: var(--s-4) var(--s-5);
  border-block-start: 1px solid var(--border);
}

.head {
  display: flex;
  align-items: baseline;
  gap: var(--s-3);
}

.head span {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  white-space: nowrap;
}

.note {
  margin-block-start: -0.25rem;
}

.error {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.actions {
  align-items: center;
}
</style>
