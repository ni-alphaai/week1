// Ordering + date helpers for badge galleries (HomePage treasures, Progress
// dashboard). Pure functions over the canonical badge id list so both pages
// sort identically.

import type { BadgeRarity } from '../types'
import { badgeMeta } from './badges'

export type BadgeSort = 'rarity' | 'date'

// Rarest first.
const RARITY_RANK: Record<BadgeRarity, number> = { rare: 0, uncommon: 1, common: 2 }

const badgeDateFormat = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
})

/** Short earned-date label (e.g. "Jan 1, 2025"); empty string for missing/0 timestamps. */
export function formatBadgeDate(ms: number | undefined): string {
  if (ms == null || ms <= 0) return ''
  return badgeDateFormat.format(new Date(ms))
}

/**
 * Order badge ids for display. `acquiredAt` maps id → epoch-ms earned time;
 * `isEarned` distinguishes earned badges from locked goals.
 *
 * - 'rarity': rarest first; within a rarity, earned before locked, then canonical order.
 * - 'date':  most-recently earned first; earned-without-a-date next; locked last.
 *
 * The sort is stable on the canonical index so equal keys never shuffle.
 */
export function sortBadgeIds(
  ids: string[],
  sort: BadgeSort,
  acquiredAt: Record<string, number>,
  isEarned: (id: string) => boolean,
): string[] {
  const canonical = new Map(ids.map((id, i) => [id, i]))
  const idx = (id: string) => canonical.get(id) ?? 0
  return [...ids].sort((a, b) => {
    if (sort === 'date') {
      const da = isEarned(a) ? (acquiredAt[a] ?? 0) : -1
      const db = isEarned(b) ? (acquiredAt[b] ?? 0) : -1
      if (da !== db) return db - da
      return idx(a) - idx(b)
    }
    const ra = RARITY_RANK[badgeMeta(a).rarity]
    const rb = RARITY_RANK[badgeMeta(b).rarity]
    if (ra !== rb) return ra - rb
    const ea = isEarned(a) ? 0 : 1
    const eb = isEarned(b) ? 0 : 1
    if (ea !== eb) return ea - eb
    return idx(a) - idx(b)
  })
}
