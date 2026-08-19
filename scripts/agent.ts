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
`

/** Next occurrence of each configured slot, in the account's timezone. */
function nextSlots(count = 4): string[] {
  const slots: string[] = []
  const now = new Date()
  for (let day = 0; slots.length < count && day < 14; day++) {
    for (const slot of config.schedule.slots) {
      const [hours = '0', minutes = '0'] = slot.split(':')
      const when = new Date(now)
      when.setDate(now.getDate() + day)
      when.setHours(Number(hours), Number(minutes), 0, 0)
      if (when > now && slots.length < count) slots.push(when.toISOString())
    }
  }
  return slots
}

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
