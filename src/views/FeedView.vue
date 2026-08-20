<script setup lang="ts">
import { computed, ref } from 'vue'
import { useDashboard } from '../composables/useDashboard.ts'
import ComposerPanel from '../components/ComposerPanel.vue'
import PostRow from '../components/PostRow.vue'

/** What the account has actually said, newest first. */
const { feed, posts, canDelete, refreshFeedSoon } = useDashboard()

/**
 * `/me/threads` lags a delete by several seconds, so the row goes away here
 * first and the list is re-read once the API has caught up.
 */
const hidden = ref(new Set<string>())
const visible = computed(() => posts.value.filter((post) => !hidden.value.has(post.id)))

function onDeleted(id: string) {
  hidden.value = new Set(hidden.value).add(id)
  refreshFeedSoon()
}
</script>

<template>
  <ComposerPanel />

  <section class="panel" aria-labelledby="feed-heading">
    <div class="panel-head">
      <h2 id="feed-heading">Опубліковане</h2>
      <p class="tiny faint spread num">{{ visible.length }} останніх</p>
    </div>

    <p v-if="feed.error.value" class="panel-body error small" role="alert">{{ feed.error.value }}</p>

    <p v-else-if="feed.pending.value && !feed.loaded.value" class="panel-body muted small">
      Читаю стрічку…
    </p>

    <p v-else-if="!visible.length" class="panel-body muted small">
      Постів ще немає. Перший можна написати вище або згенерувати в «Контенті».
    </p>

    <PostRow
      v-for="post in visible"
      :key="post.id"
      :post="post"
      :can-delete="canDelete"
      @deleted="onDeleted"
    />
  </section>
</template>

<style scoped>
.panel > :deep(article:first-of-type) {
  border-block-start: none;
}
</style>
