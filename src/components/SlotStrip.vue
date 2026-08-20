<script setup lang="ts">
import { computed } from 'vue'
import { useDashboard } from '../composables/useDashboard.ts'
import { fillSlots, upcomingSlots } from '../lib/slots.ts'
import { counted } from '../lib/plural.ts'
import AppIcon from './AppIcon.vue'

/**
 * What the account will say next, and where it will say nothing.
 *
 * The first unfed slot is the loudest object on this screen on purpose: the
 * queue running dry is the failure this whole machine exists to prevent, and
 * it is silent by nature — nothing breaks, the account simply stops speaking.
 *
 * Only the first, though. Four amber rows shouting the same thing is
 * wallpaper, and the honest instruction is to fix the nearest gap first, so
 * the later ones state their emptiness and stay out of the way.
 */
const emit = defineEmits<{ fill: [] }>()

const { settings, queue, queued, shelf } = useDashboard()

const slots = computed(() => {
  const config = settings.data.value
  if (!config) return []
  const filled = fillSlots(upcomingSlots(config.schedule.slots, config.timezone, 4), queued.value)
  const firstGap = filled.findIndex((pair) => !pair.item)
  return filled.map((pair, index) => ({ ...pair, urgent: index === firstGap }))
})

const empty = computed(() => slots.value.filter((pair) => !pair.item).length)

/** Items queued for a time that matches no configured slot still go out. */
const offSchedule = computed(() => {
  const matched = new Set(slots.value.map((pair) => pair.item).filter(Boolean))
  return queued.value.filter((item) => item.publishAt && !matched.has(item))
})

const failed = computed(() => queued.value.filter((item) => item.status === 'failed'))

function when(at: Date): string {
  return at.toLocaleString('uk-UA', {
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: settings.data.value?.timezone,
  })
}

/** «сьогодні», «завтра», or the date — the part the weekday alone leaves out. */
function day(at: Date): string {
  const zone = settings.data.value?.timezone
  const key = (value: Date) => value.toLocaleDateString('en-CA', { timeZone: zone })
  const now = new Date()
  const tomorrow = new Date(now.getTime() + 86_400_000)

  if (key(at) === key(now)) return 'сьогодні'
  if (key(at) === key(tomorrow)) return 'завтра'
  return at.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short', timeZone: zone })
}
</script>

<template>
  <section class="panel" aria-labelledby="slots-heading">
    <div class="panel-head">
      <h2 id="slots-heading">Найближчі публікації</h2>
      <p v-if="slots.length" class="tiny faint spread">
        {{ empty ? `${counted(empty, 'слот', 'слоти', 'слотів')} без тексту` : 'усі заповнені' }}
      </p>
    </div>

    <p v-if="queue.error.value" class="panel-body error small" role="alert">
      {{ queue.error.value }}
    </p>

    <p v-else-if="!settings.data.value" class="panel-body muted small">Читаю розклад…</p>

    <p v-else-if="!slots.length" class="panel-body muted small">
      У <code>agent.config.json</code> не задано жодного слоту, тож автопублікація нічого не
      візьме. Додай час у <code>schedule.slots</code>.
    </p>

    <ol v-else class="slots">
      <li
        v-for="pair in slots"
        :key="pair.slot.at.toISOString()"
        :class="{ open: !pair.item, urgent: pair.urgent }"
      >
        <div class="mark" aria-hidden="true">
          <AppIcon :name="pair.item ? 'check' : 'plus'" :size="14" />
        </div>

        <div class="when">
          <time class="num" :datetime="pair.slot.at.toISOString()">{{ when(pair.slot.at) }}</time>
          <span class="tiny faint">{{ day(pair.slot.at) }}</span>
        </div>

        <p v-if="pair.item" class="text">{{ pair.item.text }}</p>
        <p v-else-if="pair.urgent" class="text urgent-text">
          Порожньо — цього разу акаунт промовчить.
        </p>
        <p v-else class="text faint">порожньо</p>

        <button v-if="pair.urgent" class="primary" @click="emit('fill')">
          {{ shelf.length ? `Взяти з полиці (${shelf.length})` : 'Написати' }}
        </button>
      </li>
    </ol>

    <div v-if="offSchedule.length || failed.length" class="notes">
      <p v-if="offSchedule.length" class="small muted">
        Ще {{ offSchedule.length }} у черзі поза слотами — вони теж підуть, у свій час.
      </p>
      <p v-for="item in failed" :key="item.file" class="small error">
        <AppIcon name="alert" :size="13" />
        {{ item.file }}: {{ item.note ?? 'публікація не вдалася' }}
      </p>
    </div>
  </section>
</template>

<style scoped>
.slots {
  list-style: none;
  margin: 0;
  padding: 0;
}

.slots li {
  display: grid;
  grid-template-columns: auto 6.5rem minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-5);
  border-block-start: 1px solid var(--border);
}

.slots li:first-child {
  border-block-start: none;
}

.slots li.urgent {
  background: var(--warn-soft);
  padding-block: var(--s-4);
}

.mark {
  display: grid;
  place-items: center;
  inline-size: 1.375rem;
  block-size: 1.375rem;
  border-radius: var(--r-full);
  background: var(--surface-sunken);
  color: var(--fg-3);
}

.urgent .mark {
  background: color-mix(in srgb, var(--warn) 18%, transparent);
  color: var(--warn);
}

.when {
  display: grid;
  gap: 1px;
  font-size: var(--fs-base);
  font-weight: 500;
}

.when time::first-letter {
  text-transform: uppercase;
}

.open:not(.urgent) .when {
  color: var(--fg-3);
  font-weight: 400;
}

.text {
  font-size: var(--fs-base);
  color: var(--fg-2);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.urgent-text {
  color: var(--warn);
  font-weight: 500;
}

.notes {
  display: grid;
  gap: var(--s-2);
  padding: var(--s-3) var(--s-5) var(--s-4);
  border-block-start: 1px solid var(--border);
}

.notes p {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

@media (max-width: 44rem) {
  .slots li {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .when {
    display: flex;
    gap: var(--s-2);
    align-items: baseline;
  }

  .text {
    grid-column: 2 / -1;
  }

  .slots li > button {
    grid-column: 2 / -1;
    justify-self: start;
  }
}
</style>
