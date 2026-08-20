/**
 * Ukrainian numeral agreement.
 *
 * «4 слотів» is wrong and reads like machine output, which is exactly what a
 * surface written by a machine cannot afford to look like.
 */
export function plural(count: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(count) % 100
  const mod10 = mod100 % 10

  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

/** `4 слоти` — the number and its agreeing noun. */
export const counted = (count: number, one: string, few: string, many: string) =>
  `${count} ${plural(count, one, few, many)}`
