<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import SparkLine from './SparkLine.vue'

/**
 * One number with the context that makes it mean something.
 *
 * The delta and the curve are optional and stay absent rather than showing a
 * zero: «+0%» against a week nobody measured is a claim, and this surface
 * does not make claims it cannot back.
 */
const props = defineProps<{
  label: string
  value?: number
  /** Same metric over the preceding period of equal length. */
  previous?: number
  /** Daily readings, oldest first. */
  series?: number[]
  /** Shown instead of a delta when there is no comparable period. */
  note?: string
  pending?: boolean
}>()

const formatted = computed(() =>
  props.value === undefined ? '—' : props.value.toLocaleString('uk-UA'),
)

const delta = computed(() => {
  if (props.value === undefined || props.previous === undefined) return undefined

  // A percentage against zero is infinity dressed as insight. The period is
  // still worth naming — going from nothing to something is the news.
  if (props.previous === 0) {
    return props.value > 0 ? { up: true, text: 'з нуля' } : undefined
  }

  const change = (props.value - props.previous) / props.previous
  return {
    up: change >= 0,
    // One decimal below ten percent, none above: a dashboard that reports
    // 127.4% is reporting noise with a decimal point on it.
    text: `${change >= 0 ? '+' : '−'}${
      Math.abs(change * 100) < 10
        ? Math.abs(change * 100).toFixed(1)
        : Math.round(Math.abs(change * 100))
    }%`,
  }
})
</script>

<template>
  <article class="tile">
    <h3 class="eyebrow">{{ props.label }}</h3>

    <p class="value num" :class="{ waiting: props.pending && props.value === undefined }">
      {{ props.pending && props.value === undefined ? '' : formatted }}
    </p>

    <p v-if="delta" class="delta" :class="delta.up ? 'up' : 'down'">
      <AppIcon :name="delta.up ? 'arrowUp' : 'arrowDown'" :size="13" />
      <span class="num">{{ delta.text }}</span>
      <span class="faint">до попередніх 7 днів</span>
    </p>
    <p v-else-if="props.previous === 0 && props.value === 0" class="delta faint">
      і попередні 7 днів теж
    </p>
    <p v-else-if="props.note" class="delta faint">{{ props.note }}</p>

    <SparkLine
      v-if="props.series && props.series.length > 1"
      class="curve"
      :values="props.series"
      :label="`${props.label}: крива за період`"
      :height="34"
    />
  </article>
</template>

<style scoped>
.tile {
  display: grid;
  gap: var(--s-1);
  align-content: start;
  padding: var(--s-4) var(--s-5) var(--s-5);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-sm);
  min-inline-size: 0;
}

.value {
  font-size: var(--fs-stat);
  font-weight: 600;
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin-block-start: var(--s-1);
  min-block-size: 1.1em;
}

.value.waiting {
  inline-size: 3.5ch;
  border-radius: var(--r-sm);
  background: linear-gradient(
    90deg,
    var(--surface-sunken) 0%,
    var(--border) 50%,
    var(--surface-sunken) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}

.delta {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: var(--fs-sm);
  font-weight: 500;
  flex-wrap: wrap;
}

.delta.up {
  color: var(--ok);
}

.delta.down {
  color: var(--warn);
}

.curve {
  margin-block-start: var(--s-3);
}
</style>
