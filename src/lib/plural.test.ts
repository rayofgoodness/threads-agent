import { describe, expect, it } from 'vitest'
import { counted, plural } from './plural.ts'

describe('plural', () => {
  const slot = (count: number) => plural(count, 'слот', 'слоти', 'слотів')

  it('agrees with one', () => {
    expect(slot(1)).toBe('слот')
    expect(slot(21)).toBe('слот')
    expect(slot(101)).toBe('слот')
  })

  it('agrees with two through four', () => {
    expect(slot(2)).toBe('слоти')
    expect(slot(4)).toBe('слоти')
    expect(slot(23)).toBe('слоти')
  })

  it('agrees with five and up', () => {
    expect(slot(0)).toBe('слотів')
    expect(slot(5)).toBe('слотів')
    expect(slot(100)).toBe('слотів')
  })

  it('treats the teens as many, including the ones ending in one', () => {
    expect(slot(11)).toBe('слотів')
    expect(slot(12)).toBe('слотів')
    expect(slot(14)).toBe('слотів')
    expect(slot(111)).toBe('слотів')
  })

  it('joins the number to its noun', () => {
    expect(counted(3, 'пост', 'пости', 'постів')).toBe('3 пости')
  })
})
