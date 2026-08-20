<script setup lang="ts">
import VoicePanel from '../components/VoicePanel.vue'
import SystemPanel from '../components/SystemPanel.vue'

/** How the account sounds, and what the machine behind it is allowed to do. */
</script>

<template>
  <div class="settings">
    <VoicePanel />
    <SystemPanel />
  </div>
</template>

<style scoped>
.settings {
  display: grid;
  gap: var(--s-5);
  align-items: start;
}

@media (min-width: 66rem) {
  .settings {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}
</style>
