<script setup lang="ts">
import { ref } from 'vue'
import { api, ApiError, type MonitorReport } from '../api/client.ts'
import AppIcon from './AppIcon.vue'

/**
 * Inbound signals, loaded on demand.
 *
 * `/api/signals` walks recent posts and reads each one's replies, so it is the
 * most expensive call the dashboard can make — one per post. Loading it on
 * mount would make every page open cost the account's rate limit.
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
  <section class="panel" aria-labelledby="signals-heading">
    <div class="panel-head">
      <h2 id="signals-heading">Вхідні</h2>
      <button class="spread" :disabled="pending" @click="check(false)">
        <AppIcon name="inbox" />
        {{ pending ? 'Дивлюсь…' : 'Перевірити' }}
      </button>
    </div>

    <p v-if="error" class="panel-body error small" role="alert">{{ error }}</p>

    <p v-else-if="!report" class="panel-body muted small">
      Читання вхідних обходить кожен свіжий пост окремо, тож воно не запускається саме. Натисни
      «Перевірити», коли треба.
    </p>

    <template v-else>
      <p v-if="!report.signals.length" class="panel-body muted small" role="status">
        Нових сигналів немає.
        <button class="link" @click="check(true)">показати всі</button>
      </p>

      <ul v-else class="signals">
        <li v-for="signal in report.signals" :key="signal.id">
          <p class="tiny faint who">
            {{ KIND_LABELS[signal.kind] ?? signal.kind
            }}<template v-if="signal.matched && signal.kind === 'keyword'">
              · {{ signal.matched }}</template
            ><template v-if="signal.username"> · @{{ signal.username }}</template>
          </p>
          <p class="text">{{ signal.text }}</p>
          <a
            v-if="signal.permalink"
            class="tiny"
            :href="signal.permalink"
            target="_blank"
            rel="noreferrer noopener"
          >
            відкрити в Threads
          </a>
        </li>
      </ul>

      <!-- A blocked channel is a fact about the app's access level, not an
           error in this session — visible, understated, and named. -->
      <div v-if="report.unavailable.length" class="gaps">
        <p v-for="gap in report.unavailable" :key="gap.source" class="tiny faint">
          <AppIcon name="slash" :size="13" />
          {{ KIND_LABELS[gap.source] ?? gap.source }}: {{ gap.reason }}
        </p>
      </div>
    </template>
  </section>
</template>

<style scoped>
.signals {
  list-style: none;
  margin: 0;
  padding: 0;
}

.signals li {
  padding: var(--s-3) var(--s-5);
  border-block-start: 1px solid var(--border);
}

.signals li:first-child {
  border-block-start: none;
}

.who {
  margin-block-end: 2px;
}

.text {
  font-size: var(--fs-base);
  overflow-wrap: anywhere;
}

.gaps {
  display: grid;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-5);
  border-block-start: 1px solid var(--border);
  background: var(--surface-sunken);
  border-end-start-radius: var(--r-lg);
  border-end-end-radius: var(--r-lg);
}

.gaps p {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}
</style>
