import type { MasteryTier } from '../storage/progress'

/** Maps a mastery tier to its CSS modifier class (.tier--novice … .tier--master). */
export const TIER_CLASS: Record<MasteryTier, string> = {
  Novice: 'tier--novice',
  Apprentice: 'tier--apprentice',
  Skilled: 'tier--skilled',
  Master: 'tier--master',
}
