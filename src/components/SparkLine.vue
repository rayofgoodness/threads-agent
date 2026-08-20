<script setup lang="ts">
import { computed } from 'vue'

/**
 * A curve drawn from readings that exist.
 *
 * Renders nothing below two points, deliberately: a single reading has no
 * shape, and a flat line drawn through it would claim a stability nobody has
 * measured.
 */
const props = withDefaults(
  defineProps<{ values: number[]; width?: number; height?: number; label?: string }>(),
  { width: 120, height: 32 },
)

const geometry = computed(() => {
  const values = props.values.filter((value) => Number.isFinite(value))
  if (values.length < 2) return undefined

  const min = Math.min(...values)
  const max = Math.max(...values)
  // A perfectly flat series still deserves a line, drawn through the middle.
  const span = max - min || 1
  const pad = 2
  const usableY = props.height - pad * 2
  const step = props.width / (values.length - 1)

  const points = values.map((value, index) => {
    const x = index * step
    const y = pad + usableY - ((value - min) / span) * usableY
    return [x, y] as const
  })

  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${props.width} ${props.height} L0 ${props.height} Z`
  const last = points.at(-1)

  return { line, area, last }
})
</script>

<template>
  <svg
    v-if="geometry"
    class="spark"
    :viewBox="`0 0 ${props.width} ${props.height}`"
    :width="props.width"
    :height="props.height"
    preserveAspectRatio="none"
    role="img"
    :aria-label="props.label ?? 'Крива за період'"
  >
    <path :d="geometry.area" fill="var(--chart-fill)" />
    <path
      :d="geometry.line"
      fill="none"
      stroke="var(--chart-line)"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      vector-effect="non-scaling-stroke"
    />
    <circle
      v-if="geometry.last"
      :cx="geometry.last[0]"
      :cy="geometry.last[1]"
      r="2"
      fill="var(--chart-line)"
    />
  </svg>
</template>

<style scoped>
.spark {
  display: block;
  inline-size: 100%;
  block-size: auto;
  overflow: visible;
}
</style>
