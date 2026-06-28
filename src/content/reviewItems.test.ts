import { describe, it, expect } from 'vitest'
import { authoredItemForSkill, reviewItemForSkill } from './reviewItems'
import { mapMechanicsFromStep } from './generated'

describe('authored-first review items', () => {
  it('returns an authored puzzle for every known skill (none orphaned)', () => {
    for (const skill of ['sequencing', 'loops', 'conditionals', 'planning']) {
      expect(authoredItemForSkill(skill)).not.toBeNull()
    }
  })
  it('reviewItemForSkill serves the authored puzzle with a blank editor by default', () => {
    const item = reviewItemForSkill('loops', 1)
    expect(item.source).toBe('authored')
    expect(item.blankEditor).toBe(true)
    expect(item.puzzle).toBeTruthy()
  })
})

describe('reviewItemForSkill — box-aware selection', () => {
  it('selects different puzzles for a low vs high box where the skill has range', () => {
    const low = reviewItemForSkill('planning', 1)
    const high = reviewItemForSkill('planning', 5)
    expect(low.puzzle.id).not.toBe(high.puzzle.id)
  })

  it('preserves the skill step kind so conditionals never leak into a sequence skill', () => {
    // loops review is a sequence skill today; conditionals review is conditional.
    expect(reviewItemForSkill('loops', 5).puzzle.type).toBe('sequence')
    expect(reviewItemForSkill('conditionals', 5).puzzle.type).toBe('conditional')
  })

  it('at a high box, prefers a mechanic-bearing puzzle when the skill has one', () => {
    const high = reviewItemForSkill('planning', 5)
    const mechanics = mapMechanicsFromStep(high.puzzle.map, high.puzzle.availableActions)
    expect(mechanics.length).toBeGreaterThan(0)
  })

  it('still throws for a skill with no authored puzzle', () => {
    expect(() => reviewItemForSkill('no-such-skill', 1)).toThrow()
  })
})
