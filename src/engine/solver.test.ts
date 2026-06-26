import { describe, it, expect } from 'vitest'
import type { MapConfig } from '../types'
import { solvePlainMoves, solveWithinLimits } from './solver'
import { runInstructions } from './map'

describe('solvePlainMoves', () => {
  it('finds the shortest path on an open grid', () => {
    const map: MapConfig = { rows: 3, cols: 3, start: { row: 0, col: 0 }, goal: { row: 2, col: 2 } }
    const res = solvePlainMoves(map)
    expect(res.solvable).toBe(true)
    expect(res.optimalMoves).toBe(4)
    expect(res.solution).not.toBeNull()
    // The returned solution actually reaches the goal.
    const run = runInstructions(map, res.solution!)
    expect(run.status).toBe('success')
    expect(run.end).toEqual({ row: 2, col: 2 })
  })

  it('routes around obstacles', () => {
    const map: MapConfig = {
      rows: 3,
      cols: 3,
      start: { row: 0, col: 0 },
      goal: { row: 0, col: 2 },
      obstacles: [{ row: 0, col: 1 }],
    }
    const res = solvePlainMoves(map)
    expect(res.solvable).toBe(true)
    // Direct 2 is blocked; detour is 4.
    expect(res.optimalMoves).toBe(4)
  })

  it('reports unsolvable when the goal is walled off', () => {
    const map: MapConfig = {
      rows: 3,
      cols: 3,
      start: { row: 0, col: 0 },
      goal: { row: 2, col: 2 },
      obstacles: [
        { row: 2, col: 1 },
        { row: 1, col: 2 },
      ],
    }
    expect(solvePlainMoves(map).solvable).toBe(false)
  })

  it('treats start === goal as a zero-move solution', () => {
    const map: MapConfig = { rows: 2, cols: 2, start: { row: 1, col: 1 }, goal: { row: 1, col: 1 } }
    const res = solvePlainMoves(map)
    expect(res.solvable).toBe(true)
    expect(res.optimalMoves).toBe(0)
    expect(res.solution).toEqual([])
  })
})

describe('solveWithinLimits', () => {
  it('returns false when a long corridor needs more rights than allowed', () => {
    // 11-wide corridor needs 10 Right moves, but only 3 Right cards are offered:
    // no flat move-only program fits — a loop is required.
    const map: MapConfig = { rows: 1, cols: 11, start: { row: 0, col: 0 }, goal: { row: 0, col: 10 } }
    expect(solveWithinLimits(map, { right: 3 })).toBe(false)
  })

  it('returns true on an open grid reachable within the budget', () => {
    // 4-wide corridor needs 3 Right moves and exactly 3 are allowed.
    const map: MapConfig = { rows: 1, cols: 4, start: { row: 0, col: 0 }, goal: { row: 0, col: 3 } }
    expect(solveWithinLimits(map, { right: 3 })).toBe(true)
  })

  it('returns true when an open 3-move grid fits a mixed budget', () => {
    const map: MapConfig = { rows: 3, cols: 3, start: { row: 0, col: 0 }, goal: { row: 2, col: 1 } }
    expect(solveWithinLimits(map, { down: 2, right: 1 })).toBe(true)
  })

  it('treats commands absent from the limits as unlimited', () => {
    const map: MapConfig = { rows: 1, cols: 6, start: { row: 0, col: 0 }, goal: { row: 0, col: 5 } }
    // right is uncapped, so a flat solution exists despite no explicit budget.
    expect(solveWithinLimits(map, { up: 1 })).toBe(true)
  })

  it('returns false for the rocky loop corridor with scarce cards', () => {
    // Lesson 5 "Run, hop, run": 2x9 corridor, rocks at (1,3) and (1,6), only
    // right:3 / up:1 / down:1 — a flat path cannot reach the far end.
    const map: MapConfig = {
      rows: 2,
      cols: 9,
      start: { row: 1, col: 0 },
      goal: { row: 1, col: 8 },
      obstacles: [
        { row: 1, col: 3 },
        { row: 1, col: 6 },
      ],
    }
    expect(solveWithinLimits(map, { right: 3, up: 1, down: 1 })).toBe(false)
  })
})
