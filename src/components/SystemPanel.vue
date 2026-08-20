<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '../composables/useDashboard.ts'
import AppIcon from './AppIcon.vue'

/**
 * Everything that is true about the machine rather than about the content.
 *
 * Including what does not run: the keyword channel is off by decision, and an
 * inbox that is quiet because nothing was searched must not read like an inbox
 * that is quiet because nothing was said.
 */
const { token, limits, db, settings, tokenDays } = useDashboard()

const scopes = computed(() => token.data.value?.scopes ?? [])

const expiry = computed(() => {
  const at = token.data.value?.expiresAt
  return at ? new Date(at).toLocaleDateString('uk-UA', { dateStyle: 'long' }) : undefined
})

const urgent = computed(() => tokenDays.value !== undefined && tokenDays.value <= 14)

const watchWords = computed(() => settings.data.value?.monitor.keywords ?? [])

// Undefined while the config is still loading — treat that as «on» so the
// panel does not flash a disabled notice it may have to take back.
const keywordSearchOff = computed(() => settings.data.value?.monitor.keywordSearch === false)
</script>

<template>
  <div class="stack">
    <section class="panel" aria-labelledby="token-heading">
      <div class="panel-head">
        <h2 id="token-heading">Доступ</h2>
      </div>

      <div class="panel-body grid">
        <div>
          <p class="eyebrow">Токен</p>
          <p v-if="token.data.value" class="value" :class="{ warn: urgent }">
            {{ token.data.value.valid ? 'дійсний' : 'недійсний' }}
            <span v-if="tokenDays !== undefined" class="num">· {{ tokenDays }} дн.</span>
          </p>
          <p v-else class="value faint">—</p>
          <p v-if="expiry" class="tiny faint">до {{ expiry }}</p>
        </div>

        <div>
          <p class="eyebrow">Публікації за добу</p>
          <p v-if="limits.data.value" class="value num">
            {{ limits.data.value.quota_usage }}
            <span class="faint">/ {{ limits.data.value.config.quota_total }}</span>
          </p>
          <p v-else class="value faint">—</p>
        </div>

        <div>
          <p class="eyebrow">Історія генерацій</p>
          <p class="value">
            {{ db.data.value?.enabled ? 'увімкнена' : 'вимкнена' }}
          </p>
          <p v-if="db.data.value?.enabled === false" class="tiny faint">
            нема <code>DATABASE_URL</code>
          </p>
        </div>
      </div>

      <div v-if="urgent" class="strip warn-strip">
        <AppIcon name="alert" :size="14" />
        <p class="small">
          Токен треба перевидати вручну — User Token Generator у застосунку, далі обмін на
          60-денний. Після того, як він спливе, доведеться авторизувати акаунт наново.
        </p>
      </div>

      <div v-if="scopes.length" class="scopes">
        <p class="eyebrow">Дозволи</p>
        <ul>
          <li v-for="scope in scopes" :key="scope" class="tiny num">{{ scope }}</li>
        </ul>
      </div>
    </section>

    <section class="panel" aria-labelledby="channels-heading">
      <div class="panel-head">
        <h2 id="channels-heading">Канали вхідних</h2>
      </div>

      <ul class="blocked">
        <li>
          <AppIcon name="check" :size="14" />
          <div>
            <p class="small">Відповіді та згадки</p>
            <p class="tiny faint">
              Читаються. Відповіді — обходом власних постів, бо <code>/me/replies</code> віддає
              написані акаунтом, а не адресовані йому.
            </p>
          </div>
        </li>
        <li v-if="keywordSearchOff">
          <AppIcon name="slash" :size="14" />
          <div>
            <p class="small">Пошук за словом поза акаунтом — вимкнено</p>
            <p class="tiny faint">
              Не помилка, а рішення. Поза власним акаунтом пошук вимагає Advanced Access, той —
              підтвердженої компанії, а юрособи за акаунтом немає. На базовому рівні
              <code>keyword_search</code> віддавав лише власні пости, тож монітор його більше не
              викликає.
              <template v-if="watchWords.length">
                Слова лишені напоготові: {{ watchWords.join(', ') }}.
              </template>
            </p>
          </div>
        </li>
        <li v-else>
          <AppIcon name="check" :size="14" />
          <div>
            <p class="small">Пошук за словом</p>
            <p class="tiny faint">
              <template v-if="watchWords.length">
                Слова: {{ watchWords.join(', ') }}.
              </template>
              <template v-else>Слів для стеження не задано.</template>
            </p>
          </div>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: var(--s-5);
}

.value {
  font-size: var(--fs-lg);
  font-weight: 600;
  line-height: 1.3;
  margin-block-start: var(--s-1);
}

.value.warn {
  color: var(--warn);
}

.strip {
  display: flex;
  align-items: start;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-5);
  border-block-start: 1px solid var(--border);
  background: var(--warn-soft);
  color: var(--warn);
}

.scopes {
  padding: var(--s-4) var(--s-5);
  border-block-start: 1px solid var(--border);
}

.scopes ul {
  list-style: none;
  margin: var(--s-2) 0 0;
  padding: 0;
  display: flex;
  flex-flow: row wrap;
  gap: var(--s-2);
}

.scopes li {
  padding: 0.125rem 0.4rem;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--surface-sunken);
  color: var(--fg-2);
}

.blocked {
  list-style: none;
  margin: 0;
  padding: 0;
}

.blocked li {
  display: flex;
  align-items: start;
  gap: var(--s-3);
  padding: var(--s-4) var(--s-5);
  border-block-start: 1px solid var(--border);
  color: var(--fg-3);
}

.blocked li:first-child {
  border-block-start: none;
}

.blocked p:first-child {
  color: var(--fg);
  font-weight: 500;
  margin-block-end: 2px;
}
</style>
