<script setup lang="ts">
import { ref } from 'vue'
import { setAccessToken } from '../api/client.ts'
import AppIcon from './AppIcon.vue'

/**
 * Shown when the API answers 401 — a deployment reachable from outside
 * requires `THREADS_AGENT_TOKEN`, since `/api` can publish and delete.
 */
const value = ref('')

function save() {
  if (!value.value.trim()) return
  setAccessToken(value.value.trim())
  window.location.reload()
}
</script>

<template>
  <div class="gate">
    <section class="panel card" aria-labelledby="gate-heading">
      <div class="panel-body">
        <AppIcon name="key" :size="22" />
        <h1 id="gate-heading">Потрібен доступ</h1>
        <p class="small muted">
          Сервер вимагає токен. Це значення <code>THREADS_AGENT_TOKEN</code> з його оточення — воно
          зберігається лише в цьому браузері й нікуди не надсилається, крім самого сервера.
        </p>

        <form @submit.prevent="save">
          <input
            v-model="value"
            type="password"
            autocomplete="off"
            aria-label="Токен доступу"
            placeholder="Токен доступу"
          />
          <button class="primary" type="submit">Увійти</button>
        </form>
      </div>
    </section>
  </div>
</template>

<style scoped>
.gate {
  min-block-size: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--s-5);
}

.card {
  inline-size: min(100%, 26rem);
  box-shadow: var(--shadow);
}

.panel-body {
  display: grid;
  gap: var(--s-3);
  padding: var(--s-6);
  color: var(--fg-3);
}

h1 {
  font-size: var(--fs-lg);
  color: var(--fg);
}

form {
  display: flex;
  gap: var(--s-2);
  margin-block-start: var(--s-1);
}

input {
  flex: 1 1 auto;
  min-inline-size: 0;
}
</style>
