export type Box = 1 | 2 | 3 | 4 | 5
export const BOX_INTERVALS_DAYS = [1, 2, 4, 7, 14] as const
const DAY_MS = 24 * 60 * 60 * 1000

export function intervalDays(box: Box): number { return BOX_INTERVALS_DAYS[box - 1] }
export function promote(box: Box): Box { return (box >= 5 ? 5 : box + 1) as Box }
export function reset(): Box { return 1 }

export function isDue(box: Box, lastReviewedAt: number | null, now: number): boolean {
  if (lastReviewedAt == null) return true
  return now - lastReviewedAt >= intervalDays(box) * DAY_MS
}

export function supportLevel(box: Box): 'supported' | 'neutral' | 'faded' {
  if (box <= 2) return 'supported'
  if (box === 3) return 'neutral'
  return 'faded'
}

export function difficultyForBox(box: Box): number {
  if (box <= 2) return 3
  if (box === 3) return 4
  return 5
}
