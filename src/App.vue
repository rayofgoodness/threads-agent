<script setup lang="ts">
import { computed } from 'vue'
import { createDashboard, provideDashboard } from './composables/useDashboard.ts'
import { useView, VIEWS } from './composables/useView.ts'
import AccessGate from './components/AccessGate.vue'
import AppNav from './components/AppNav.vue'
import AppIcon from './components/AppIcon.vue'
import SystemStatus from './components/SystemStatus.vue'
import OverviewView from './views/OverviewView.vue'
import ContentView from './views/ContentView.vue'
import FeedView from './views/FeedView.vue'
import SettingsView from './views/SettingsView.vue'

const dashboard = createDashboard()
provideDashboard(dashboard)

const { current, go, title } = useView()

const { locked, offline, profile, feed, queue, drafts, plan } = dashboard

/** The refresh in the bar reloads what the current screen actually shows. */
const refreshing = computed(
  () =>
    feed.pending.value || queue.pending.value || drafts.pending.value || plan.pending.value,
)

async function refreshCurrent() {
  const jobs = {
    overview: [feed.refresh, queue.refresh, profile.refresh],
    content: [queue.refresh, drafts.refresh, plan.refresh],
    feed: [feed.refresh],
    settings: [dashboard.token.refresh, dashboard.limits.refresh, dashboard.db.refresh],
  }[current.value]

  await Promise.all(jobs.map((job) => job()))
}

function focusView() {
  document.getElementById('view')?.focus()
}
</script>

<template>
  <AccessGate v-if="locked" />

  <div v-else class="shell">
    <!-- Focused directly rather than by letting the browser follow the href:
         the hash is what selects the screen, and `#view` in it would send a
         reload back to the overview. -->
    <a class="skip" href="#view" @click.prevent="focusView">До вмісту</a>

    <AppNav :current="current" @go="go" />

    <div class="main">
      <header class="bar">
        <h1>{{ title }}</h1>
        <SystemStatus class="spread" />
        <button
          class="quiet refresh"
          :disabled="refreshing"
          :aria-label="refreshing ? 'Оновлюю' : 'Оновити'"
          @click="refreshCurrent"
        >
          <AppIcon name="refresh" :class="{ spin: refreshing }" />
          <span class="refresh-label">{{ refreshing ? 'Оновлюю' : 'Оновити' }}</span>
        </button>
      </header>

      <!-- One page-level statement instead of the same error inside every
           panel: the Pi is off or the tunnel is down, and no panel on any
           screen can say anything until it is back. -->
      <div v-if="offline" class="offline">
        <div class="offline-card">
          <AppIcon name="slash" :size="20" />
          <div>
            <h2>Сервер не відповідає</h2>
            <p class="muted small">
              Малина вимкнена, тунель ліг або <code>npm run server</code> не запущений. Черга від
              цього не зупиняється — публікацією керує таймер на самій малині.
            </p>
          </div>
          <button class="primary" @click="refreshCurrent">Спробувати ще раз</button>
        </div>
      </div>

      <main v-else id="view" :key="current" class="view" tabindex="-1">
        <OverviewView v-if="current === 'overview'" @go="go" />
        <ContentView v-else-if="current === 'content'" />
        <FeedView v-else-if="current === 'feed'" />
        <SettingsView v-else />
      </main>
    </div>

    <!-- The phone's nav sits at the end of the DOM so the keyboard reaches the
         content first; on desktop the rail replaces it and this is hidden. -->
    <nav class="mobile-nav" aria-label="Розділи">
      <button
        v-for="view in VIEWS"
        :key="view.id"
        class="quiet"
        :class="{ on: current === view.id }"
        :aria-current="current === view.id ? 'page' : undefined"
        @click="go(view.id)"
      >
        <AppIcon :name="view.icon" :size="20" />
        <span>{{ view.title }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.shell {
  min-block-size: 100dvh;
}

/* Present for the keyboard, out of the way for everyone else. */
.skip {
  position: absolute;
  inset-block-start: var(--s-2);
  inset-inline-start: var(--s-2);
  z-index: 40;
  padding: var(--s-2) var(--s-3);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
  box-shadow: var(--shadow);
  transform: translateY(-200%);
}

.skip:focus-visible {
  transform: none;
}

/* The main region takes focus from the skip link but is never a tab stop. */
.view:focus {
  outline: none;
}

.main {
  min-inline-size: 0;
  /* Room for the mobile bar; the desktop rail replaces it below. */
  padding-block-end: calc(4rem + env(safe-area-inset-bottom));
}

.bar {
  position: sticky;
  inset-block-start: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: var(--s-4);
  min-block-size: var(--bar-h);
  padding: var(--s-3) var(--s-4);
  background: color-mix(in srgb, var(--canvas) 88%, transparent);
  backdrop-filter: blur(12px);
  border-block-end: 1px solid var(--border);
}

.bar h1 {
  font-size: var(--fs-md);
  white-space: nowrap;
}

.refresh-label {
  display: none;
}

.spin {
  animation: spin 0.9s linear infinite;
}

@keyframes spin {
  to {
    rotate: 1turn;
  }
}

.view {
  padding: var(--s-5) var(--s-4) var(--s-10);
  display: grid;
  gap: var(--s-6);
  max-inline-size: 76rem;
}

.offline {
  padding: var(--s-8) var(--s-4);
}

.offline-card {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: start;
  gap: var(--s-3) var(--s-4);
  max-inline-size: 34rem;
  margin-inline: auto;
  padding: var(--s-6);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow);
  color: var(--warn);
}

.offline-card h2 {
  color: var(--fg);
  margin-block-end: var(--s-1);
}

.offline-card button {
  grid-column: 2;
  justify-self: start;
}

.mobile-nav {
  position: fixed;
  inset: auto 0 0;
  z-index: 30;
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: var(--s-1);
  padding: var(--s-1) var(--s-2) calc(var(--s-1) + env(safe-area-inset-bottom));
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(12px);
  border-block-start: 1px solid var(--border);
}

.mobile-nav button {
  flex-direction: column;
  gap: 2px;
  padding: var(--s-2) var(--s-1);
  font-size: var(--fs-sm);
  font-weight: 500;
  color: var(--fg-3);
  min-block-size: 3rem;
}

.mobile-nav button.on {
  color: var(--accent);
}

@media (min-width: 60rem) {
  .shell {
    display: grid;
    grid-template-columns: var(--nav-w) minmax(0, 1fr);
  }

  .main {
    padding-block-end: 0;
  }

  .bar {
    padding-inline: var(--s-6);
  }

  .refresh-label {
    display: inline;
  }

  .view {
    padding: var(--s-6) var(--s-6) var(--s-12);
  }

  .mobile-nav {
    display: none;
  }
}
</style>
