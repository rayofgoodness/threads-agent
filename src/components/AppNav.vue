<script setup lang="ts">
import { useDashboard } from '../composables/useDashboard.ts'
import { VIEWS, type ViewId } from '../composables/useView.ts'
import AppIcon from './AppIcon.vue'

/** Desktop rail. The phone gets a bottom bar from the shell instead. */
defineProps<{ current: ViewId }>()
defineEmits<{ go: [id: ViewId] }>()

const { profile, settings } = useDashboard()
</script>

<template>
  <nav class="rail" aria-label="Розділи">
    <div class="account">
      <img
        v-if="profile.data.value?.threads_profile_picture_url"
        class="avatar"
        :src="profile.data.value.threads_profile_picture_url"
        :alt="''"
        width="32"
        height="32"
      />
      <div v-else class="avatar placeholder" aria-hidden="true"></div>

      <div class="who">
        <span class="name">{{ profile.data.value?.name ?? 'Threads Agent' }}</span>
        <span class="handle tiny faint">
          {{ profile.data.value ? `@${profile.data.value.username}` : 'зʼєднуюсь…' }}
        </span>
      </div>
    </div>

    <ul>
      <li v-for="view in VIEWS" :key="view.id">
        <button
          class="quiet item"
          :class="{ on: current === view.id }"
          :aria-current="current === view.id ? 'page' : undefined"
          @click="$emit('go', view.id)"
        >
          <AppIcon :name="view.icon" />
          {{ view.title }}
        </button>
      </li>
    </ul>

    <p v-if="settings.data.value" class="foot tiny faint">
      Слоти {{ settings.data.value.schedule.slots.join(' · ') }}<br />
      до {{ settings.data.value.schedule.maxPerDay }} постів на добу ·
      {{ settings.data.value.timezone }}
    </p>
  </nav>
</template>

<style scoped>
.rail {
  display: none;
}

@media (min-width: 60rem) {
  .rail {
    display: grid;
    grid-template-rows: auto 1fr auto;
    gap: var(--s-5);
    position: sticky;
    inset-block-start: 0;
    block-size: 100dvh;
    padding: var(--s-4) var(--s-3);
    background: var(--surface);
    border-inline-end: 1px solid var(--border);
  }
}

.account {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-2);
  min-inline-size: 0;
}

.avatar {
  border-radius: var(--r-full);
  aspect-ratio: 1;
  object-fit: cover;
  border: 1px solid var(--border);
}

.placeholder {
  inline-size: 32px;
  block-size: 32px;
  background: var(--surface-sunken);
}

.who {
  display: grid;
  min-inline-size: 0;
}

.name,
.handle {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name {
  font-weight: 600;
  font-size: var(--fs-base);
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 2px;
  align-content: start;
}

.item {
  inline-size: 100%;
  justify-content: flex-start;
  padding: var(--s-2) var(--s-3);
  min-block-size: 2.25rem;
  font-size: var(--fs-ui);
  color: var(--fg-2);
  border-radius: var(--r-sm);
}

.item.on {
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.item.on:hover {
  background: var(--accent-soft);
}

.foot {
  padding: var(--s-3);
  border-block-start: 1px solid var(--border);
  line-height: 1.6;
}
</style>
