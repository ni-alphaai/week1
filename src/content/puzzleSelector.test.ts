import { describe, it, expect } from 'vitest'
import { rankPuzzles, MECHANIC_BONUS, selectPuzzle, authoredPracticeFloor } from './puzzleSelector'
import { listLessons } from './registry'

describe('rankPuzzles', () => {
  it('returns null for an empty candidate list', () => {
    expect(rankPuzzles([], 4, false)).toBe(null)
  })

  it('picks the closest difficulty to the target', () => {
    const candidates = [
      { id: 'a', difficulty: 3, mechanics: [] },
      { id: 'b', difficulty: 4.2, mechanics: [] },
      { id: 'c', difficulty: 5, mechanics: [] },
    ]
    expect(rankPuzzles(candidates, 4, false)).toBe('b')
  })

  it('out-of-range target resolves to the closest available (sequencing@5 case)', () => {
    const candidates = [
      { id: 'a', difficulty: 3, mechanics: [] },
      { id: 'b', difficulty: 4.25, mechanics: [] },
    ]
    expect(rankPuzzles(candidates, 5, false)).toBe('b')
  })

  it('preferMechanics promotes a mechanic-bearing puzzle within the bonus window', () => {
    // plain 'a' is exactly on target (distance 0); 'b' is 0.5 off but has a mechanic.
    // adjusted: a=0, b=0.5-0.75=-0.25 -> b wins.
    const candidates = [
      { id: 'a', difficulty: 4, mechanics: [] },
      { id: 'b', difficulty: 4.5, mechanics: ['keys-and-doors'] },
    ]
    expect(rankPuzzles(candidates, 4, true)).toBe('b')
  })

  it('preferMechanics does NOT promote a mechanic puzzle outside the bonus window', () => {
    // 'b' is 1.0 off (> MECHANIC_BONUS) so adjusted 0.25 still loses to plain on-target 'a' (0).
    const candidates = [
      { id: 'a', difficulty: 4, mechanics: [] },
      { id: 'b', difficulty: 5, mechanics: ['ice'] },
    ]
    expect(rankPuzzles(candidates, 4, true)).toBe('a')
    expect(MECHANIC_BONUS).toBe(0.75)
  })

  it('breaks ties deterministically by raw distance then id', () => {
    const candidates = [
      { id: 'z', difficulty: 4, mechanics: [] },
      { id: 'a', difficulty: 4, mechanics: [] },
    ]
    expect(rankPuzzles(candidates, 4, false)).toBe('a')
  })
})

describe('selectPuzzle (real authored content)', () => {
  it('returns null for an unknown skill', () => {
    expect(selectPuzzle({ skillId: 'no-such-skill', targetDifficulty: 4 })).toBe(null)
  })

  it('returns a step for a real skill', () => {
    const sel = selectPuzzle({ skillId: 'planning', targetDifficulty: 4 })
    expect(sel).not.toBe(null)
    expect(sel!.step.id).toBeTruthy()
  })

  it('picks a harder puzzle at a higher target where the skill has range', () => {
    const low = selectPuzzle({ skillId: 'planning', targetDifficulty: 3 })
    const high = selectPuzzle({ skillId: 'planning', targetDifficulty: 5 })
    expect(low).not.toBe(null)
    expect(high).not.toBe(null)
    expect(high!.difficulty).toBeGreaterThanOrEqual(low!.difficulty)
    expect(high!.step.id).not.toBe(low!.step.id)
  })

  it('exclude changes the pick', () => {
    const first = selectPuzzle({ skillId: 'planning', targetDifficulty: 4 })
    expect(first).not.toBe(null)
    const second = selectPuzzle({
      skillId: 'planning',
      targetDifficulty: 4,
      exclude: new Set([first!.step.id]),
    })
    expect(second).not.toBe(null)
    expect(second!.step.id).not.toBe(first!.step.id)
  })

  it('starve fallback: excluding every step still returns a puzzle', () => {
    // Collect every planning step id by excluding picks until they repeat.
    const ids = new Set<string>()
    for (let i = 0; i < 40; i++) {
      const sel = selectPuzzle({ skillId: 'planning', targetDifficulty: 4, exclude: ids })
      if (!sel) break
      if (ids.has(sel.step.id)) break
      ids.add(sel.step.id)
    }
    // Now exclude all known ids; starve fallback must still hand back a puzzle.
    const sel = selectPuzzle({ skillId: 'planning', targetDifficulty: 4, exclude: ids })
    expect(sel).not.toBe(null)
  })

  it('kind anchor keeps a sequence skill on sequence steps', () => {
    const sel = selectPuzzle({ skillId: 'loops', targetDifficulty: 5, kind: 'sequence' })
    expect(sel).not.toBe(null)
    expect(sel!.step.type).toBe('sequence')
  })
})

describe('authoredPracticeFloor', () => {
  it('returns a runnable sequence practice step for every lesson (AI-off floor)', () => {
    for (const lesson of listLessons()) {
      const step = authoredPracticeFloor(lesson, 4)
      expect(step, `lesson ${lesson.id} must have an authored floor`).not.toBe(null)
      expect(step!.type).toBe('sequence')
    }
  })
})
