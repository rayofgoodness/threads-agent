<script setup lang="ts">
import { ref } from 'vue'
import { api, ApiError, type MonitorReport } from '../api/client.ts'

/**
 * Loaded on demand, not on mount: the endpoint reads replies post by post, so
 * it is the most expensive call in the app.
 */
const report = ref<MonitorReport>()
const pending = ref(false)
const error = ref<string>()

const KIND_LABELS: Record<string, string> = {
  reply: 'відповідь',
  mention: 'згадка',
  keyword: 'ключове слово',
}

async function check(all = false) {
  pending.value = true
  error.value = undefined
  try {
    report.value = await api.signals(all)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : String(cause)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="card" aria-labelledby="signals-heading">
    <div class="head">
      <h2 id="signals-heading">Вхідні</h2>
      <button :disabled="pending" @click="check(false)">
        {{ pending ? 'Дивлюсь…' : 'Перевірити' }}
      </button>
    </div>

    <p v-if="error" class="error small" role="alert">{{ error }}</p>

    <template v-if="report">
      <p v-if="!report.signals.length" class="muted small" role="status">
        Нових сигналів немає.
        <button class="link" @click="check(true)">показати всі</button>
      </p>

      <ul v-else class="signals">
        <li v-for="signal in report.signals" :key="signal.id">
          <span class="small muted">
            {{ KIND_LABELS[signal.kind] ?? signal.kind
            }}<template v-if="signal.matched && signal.kind === 'keyword'">
              · {{ signal.matched }}</template
            >
            <template v-if="signal.username"> · @{{ signal.username }}</template>
          </span>
          <p>{{ signal.text }}</p>
          <a v-if="signal.permalink" :href="signal.permalink" target="_blank" rel="noreferrer noopener" class="small">
            Відкрити
          </a>
        </li>
      </ul>

      <!-- A blocked channel is a fact about the app's access level, not an
           error in this session — it stays visible but understated. -->
      <p v-for="gap in report.unavailable" :key="gap.source" class="muted small gap">
        {{ KIND_LABELS[gap.source] ?? gap.source }}: {{ gap.reason }}
      </p>
    </template>
  </section>
</template>

<style scoped>
.head {
  display: flex;
  align-items: safe center;
  gap: 1rem;
  margin-block-end: 0.75rem;
}

h2 {
  font-size: 1rem;
}

.head button {
  margin-inline-start: auto;
}

.signals {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.85rem;
}

.signals li {
  border-block-start: 1px solid var(--border);
  padding-block-start: 0.7rem;
}

.signals p {
  margin: 0.2rem 0;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}

button.link {
  border: 0;
  background: none;
  color: var(--accent);
  padding: 0;
  text-decoration: underline;
}

.gap {
  margin-block: 0.6rem 0;
}
</style>
