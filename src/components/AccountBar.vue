<script setup lang="ts">
import { computed } from 'vue'
import { api } from '../api/client.ts'
import { useResource } from '../composables/useResource.ts'
import StatusLine from './StatusLine.vue'

const profile = useResource(api.profile)
const token = useResource(api.token)
const limits = useResource(api.limits)

/** Days left before the 60-day token has to be re-issued. */
const daysLeft = computed(() => {
  const expiresAt = token.data.value?.expiresAt
  if (!expiresAt) return undefined
  return Math.round((Date.parse(expiresAt) - Date.now()) / 86_400_000)
})

const quota = computed(() => {
  const value = limits.data.value
  return value ? `${value.quota_usage} / ${value.config.quota_total}` : '—'
})
</script>

<template>
  <header class="account card">
    <img
      v-if="profile.data.value?.threads_profile_picture_url"
      class="avatar"
      :src="profile.data.value.threads_profile_picture_url"
      :alt="`Аватар ${profile.data.value.username}`"
      width="52"
      height="52"
    />
    <div class="identity">
      <h1>{{ profile.data.value?.name ?? 'Threads Agent' }}</h1>
      <p class="muted small">
        <span v-if="profile.data.value">@{{ profile.data.value.username }}</span>
        <StatusLine v-else :error="profile.error.value" :pending="profile.pending.value" />
      </p>
    </div>

    <dl class="facts">
      <div>
        <dt class="muted small">Пости за добу</dt>
        <dd>{{ quota }}</dd>
      </div>
      <div>
        <dt class="muted small">Токен</dt>
        <dd v-if="token.data.value" :class="{ error: !token.data.value.valid }">
          {{ token.data.value.valid ? `дійсний ${daysLeft} дн.` : 'недійсний' }}
        </dd>
        <dd v-else class="muted">—</dd>
      </div>
      <div>
        <dt class="muted small">Дозволи</dt>
        <dd v-if="token.data.value" class="small">
          {{ token.data.value.canPublish ? 'публікація' : 'без публікації' }} ·
          {{ token.data.value.canDelete ? 'видалення' : 'без видалення' }}
        </dd>
        <dd v-else class="muted">—</dd>
      </div>
    </dl>
  </header>
</template>

<style scoped>
.account {
  display: flex;
  flex-flow: row wrap;
  align-items: safe center;
  gap: 1rem 1.25rem;
}

.avatar {
  border-radius: 50%;
  aspect-ratio: 1;
  object-fit: cover;
}

.identity {
  /* Long display names must not push the facts off the row. */
  min-inline-size: 0;
  flex: 1 1 12rem;
}

.identity h1 {
  font-size: 1.15rem;
}

.identity p {
  margin: 0.1rem 0 0;
}

.facts {
  display: flex;
  flex-flow: row wrap;
  gap: 0.5rem 1.5rem;
  margin: 0;
  margin-inline-start: auto;
}

.facts dt {
  margin: 0;
}

.facts dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
</style>
