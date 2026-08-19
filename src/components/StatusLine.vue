<script setup lang="ts">
/** One-line state readout for a panel: error, loading, or nothing. */
defineProps<{ error?: string; pending?: boolean; label?: string }>()
</script>

<template>
  <p v-if="error" class="error small" role="alert">{{ error }}</p>
  <p v-else-if="pending" class="muted small">{{ label ?? 'Завантаження…' }}</p>
</template>
