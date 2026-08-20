<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { api, ApiError, type MetricSample } from '../api/client.ts'
import { useDashboard } from '../composables/useDashboard.ts'
import AppIcon from './AppIcon.vue'
import SparkLine from './SparkLine.vue'

/**
 * Which posts worked, ranked by the readings on file.
 *
 * The ranking is only as good as the sweep behind it, so this panel says out
 * loud when there is nothing to rank and offers the one action that fixes it.
 * A leaderboard built on two accidental readings is worse than an empty one:
 * it looks like an answer.
 */
const { posts, feed, db } = useDashboard()

const series = ref<Record<string, MetricSample[]>>({})
const pending = ref(false)
const error = ref<string>()
const collected = ref<string>()

async function load() {
  const ids = posts.value.map((post) => post.id)
  if (!ids.length || db.data.value?.enabled === false) return
  try {
    series.value = await api.metricSeries(ids)
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : String(cause)
  }
}

watch([posts, () => db.data.value], load, { immediate: true })

/** Reads whatever the cadence says is due, then re-reads what is on file. */
async function collect() {
  if (pending.value) return
  pending.value = true
  error.value = undefined
  collected.value = undefined
  try {
    const report = await api.collectMetrics()
    collected.value = report.captured.length
      ? `Знято ${report.captured.length} з ${report.considered}.`
      : `Нічого не дозріло — усе прочитане нещодавно (${report.considered} постів переглянуто).`
    if (report.failed.length) {
      error.value = report.failed.map((item) => `${item.postId}: ${item.reason}`).join('; ')
    }
    await load()
  } catch (cause) {
    error.value = cause instanceof ApiError ? cause.message : String(cause)
  } finally {
    pending.value = false
  }
}

interface Ranked {
  id: string
  text: string
  permalink?: string
  timestamp?: string
  views?: number
  likes?: number
  replies?: number
  curve: number[]
}

const ranked = computed<Ranked[]>(() =>
  posts.value
    .map((post) => {
      const samples = series.value[post.id] ?? []
      const last = samples.at(-1)
      return {
        id: post.id,
        text: post.text ?? '(без тексту)',
        permalink: post.permalink,
        timestamp: post.timestamp,
        views: last?.views ?? undefined,
        likes: last?.likes ?? undefined,
        replies: last?.replies ?? undefined,
        curve: samples
          .map((sample) => sample.views)
          .filter((value): value is number => value !== null),
      }
    })
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
    .slice(0, 6),
)

const measured = computed(() => ranked.value.filter((post) => post.views !== undefined).length)
const dbOff = computed(() => db.data.value?.enabled === false)

function when(value?: string) {
  if (!value) return ''
  return new Date(value).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
}
</script>

<template>
  <section class="panel" aria-labelledby="performance-heading">
    <div class="panel-head">
      <h2 id="performance-heading">Що зайшло</h2>
      <button
        v-if="!dbOff"
        class="spread"
        :disabled="pending || !posts.length"
        @click="collect"
      >
        <AppIcon name="chart" />
        {{ pending ? 'Знімаю…' : 'Зняти метрики' }}
      </button>
    </div>

    <div v-if="dbOff" class="panel-body muted small">
      <p>
        Метрики нема де тримати — не задано <code>DATABASE_URL</code>, тож кожне читання губиться
        відразу. Підняти базу: <code>npm run db:up &amp;&amp; npm run db:migrate</code>.
      </p>
      <p class="note">Цифри окремого поста лишаються доступні у «Стрічці», по одному запиту.</p>
    </div>

    <p v-else-if="feed.pending.value && !feed.loaded.value" class="panel-body muted small">
      Читаю стрічку…
    </p>

    <p v-else-if="!posts.length" class="panel-body muted small">
      Постів ще немає. Перший можна написати у «Стрічці» або згенерувати в «Контенті».
    </p>

    <div v-else-if="!measured" class="panel-body muted small">
      <p>
        Жодного знятого показника. Крива будується з окремих читань, а їх поки ніхто не робив —
        натисни «Зняти метрики», далі це робитиме таймер на малині щогодини.
      </p>
    </div>

    <ol v-else class="posts">
      <li v-for="post in ranked" :key="post.id">
        <div class="body">
          <p class="text">{{ post.text }}</p>
          <p class="meta tiny faint">
            <time v-if="post.timestamp" :datetime="post.timestamp">{{ when(post.timestamp) }}</time>
            <a v-if="post.permalink" :href="post.permalink" target="_blank" rel="noreferrer noopener">
              відкрити
            </a>
          </p>
        </div>

        <div class="numbers">
          <span class="views num">{{ post.views ?? '—' }}</span>
          <span class="tiny faint">переглядів</span>
          <span v-if="post.likes !== undefined" class="tiny faint num">
            {{ post.likes }} ♥ · {{ post.replies ?? 0 }} відп.
          </span>
        </div>

        <SparkLine
          v-if="post.curve.length > 1"
          class="curve"
          :values="post.curve"
          :width="90"
          :height="28"
          :label="`Перегляди поста від ${when(post.timestamp)}`"
        />
        <span v-else class="curve tiny faint">одне читання</span>
      </li>
    </ol>

    <p v-if="collected" class="foot small muted" role="status">{{ collected }}</p>
    <p v-if="error" class="foot small error" role="alert">{{ error }}</p>
  </section>
</template>

<style scoped>
.panel-body p + .note {
  margin-block-start: var(--s-2);
}

.posts {
  list-style: none;
  margin: 0;
  padding: 0;
}

.posts li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 6rem;
  align-items: center;
  gap: var(--s-4);
  padding: var(--s-3) var(--s-5);
  border-block-start: 1px solid var(--border);
}

.posts li:first-child {
  border-block-start: none;
}

.body {
  min-inline-size: 0;
}

.text {
  font-size: var(--fs-base);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
}

.meta {
  display: flex;
  gap: var(--s-3);
  margin-block-start: 2px;
}

.numbers {
  display: grid;
  justify-items: end;
  gap: 0;
  text-align: end;
}

.views {
  font-size: var(--fs-lg);
  font-weight: 600;
  line-height: 1.2;
}

.curve {
  color: var(--fg-3);
  text-align: end;
}

.foot {
  padding: var(--s-3) var(--s-5);
  border-block-start: 1px solid var(--border);
}

@media (max-width: 48rem) {
  .posts li {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .curve {
    grid-column: 1 / -1;
    inline-size: 100%;
  }
}
</style>
