<script setup lang="ts">
/**
 * The icon set, drawn here rather than pulled from a library.
 *
 * Sixteen are needed and a dependency would ship eight hundred. Everything is
 * on a 16px grid with a 1.5 stroke, round caps and joins, so a row of them
 * reads as one alphabet instead of four.
 */
const PATHS: Record<string, string> = {
  gauge: 'M3 12a9 9 0 1 1 18 0M12 12l4.5-3.5',
  pen: 'M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4ZM13.5 6.5l4 4',
  stream: 'M4 6h16M4 12h16M4 18h9',
  sliders: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M8 15v4',
  refresh: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v4h-4',
  plus: 'M12 5v14M5 12h14',
  check: 'M4.5 12.5 9 17l10.5-10.5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2',
  alert: 'M12 3.8 2.8 20h18.4L12 3.8ZM12 10v4M12 17.2v.1',
  slash: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM6 6l12 12',
  trash: 'M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13M10.5 11v5M13.5 11v5',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 19V8.2C4 7.3 4.7 6.6 5.6 6.6H10',
  arrowUp: 'M12 19V5M6 11l6-6 6 6',
  arrowDown: 'M12 5v14M6 13l6 6 6-6',
  inbox: 'M4 13h4l1.5 3h5L16 13h4M4 13 6.5 5h11L20 13v5.4A1.6 1.6 0 0 1 18.4 20H5.6A1.6 1.6 0 0 1 4 18.4V13Z',
  shelf: 'M4 8h16M4 8V5.6C4 4.7 4.7 4 5.6 4h12.8c.9 0 1.6.7 1.6 1.6V8M5.5 8v11M18.5 8v11M4 19h16M8 12h8',
  key: 'M15.5 4a4.5 4.5 0 1 0-4.3 5.9L4 17.1V20h3v-2h2v-2h2l1.1-1.1A4.5 4.5 0 0 0 15.5 4ZM16 8.2v.1',
  database: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3ZM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  chart: 'M4 20h16M7.5 20v-6M12 20V7M16.5 20v-9',
  spark: 'M4 15.5 8.5 10l3.5 3.5L20 5',
}

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 16 })
</script>

<template>
  <svg
    class="icon"
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path :d="PATHS[props.name] ?? ''" />
  </svg>
</template>

<style scoped>
.icon {
  flex: none;
  display: block;
}
</style>
