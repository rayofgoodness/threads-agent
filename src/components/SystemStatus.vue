<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '../composables/useDashboard.ts'
import AppIcon from './AppIcon.vue'

/**
 * The three facts that are true regardless of which screen is open: how much
 * of today's quota is spent, how long the token still works, and what the
 * token is allowed to do.
 *
 * Each reads neutral until it is worth reacting to. A row of permanently
 * coloured chips teaches the eye to ignore colour, which is the one thing
 * this bar cannot afford.
 */
const { limits, token, tokenDays } = useDashboard()

type Tone = 'plain' | 'warn' | 'danger'

const quota = computed(() => {
  const value = limits.data.value
  if (!value) return undefined
  return { used: value.quota_usage, total: value.config.quota_total }
})

/** Under two weeks means it has to be re-issued by hand, and that takes doing. */
const tokenTone = computed<Tone>(() => {
  const days = tokenDays.value
  if (token.data.value && !token.data.value.valid) return 'danger'
  if (days === undefined) return 'plain'
  if (days <= 7) return 'danger'
  if (days <= 14) return 'warn'
  return 'plain'
})

const rights = computed(() => {
  const status = token.data.value
  if (!status) return undefined
  if (status.canPublish && status.canDelete) return { label: 'повні права', tone: 'plain' as Tone }
  if (!status.canPublish) return { label: 'без публікації', tone: 'danger' as Tone }
  return { label: 'без видалення', tone: 'warn' as Tone }
})
</script>

<template>
  <dl class="status">
    <div v-if="quota" class="chip">
      <dt>За добу</dt>
      <dd class="num">{{ quota.used }} <span class="faint">/ {{ quota.total }}</span></dd>
    </div>

    <div v-if="token.data.value" class="chip" :class="tokenTone">
      <dt>Токен</dt>
      <dd v-if="!token.data.value.valid">
        <AppIcon name="alert" :size="13" />
        недійсний
      </dd>
      <dd v-else class="num">
        <AppIcon v-if="tokenTone !== 'plain'" name="clock" :size="13" />
        {{ tokenDays }} дн.
      </dd>
    </div>

    <div v-if="rights" class="chip" :class="rights.tone">
      <dt>Права</dt>
      <dd>
        <AppIcon v-if="rights.tone !== 'plain'" name="key" :size="13" />
        {{ rights.label }}
      </dd>
    </div>
  </dl>
</template>

<style scoped>
.status {
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  gap: var(--s-2);
  margin: 0;
  min-inline-size: 0;
}

.chip {
  display: flex;
  align-items: baseline;
  gap: var(--s-2);
  padding: 0.1875rem var(--s-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  background: var(--surface);
  white-space: nowrap;
}

dt {
  font-size: var(--fs-sm);
  color: var(--fg-3);
}

dd {
  margin: 0;
  font-size: var(--fs-base);
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.warn {
  border-color: color-mix(in srgb, var(--warn) 40%, var(--border));
  background: var(--warn-soft);
}

.warn dd,
.warn dt {
  color: var(--warn);
}

.danger {
  border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
  background: var(--danger-soft);
}

.danger dd,
.danger dt {
  color: var(--danger);
}

/* On a phone the quota is the least useful of the three and the first to go. */
@media (max-width: 32rem) {
  .chip:first-child {
    display: none;
  }

  dt {
    display: none;
  }
}
</style>
