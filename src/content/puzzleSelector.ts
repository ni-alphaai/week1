// Pure puzzle selector shared by Review and Practice. Ranks authored
// sequence/conditional steps by difficulty proximity and mechanic engagement.
// NO `three`, NO `src/ai/*` runtime imports — keeps it out of code-split chunks.
import type { SequenceStep, ConditionalStep, Lesson } from '../types'
import { isSequenceStep, isConditionalStep } from '../types'
import { listLessons } from './registry'
import { scoreFor } from '../engine/difficulty'
import { mapMechanicsFromStep, authoredPracticeStep } from './generated'

export const MECHANIC_BONUS = 0.75

export type RankCandidate = { id: string; difficulty: number; mechanics: string[] }

/**
 * Pure ranking core. Among candidates, pick the lowest adjusted distance to
 * targetDifficulty; when preferMechanics, subtract MECHANIC_BONUS from the
 * distance of any candidate with ≥1 mechanic. Deterministic tie-break: raw
 * distance, then id. Returns the winning id, or null if there are no candidates.
 */
export function rankPuzzles(
  candidates: RankCandidate[],
  targetDifficulty: number,
  preferMechanics: boolean,
): string | null {
  if (candidates.length === 0) return null
  const scored = candidates.map((c) => {
    const rawDistance = Math.abs(c.difficulty - targetDifficulty)
    const adjusted =
      preferMechanics && c.mechanics.length > 0 ? rawDistance - MECHANIC_BONUS : rawDistance
    return { c, rawDistance, adjusted }
  })
  scored.sort(
    (a, b) =>
      a.adjusted - b.adjusted ||
      a.rawDistance - b.rawDistance ||
      (a.c.id < b.c.id ? -1 : a.c.id > b.c.id ? 1 : 0),
  )
  return scored[0].c.id
}

export type SelectedPuzzle = {
  step: SequenceStep | ConditionalStep
  lessonId: string
  difficulty: number
  mechanics: string[]
}

export type SelectOpts = {
  skillId: string
  targetDifficulty: number
  preferMechanics?: boolean
  exclude?: ReadonlySet<string>
  /** Restrict to one step kind so a conditional never leaks into a sequence skill (and vice versa). */
  kind?: 'sequence' | 'conditional'
}

type IndexEntry = {
  step: SequenceStep | ConditionalStep
  lessonId: string
  skillIds: string[]
  difficulty: number
  mechanics: string[]
  kind: 'sequence' | 'conditional'
}

let indexCache: IndexEntry[] | null = null

function buildIndex(): IndexEntry[] {
  if (indexCache) return indexCache
  const entries: IndexEntry[] = []
  for (const lesson of listLessons()) {
    for (const step of lesson.steps) {
      if (!isSequenceStep(step) && !isConditionalStep(step)) continue
      const difficulty = scoreFor(step.map, step.solution, step.cardLimits)
      const mechanics = mapMechanicsFromStep(step.map, step.availableActions)
      entries.push({
        step,
        lessonId: lesson.id,
        skillIds: lesson.skillIds,
        difficulty,
        mechanics,
        kind: isSequenceStep(step) ? 'sequence' : 'conditional',
      })
    }
  }
  indexCache = entries
  return entries
}

/**
 * Select the best authored puzzle for a skill at a target difficulty. Returns
 * null only when the skill has no authored steps of the requested kind (a
 * content gap, surfaced by callers). When `exclude` would empty the pool, it is
 * ignored (starve fallback) so a caller always gets a puzzle if one exists.
 */
export function selectPuzzle(opts: SelectOpts): SelectedPuzzle | null {
  const { skillId, targetDifficulty, preferMechanics = false, exclude, kind } = opts
  const index = buildIndex()
  const forSkill = index.filter(
    (e) => e.skillIds.includes(skillId) && (kind === undefined || e.kind === kind),
  )
  if (forSkill.length === 0) return null

  let pool = forSkill
  if (exclude && exclude.size > 0) {
    const filtered = forSkill.filter((e) => !exclude.has(e.step.id))
    if (filtered.length > 0) pool = filtered // starve fallback: keep full pool if exclude empties it
  }

  const winnerId = rankPuzzles(
    pool.map((e) => ({ id: e.step.id, difficulty: e.difficulty, mechanics: e.mechanics })),
    targetDifficulty,
    preferMechanics,
  )
  if (winnerId === null) return null
  const winner = pool.find((e) => e.step.id === winnerId)
  if (!winner) return null
  return {
    step: winner.step,
    lessonId: winner.lessonId,
    difficulty: winner.difficulty,
    mechanics: winner.mechanics,
  }
}

/**
 * AI-off authored practice base. Iterates the lesson's skills (fall-through) so
 * a conditionals-only lesson still resolves a runnable SEQUENCE practice step
 * via its planning/loops skill. Returns null only if no skill yields a runnable
 * sequence step (should not happen for authored lessons).
 */
export function authoredPracticeFloor(
  lesson: Lesson,
  targetDifficulty: number,
  exclude?: ReadonlySet<string>,
): SequenceStep | null {
  for (const skillId of lesson.skillIds) {
    const selected = selectPuzzle({
      skillId,
      targetDifficulty,
      kind: 'sequence',
      preferMechanics: true,
      exclude,
    })
    if (!selected) continue
    const step = authoredPracticeStep(selected.step, lesson)
    if (step) return step
  }
  return null
}
