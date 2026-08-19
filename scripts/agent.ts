/**
 * Queue and scheduling for the Threads agent.
 *
 *   node scripts/agent.ts <command> [args]
 *
 * Content lives as markdown files under `content/` — a draft is a file, the
 * queue is a directory listing, and publishing moves the file. No database, so
 * every step stays reviewable in git.
 */
import { loadConfig } from '../agent/config.ts'
import { addItem, listPublished, listQueue, dueItems } from '../agent/queue.ts'
import { checkGuardrails, publishedToday, runDue } from '../agent/publisher.ts'
import { collectSignals } from '../agent/monitor.ts'
import { markTopicDone, pendingTopics, readPlan } from '../agent/plan.ts'
import { generateDrafts } from '../agent/generator.ts'
import { closeDb, markDraftQueued, recordGeneration, tryRecord } from '../db/index.ts'
import { nextSlots as slotsAfter } from '../agent/schedule.ts'

/** Bound to the loaded config so the call sites stay `nextSlots(n)`. */
const nextSlots = (count?: number) => slotsAfter(config, count)

const [command = 'help', ...args] = process.argv.slice(2)
const config = loadConfig()

const COMMANDS = `
Commands:
  list                    queued items, earliest slot first
  add <text> [--at ISO]   add a draft to the queue (default slot: next free one)
  check                   run the guardrails over everything queued
  due                     what would go out right now
  run [--yes]             publish everything due; without --yes it only reports
  published               what has already gone out
  slots                   the next few configured publishing slots
  plan                    the content plan and what is still open in it
  generate [--yes]        draft posts in the account's voice; --yes queues them
           [--count N] [--brief "..."]
  watch [--all]           inbound signals: replies, mentions, watched keywords
`

function flag(name: string): string | undefined {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

async function main() {
  switch (command) {
    case 'list': {
      const items = listQueue(config)
      if (!items.length) return console.log('Черга порожня.')
      for (const item of items) {
        console.log(`${item.publishAt ?? 'без часу'}  [${item.status}]  ${item.file}`)
        console.log(`    ${item.text.slice(0, 90).replace(/\n/g, ' ')}`)
      }
      return
    }

    case 'add': {
      const text = args.filter((argument, index) => argument !== '--at' && args[index - 1] !== '--at').join(' ')
      if (!text.trim()) throw new Error('add: потрібен текст')
      const at = flag('--at') ?? nextSlots(1)[0]
      const violations = checkGuardrails(config, text)
      const item = addItem(config, text, at)
      console.log(`Додано ${item.file} на ${at}`)
      if (violations.length) {
        console.log('Увага, обмеження порушені:')
        for (const violation of violations) console.log(`  - ${violation.detail}`)
      }
      return
    }

    case 'check': {
      const items = listQueue(config)
      let clean = true
      for (const item of items) {
        const violations = checkGuardrails(config, item.text)
        if (!violations.length) continue
        clean = false
        console.log(`${item.file}:`)
        for (const violation of violations) console.log(`  - ${violation.detail}`)
      }
      if (clean) console.log(`Усі ${items.length} елементів проходять обмеження.`)
      return
    }

    case 'due': {
      const items = dueItems(config)
      console.log(`Готові до публікації: ${items.length}`)
      for (const item of items) console.log(`  ${item.file}  ${item.text.slice(0, 70)}`)
      console.log(`Сьогодні вже опубліковано: ${publishedToday(config)} з ${config.schedule.maxPerDay}`)
      return
    }

    case 'run': {
      const commit = args.includes('--yes')
      const results = await runDue(config, { commit })
      if (!results.length) return console.log('Нічого не готове до публікації.')
      for (const result of results) {
        const suffix = result.permalink ?? result.detail ?? ''
        console.log(`${result.action.padEnd(10)} ${result.item.file}  ${suffix}`)
      }
      if (!commit) console.log('\nПробний запуск. Для реальної публікації: run --yes')
      return
    }

    case 'published': {
      const items = listPublished(config)
      if (!items.length) return console.log('Ще нічого не опубліковано.')
      for (const item of items) {
        console.log(`${item.publishedAt ?? '?'}  ${item.postId ?? '?'}  ${item.permalink ?? ''}`)
      }
      return
    }

    case 'watch': {
      const report = await collectSignals(config, {
        keywords: config.monitor.keywords,
        all: args.includes('--all'),
      })

      if (!report.signals.length) {
        console.log(args.includes('--all') ? 'Сигналів немає.' : 'Нових сигналів немає.')
      }
      for (const signal of report.signals) {
        const who = signal.username ? `@${signal.username}` : 'невідомо'
        const tag = signal.matched ? `${signal.kind}:${signal.matched}` : signal.kind
        console.log(`[${tag}] ${who}  ${signal.timestamp ?? ''}`)
        console.log(`    ${signal.text.slice(0, 100).replace(/\n/g, ' ')}`)
        if (signal.permalink) console.log(`    ${signal.permalink}`)
      }

      for (const gap of report.unavailable) {
        console.log(`недоступно (${gap.source}): ${gap.reason}`)
      }
      return
    }

    case 'plan': {
      const plan = readPlan(config)
      if (!plan.raw.trim()) {
        return console.log(`Плану ще немає — створи ${config.content.planFile}`)
      }
      console.log(plan.raw.trim())
      const open = pendingTopics(plan)
      console.log(`\nНезакритих тем: ${open.length} з ${plan.topics.length}`)
      return
    }

    case 'generate': {
      const count = flag('--count') ? Number(flag('--count')) : undefined
      const brief = flag('--brief')
      const commit = args.includes('--yes')

      const result = await generateDrafts(config, { count, brief })
      const drafts = result.drafts
      if (!drafts.length) return console.log('Модель не повернула жодного варіанта.')
      const generationId = await tryRecord('генерацію', () => recordGeneration(result))

      // Slots are handed out in order, so queueing three drafts fills the next
      // three free slots rather than stacking them on one.
      const slots = commit ? nextSlots(drafts.length) : []
      const queued: { index: number; file: string }[] = []

      drafts.forEach((draft, index) => {
        console.log(`\n[${index + 1}] ${draft.topic}  (${draft.text.length} символів)`)
        console.log(`    ${draft.note}`)
        console.log(draft.text)
        for (const violation of draft.violations) console.log(`    ! ${violation.detail}`)

        if (!commit) return
        if (draft.violations.length) {
          console.log('    пропущено: не проходить обмеження')
          return
        }
        const at = slots[index]
        const item = addItem(config, draft.text, at)
        if (draft.planLine !== undefined) markTopicDone(config, draft.planLine)
        queued.push({ index, file: item.file })
        console.log(`    → черга: ${item.file} на ${at}`)
      })

      for (const entry of queued) {
        await tryRecord('чернетку в черзі', () => markDraftQueued(generationId, entry.index, entry.file))
      }
      await closeDb()

      if (!commit) console.log('\nПробний запуск. Щоб додати в чергу: generate --yes')
      return
    }

    case 'slots':
      for (const slot of nextSlots()) console.log(slot)
      return

    case 'help':
    case '--help':
      return console.log(COMMANDS.trim())

    default:
      throw new Error(`невідома команда "${command}"\n${COMMANDS}`)
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
