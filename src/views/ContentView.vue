<script setup lang="ts">
import GeneratorPanel from '../components/GeneratorPanel.vue'
import DraftShelf from '../components/DraftShelf.vue'
import QueuePanel from '../components/QueuePanel.vue'
import PlanPanel from '../components/PlanPanel.vue'
import HistoryPanel from '../components/HistoryPanel.vue'

/**
 * One screen for the whole path a text takes: written, kept, scheduled.
 *
 * These four panels used to sit in two different columns with the feed between
 * them, which made moving a draft from the shelf into the queue a scroll and a
 * hunt. The order here is the order of the work.
 */
</script>

<template>
  <div class="content">
    <div class="flow">
      <GeneratorPanel />
      <DraftShelf />
      <HistoryPanel />
    </div>

    <div class="side">
      <QueuePanel />
      <PlanPanel />
    </div>
  </div>
</template>

<style scoped>
.content {
  display: grid;
  gap: var(--s-5);
  align-items: start;
}

.flow,
.side {
  display: grid;
  gap: var(--s-5);
  align-content: start;
  min-inline-size: 0;
}

@media (min-width: 66rem) {
  .content {
    grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr);
  }

  .side {
    position: sticky;
    inset-block-start: calc(var(--bar-h) + var(--s-4));
  }
}
</style>
