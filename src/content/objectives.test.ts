import { describe, it, expect } from 'vitest'
import type { MapConfig } from '../types'
import { describeObjectives } from './objectives'

const baseMap: MapConfig = {
  rows: 3,
  cols: 3,
  start: { row: 2, col: 0 },
  goal: { row: 0, col: 2 },
}

describe('describeObjectives', () => {
  it('describes a plain reach-the-goal map', () => {
    expect(describeObjectives(baseMap)).toEqual(['Reach the chest'])
  })

  it('pluralizes keys and checkpoints and keeps the goal last', () => {
    const map: MapConfig = {
      ...baseMap,
      keys: [{ row: 1, col: 0 }],
      checkpoints: [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ],
    }
    expect(describeObjectives(map)).toEqual(['Grab the key', 'Visit 2 stops', 'Reach the chest'])
  })

  it('describes a single fetch-and-carry task', () => {
    const map: MapConfig = {
      ...baseMap,
      tasks: [{ from: { row: 2, col: 1 }, to: { row: 0, col: 0 } }],
    }
    expect(describeObjectives(map)).toContain('Carry the gem to its flag')
  })

  it('mentions plates only when there is a gate to open', () => {
    const map: MapConfig = {
      ...baseMap,
      gates: [{ id: 'g1', at: { row: 1, col: 1 }, open: false }],
      plates: [{ at: { row: 2, col: 1 }, gateId: 'g1', mode: 'open' }],
    }
    expect(describeObjectives(map)).toContain('Step on a plate to open the gate')
  })

  it('uses the target value for binary-search maps instead of a chest', () => {
    const map: MapConfig = {
      ...baseMap,
      targetValue: 7,
      binarySearch: true,
      numberTiles: [{ at: { row: 1, col: 0 }, value: 7 }],
    }
    const lines = describeObjectives(map)
    expect(lines).toContain('Find 7')
    expect(lines).not.toContain('Reach the chest')
  })
})
