<script setup lang="ts">
import { ref } from 'vue'
import { setAccessToken } from '../api/client.ts'

/**
 * Shown when the API answers 401 — a deployment reachable from outside requires
 * `THREADS_AGENT_TOKEN`, since /api can publish and delete.
 */
const value = ref('')

function save() {
  if (!value.value.trim()) return
  setAccessToken(value.value.trim())
  window.location.reload()
}
</script>

<template>
  <section class="card gate" aria-labelledby="gate-heading">
    <h2 id="gate-heading">Потрібен доступ</h2>
    <p class="muted small">
      Сервер вимагає токен. Це значення <code>THREADS_AGENT_TOKEN</code> з його оточення — воно
      зберігається лише у цьому браузері.
    </p>
    <form @submit.prevent="save">
      <input v-model="value" type="password" autocomplete="off" placeholder="Токен доступу" />
      <button class="primary" type="submit">Зберегти</button>
    </form>
  </section>
</template>

<style scoped>
h2 {
  font-size: 1rem;
  margin-block-end: 0.5rem;
}

form {
  display: flex;
  gap: 0.5rem;
  margin-block-start: 0.75rem;
}

input {
  font: inherit;
  color: inherit;
  flex: 1 1 auto;
  min-inline-size: 0;
  background: var(--surface-sunken);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 0.45rem 0.6rem;
}
</style>
