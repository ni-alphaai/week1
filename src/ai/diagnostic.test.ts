import { describe, it, expect } from 'vitest'
import type { Instruction, MapConfig } from '../types'
import { runInstructions } from '../engine/map'
import { buildDiagnostic } from './diagnostic'
import type { SuccessRule } from '../types'

function diagnose(
  map: MapConfig,
  instructions: Instruction[],
  successRule: SuccessRule = 'reachGoal',
  optimal?: number,
) {
  const run = runInstructions(map, instructions)
  return buildDiagnostic({ map, successRule, optimal, instructions, run })
}

describe('buildDiagnostic', () => {
  it('flags an empty program', () => {
    const map: MapConfig = { rows: 1, cols: 3, start: { row: 0, col: 0 }, goal: { row: 0, col: 2 } }
    expect(diagnose(map, []).kind).toBe('empty')
  })

  it('flags walking off the map', () => {
    const map: MapConfig = { rows: 1, cols: 3, start: { row: 0, col: 0 }, goal: { row: 0, col: 2 } }
    expect(diagnose(map, ['left']).kind).toBe('offMap')
  })

  it('flags crashing into a rock', () => {
    const map: MapConfig = {
      rows: 1,
      cols: 3,
      start: { row: 0, col: 0 },
      goal: { row: 0, col: 2 },
      obstacles: [{ row: 0, col: 1 }],
    }
    expect(diagnose(map, ['right']).kind).toBe('crashed')
  })

  it('flags stopping off the goal', () => {
    const map: MapConfig = { rows: 1, cols: 3, start: { row: 0, col: 0 }, goal: { row: 0, col: 2 } }
    expect(diagnose(map, ['right']).kind).toBe('missedGoal')
  })

  it('flags too many moves on a shortest-path puzzle', () => {
    const map: MapConfig = { rows: 3, cols: 3, start: { row: 0, col: 0 }, goal: { row: 0, col: 2 } }
    const d = diagnose(map, ['down', 'right', 'right', 'up'], 'shortestPath', 2)
    expect(d.kind).toBe('tooManyMoves')
    expect(d.movesUsed).toBe(4)
    expect(d.endedOnGoal).toBe(true)
  })

  it('flags an illegal action', () => {
    const map: MapConfig = { rows: 1, cols: 3, start: { row: 0, col: 0 }, goal: { row: 0, col: 2 } }
    expect(diagnose(map, ['pickup']).kind).toBe('badAction')
  })

  it('summaries never contain direction words (spoiler-free)', () => {
    const map: MapConfig = { rows: 1, cols: 3, start: { row: 0, col: 0 }, goal: { row: 0, col: 2 } }
    const summary = diagnose(map, ['right']).summary.toLowerCase()
    for (const dir of ['up', 'down', 'left', 'right']) {
      expect(summary.includes(dir)).toBe(false)
    }
  })
})
