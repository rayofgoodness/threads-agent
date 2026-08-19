<script setup lang="ts">
import { computed, ref } from 'vue'
import { api } from './api/client.ts'
import { useResource } from './composables/useResource.ts'
import AccountBar from './components/AccountBar.vue'
import ComposerCard from './components/ComposerCard.vue'
import InsightsCard from './components/InsightsCard.vue'
import PostCard from './components/PostCard.vue'
import SignalsCard from './components/SignalsCard.vue'
import StatusLine from './components/StatusLine.vue'

const feed = useResource(() => api.posts(25))
const token = useResource(api.token)

const posts = computed(() => feed.data.value?.data ?? [])
const canDelete = computed(() => token.data.value?.canDelete ?? false)

/**
 * `/me/threads` lags behind writes — measured at roughly five seconds for both
 * publishing and deleting. So the list is corrected locally straight away and
 * re-read once the API has caught up; refreshing sooner brings back a deleted
 * post or misses a fresh one.
 */
const FEED_SETTLE_MS = 6000

const hidden = ref(new Set<string>())
const visible = computed(() => posts.value.filter((post) => !hidden.value.has(post.id)))

function onDeleted(id: string) {
  hidden.value = new Set(hidden.value).add(id)
  window.setTimeout(() => void feed.refresh(), FEED_SETTLE_MS)
}

function onPublished() {
  window.setTimeout(() => void feed.refresh(), FEED_SETTLE_MS)
}
</script>

<template>
  <div class="shell">
    <AccountBar />

    <main>
      <div class="column">
        <ComposerCard @published="onPublished" />

        <section aria-labelledby="feed-heading">
          <div class="feed-head">
            <h2 id="feed-heading">Стрічка</h2>
            <button :disabled="feed.pending.value" @click="feed.refresh">
              {{ feed.pending.value ? 'Оновлюю…' : 'Оновити' }}
            </button>
          </div>

          <StatusLine :error="feed.error.value" :pending="feed.pending.value && !feed.loaded.value" />

          <p v-if="feed.loaded.value && !visible.length" class="muted">
            Постів ще немає. Опублікуй перший вище.
          </p>

          <div class="posts">
            <PostCard
              v-for="post in visible"
              :key="post.id"
              :post="post"
              :can-delete="canDelete"
              @deleted="onDeleted"
            />
          </div>
        </section>
      </div>

      <aside>
        <InsightsCard />
        <SignalsCard />
      </aside>
    </main>
  </div>
</template>

<style scoped>
.shell {
  max-inline-size: 68rem;
  margin-inline: auto;
  padding: 1.5rem 1.25rem 4rem;
  display: grid;
  gap: 1.25rem;
}

main {
  display: grid;
  gap: 1.25rem;
  /* Sidebar drops under the column when there is no room for both. */
  grid-template-columns: minmax(0, 1fr);
}

aside {
  display: grid;
  gap: 1.25rem;
  align-content: start;
}

@media (min-width: 60rem) {
  main {
    grid-template-columns: minmax(0, 1fr) 18rem;
    align-items: start;
  }
}

.column,
.posts {
  display: grid;
  gap: 1.25rem;
}

.posts {
  gap: 0.85rem;
  margin-block-start: 0.85rem;
}

.feed-head {
  display: flex;
  align-items: safe center;
  gap: 1rem;
}

.feed-head h2 {
  font-size: 1rem;
}

.feed-head button {
  margin-inline-start: auto;
}
</style>
