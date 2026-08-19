import type { AgentConfig } from './config.ts'

/**
 * Next occurrences of the configured slots, in order.
 *
 * Used both to place a manual draft and to spread a batch of generated ones —
 * asking for three gives three different slots, not the same one three times.
 */
export function nextSlots(config: AgentConfig, count = 4, now = new Date()): string[] {
  const slots: string[] = []
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
