import { describe, it, expect } from 'vitest'
import type { Conditional, MapConfig, StepFeedback } from '../types'
import { checkProgram } from './checker'
import type { ProgramSpec } from './checker'

const feedback: StepFeedback = { correct: 'Nice!', hints: ['Think about the path.'] }

const reachMap: MapConfig = {
  rows: 3,
  cols: 3,
  start: { row: 2, col: 0 },
  goal: { row: 0, col: 2 },
}

function reachSpec(extra?: Partial<ProgramSpec>): ProgramSpec {
  return { map: reachMap, successRule: 'reachGoal', feedback, ...extra }
}

describe('checkProgram — reachGoal', () => {
  it('accepts any legal path that lands on the goal', () => {
    const result = checkProgram(reachSpec(), ['up', 'up', 'right', 'right'])
    expect(result.correct).toBe(true)
    expect(result.message).toBe(feedback.correct)
  })

  it('rejects an empty program with a nudge to add commands', () => {
    const result = checkProgram(reachSpec(), [])
    expect(result.correct).toBe(false)
    expect(result.message).toMatch(/command cards/i)
  })

  it('explains an off-map crash without solution spoilers', () => {
    const result = checkProgram(reachSpec(), ['down'])
    expect(result.correct).toBe(false)
    expect(result.message).toMatch(/off the edge/i)
    expect(result.message).not.toMatch(/Think about/)
  })

  it('explains hitting a blocked tile', () => {
    const spec = reachSpec({ map: { ...reachMap, obstacles: [{ row: 1, col: 0 }] } })
    const result = checkProgram(spec, ['up'])
    expect(result.correct).toBe(false)
    expect(result.message).toMatch(/blocked tile/i)
  })

  it('explains stopping short of the treasure', () => {
    const result = checkProgram(reachSpec(), ['up'])
    expect(result.correct).toBe(false)
    expect(result.message).toMatch(/not on the treasure/i)
  })
})

describe('checkProgram — shortestPath', () => {
  const spec: ProgramSpec = {
    map: { rows: 1, cols: 5, start: { row: 0, col: 0 }, goal: { row: 0, col: 3 } },
    successRule: 'shortestPath',
    optimal: 3,
    feedback,
  }

  it('accepts the minimum-move solution', () => {
    const result = checkProgram(spec, ['right', 'right', 'right'])
    expect(result.correct).toBe(true)
  })

  it('rejects a longer route without revealing the optimal count', () => {
    const result = checkProgram(spec, ['right', 'right', 'right', 'right', 'left'])
    expect(result.correct).toBe(false)
    expect(result.message).toMatch(/more moves than you needed/i)
    expect(result.message).not.toContain('3')
  })
})

describe('checkProgram — checkpoints', () => {
  it('rejects reaching the goal before all delivery stops', () => {
    const map: MapConfig = {
      rows: 3,
      cols: 3,
      start: { row: 2, col: 0 },
      goal: { row: 0, col: 2 },
      checkpoints: [{ row: 2, col: 1 }],
    }
    const result = checkProgram({ map, successRule: 'reachGoal', feedback }, ['up', 'up', 'right', 'right'])
    expect(result.correct).toBe(false)
    expect(result.message).toMatch(/delivery stop/i)
  })
})

describe('checkProgram — fetch and carry', () => {
  const carryMap: MapConfig = {
    rows: 1,
    cols: 5,
    start: { row: 0, col: 0 },
    goal: { row: 0, col: 4 },
    tasks: [{ from: { row: 0, col: 1 }, to: { row: 0, col: 3 }, label: 'the gem' }],
  }

  it('accepts a full pickup-carry-drop solution', () => {
    const result = checkProgram({ map: carryMap, successRule: 'reachGoal', feedback }, [
      'right',
      'pickup',
      'right',
      'right',
      'drop',
      'right',
    ])
    expect(result.correct).toBe(true)
  })

  it('rejects reaching the goal without delivering', () => {
    const result = checkProgram({ map: carryMap, successRule: 'reachGoal', feedback }, [
      'right',
      'right',
      'right',
      'right',
    ])
    expect(result.correct).toBe(false)
    expect(result.message).toMatch(/deliver/i)
  })

  it('explains an illegal action without spoilers', () => {
    const result = checkProgram({ map: carryMap, successRule: 'reachGoal', feedback }, ['pickup'])
    expect(result.correct).toBe(false)
    expect(result.message).toMatch(/nothing to pick up/i)
    expect(result.message).not.toMatch(/Think about/)
  })
})

describe('checkProgram — if / else sensors', () => {
  const map: MapConfig = {
    rows: 2,
    cols: 4,
    start: { row: 1, col: 0 },
    goal: { row: 1, col: 3 },
    obstacles: [{ row: 1, col: 1 }],
  }
  const hop: Conditional = {
    kind: 'conditional',
    predicate: { sensor: 'blocked', dir: 'right' },
    label: 'If wall on right',
    then: ['up', 'right', 'right', 'down'],
    else: ['right'],
  }

  it('hops a wall by taking the THEN branch when the sensor fires', () => {
    const result = checkProgram({ map, successRule: 'reachGoal', feedback }, [hop, 'right'])
    expect(result.correct).toBe(true)
  })

  it('explains a loop that never stops', () => {
    const corridor: MapConfig = { rows: 3, cols: 3, start: { row: 1, col: 1 }, goal: { row: 0, col: 0 } }
    const result = checkProgram({ map: corridor, successRule: 'reachGoal', feedback }, [
      { kind: 'while', predicate: { sensor: 'clear', dir: 'right' }, body: ['up', 'down'], label: 'spinner' },
    ])
    expect(result.correct).toBe(false)
    expect(result.message).toMatch(/never stopped/i)
  })
})
