/**
 * Publishing slots as instants, computed in the account's timezone.
 *
 * The queue stores an absolute `publishAt`, but the schedule is written as
 * wall-clock times in `agent.config.json` — «09:30» means half past nine in
 * Kyiv whether the browser is in Kyiv or not. Everything here exists to keep
 * those two facts from quietly drifting apart twice a year.
 */

/** How far a zone is from UTC at a given instant, in milliseconds. */
function offsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)

  const at = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? '0')
  // `hour` comes back as 24 at midnight under hour12: false in some engines.
  const asUtc = Date.UTC(at('year'), at('month') - 1, at('day'), at('hour') % 24, at('minute'), at('second'))
  return asUtc - instant.getTime()
}

/**
 * The instant at which the given wall-clock time occurs in `timeZone`.
 *
 * Applied twice: the first correction can land on the other side of a DST
 * boundary, and the second settles it.
 */
export function zonedInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute)
  let instant = new Date(naive - offsetMs(new Date(naive), timeZone))
  instant = new Date(naive - offsetMs(instant, timeZone))
  return instant
}

/** Calendar date in the given zone, as [year, month, day]. */
export function zonedDay(instant: Date, timeZone: string): [number, number, number] {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
  const [year = '1970', month = '01', day = '01'] = iso.split('-')
  return [Number(year), Number(month), Number(day)]
}

export interface Slot {
  /** Absolute instant this slot falls on. */
  at: Date
  /** «09:30», exactly as the config wrote it. */
  label: string
}

/**
 * The next `count` slots after `from`, earliest first.
 *
 * Days are walked one at a time and the whole day's slots are sorted, because
 * a config may list them out of order and «18:00, 09:30» must still produce a
 * morning before an evening.
 */
export function upcomingSlots(
  slots: string[],
  timeZone: string,
  count = 4,
  from = new Date(),
): Slot[] {
  const parsed = slots
    .map((label) => {
      const [hour, minute] = label.split(':')
      return { label, hour: Number(hour), minute: Number(minute ?? 0) }
    })
    .filter((slot) => Number.isFinite(slot.hour) && Number.isFinite(slot.minute))

  if (!parsed.length) return []

  const found: Slot[] = []
  const [year, month, day] = zonedDay(from, timeZone)

  for (let offset = 0; offset < 14 && found.length < count; offset += 1) {
    // Day arithmetic through UTC noon avoids landing on a missing local hour.
    const cursor = new Date(Date.UTC(year, month - 1, day + offset, 12))
    const [y, m, d] = zonedDay(cursor, timeZone)

    const ofDay = parsed
      .map((slot) => ({ label: slot.label, at: zonedInstant(y, m, d, slot.hour, slot.minute, timeZone) }))
      .filter((slot) => slot.at.getTime() > from.getTime())
      .sort((a, b) => a.at.getTime() - b.at.getTime())

    for (const slot of ofDay) {
      if (found.length < count) found.push(slot)
    }
  }

  return found
}

/** How many minutes apart two instants are, unsigned. */
const minutesBetween = (a: Date, b: Date) => Math.abs(a.getTime() - b.getTime()) / 60_000

/**
 * Pair each upcoming slot with the queued item that will fill it.
 *
 * Matched by proximity rather than equality: an item scheduled by hand for
 * 09:32 is filling the 09:30 slot, and calling that slot empty would send the
 * operator to write a post that is already written.
 */
export function fillSlots<T extends { publishAt?: string }>(
  slots: Slot[],
  items: T[],
  toleranceMinutes = 45,
): { slot: Slot; item?: T }[] {
  const taken = new Set<T>()

  return slots.map((slot) => {
    const item = items.find((candidate) => {
      if (taken.has(candidate) || !candidate.publishAt) return false
      const at = new Date(candidate.publishAt)
      return !Number.isNaN(at.getTime()) && minutesBetween(at, slot.at) <= toleranceMinutes
    })
    if (item) taken.add(item)
    return item ? { slot, item } : { slot }
  })
}
