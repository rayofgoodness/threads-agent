import { describe, expect, it } from 'vitest'
import { fillSlots, upcomingSlots, zonedDay, zonedInstant } from './slots.ts'

const KYIV = 'Europe/Kyiv'

describe('zonedInstant', () => {
  it('resolves a wall-clock time in the zone, not in the runtime locale', () => {
    // Kyiv is UTC+3 in August.
    expect(zonedInstant(2026, 8, 20, 9, 30, KYIV).toISOString()).toBe('2026-08-20T06:30:00.000Z')
  })

  it('follows the zone across a daylight-saving boundary', () => {
    // Kyiv is UTC+2 in January.
    expect(zonedInstant(2026, 1, 20, 9, 30, KYIV).toISOString()).toBe('2026-01-20T07:30:00.000Z')
  })
})

describe('zonedDay', () => {
  it('reports the calendar date as the zone sees it', () => {
    // 23:30 UTC is already the next day in Kyiv.
    expect(zonedDay(new Date('2026-08-20T23:30:00Z'), KYIV)).toEqual([2026, 8, 21])
  })
})

describe('upcomingSlots', () => {
  const from = new Date('2026-08-20T07:00:00Z') // 10:00 in Kyiv

  it('skips slots that have already passed today', () => {
    const slots = upcomingSlots(['09:30', '18:00'], KYIV, 3, from)

    expect(slots.map((slot) => slot.label)).toEqual(['18:00', '09:30', '18:00'])
    expect(slots[0]?.at.toISOString()).toBe('2026-08-20T15:00:00.000Z')
    expect(slots[1]?.at.toISOString()).toBe('2026-08-21T06:30:00.000Z')
  })

  it('orders a day whose slots were configured backwards', () => {
    const slots = upcomingSlots(['18:00', '09:30'], KYIV, 2, new Date('2026-08-20T00:00:00Z'))

    expect(slots.map((slot) => slot.label)).toEqual(['09:30', '18:00'])
  })

  it('returns nothing when no slots are configured', () => {
    expect(upcomingSlots([], KYIV, 3, from)).toEqual([])
  })
})

describe('fillSlots', () => {
  const slots = upcomingSlots(['09:30', '18:00'], KYIV, 2, new Date('2026-08-20T07:00:00Z'))

  it('marks a slot empty when nothing is queued near it', () => {
    expect(fillSlots(slots, []).every((pair) => pair.item === undefined)).toBe(true)
  })

  it('counts an item scheduled a few minutes off as filling the slot', () => {
    const item = { publishAt: '2026-08-20T15:02:00.000Z' }

    expect(fillSlots(slots, [item])[0]?.item).toBe(item)
  })

  it('does not let one item fill two slots', () => {
    const item = { publishAt: '2026-08-20T15:00:00.000Z' }
    const filled = fillSlots(slots, [item])

    expect(filled[0]?.item).toBe(item)
    expect(filled[1]?.item).toBeUndefined()
  })

  it('leaves a slot empty when the only queued item is hours away', () => {
    expect(fillSlots(slots, [{ publishAt: '2026-08-20T20:00:00.000Z' }])[0]?.item).toBeUndefined()
  })
})
