// Authored-first item source for the Daily Review.
//
// Finds the canonical authored puzzle for each skill by scanning the lesson
// registry in teaching order. Always returns authored content — AI-free by
// design. Generation (when AI is on) is the page/prefetch layer's concern;
// this module is the reliable fallback that works regardless of AI state.

import type { SequenceStep, ConditionalStep } from '../types'
import { isSequenceStep, isConditionalStep } from '../types'
import { listLessons } from './registry'
import type { Box } from '../adaptivity/leitner'
import { selectPuzzle } from './puzzleSelector'
import { difficultyForBox } from '../adaptivity/leitner'

export type ReviewItem = {
  skillId: string
  box: Box
  puzzle: SequenceStep | ConditionalStep
  source: 'authored' | 'generated'
  blankEditor: true
}

/**
 * Find the first authored puzzle step for a given skillId.
 * Walks lessons in teaching order; the first lesson whose `skillIds` includes
 * the skill and whose `steps` contain a sequence or conditional step wins.
 * Returns null only if no lesson covers the skill (none are orphaned).
 */
export function authoredItemForSkill(skillId: string): SequenceStep | ConditionalStep | null {
  for (const lesson of listLessons()) {
    if (!lesson.skillIds.includes(skillId)) continue
    for (const step of lesson.steps) {
      if (isSequenceStep(step) || isConditionalStep(step)) {
        return step
      }
    }
  }
  return null
}

/**
 * Build a ReviewItem for the given skill and Leitner box.
 * Always returns an authored puzzle with `source: 'authored'` and
 * `blankEditor: true`. AI generation is never called here; callers that want
 * a generated variant should upgrade the result at the page/prefetch layer.
 *
 * Throws if the skill has no authored puzzle (signals a content authoring gap
 * rather than silently returning an item with a null puzzle).
 */
export function reviewItemForSkill(skillId: string, box: Box): ReviewItem {
  const anchor = authoredItemForSkill(skillId)
  if (anchor === null) {
    throw new Error(
      `reviewItemForSkill: no authored puzzle found for skill "${skillId}". ` +
        'Every skill must have at least one authored sequence or conditional step.',
    )
  }
  const selected = selectPuzzle({
    skillId,
    targetDifficulty: difficultyForBox(box),
    preferMechanics: box >= 3,
    kind: anchor.type, // preserve this skill's existing step kind — no cross-kind leak
  })
  const puzzle = selected ? selected.step : anchor
  return { skillId, box, puzzle, source: 'authored', blankEditor: true }
}
