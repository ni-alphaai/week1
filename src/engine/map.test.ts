import { describe, it, expect } from 'vitest'
import type { Conditional, Loop, MapConfig, While } from '../types'
import {
  carryFrames,
  evalPredicate,
  isObstacle,
  runInstructions,
  runProgram,
  samePos,
  checkpointsVisitedInOrder,
} from './map'

const baseMap: MapConfig = {
  rows: 3,
  cols: 3,
  start: { row: 2, col: 0 },
  goal: { row: 0, col: 2 },
}

describe('samePos', () => {
  it('matches identical coordinates', () => {
    expect(samePos({ row: 1, col: 1 }, { row: 1, col: 1 })).toBe(true)
  })
  it('rejects different coordinates', () => {
    expect(samePos({ row: 1, col: 1 }, { row: 1, col: 2 })).toBe(false)
  })
})

describe('isObstacle', () => {
  it('detects a listed rock', () => {
    const map: MapConfig = { ...baseMap, obstacles: [{ row: 1, col: 1 }] }
    expect(isObstacle(map, { row: 1, col: 1 })).toBe(true)
    expect(isObstacle(map, { row: 0, col: 0 })).toBe(false)
  })
})

describe('runProgram', () => {
  it('reaches the goal with a valid path', () => {
    const result = runProgram(baseMap, ['up', 'up', 'right', 'right'])
    expect(result.status).toBe('success')
    expect(result.end).toEqual({ row: 0, col: 2 })
    expect(result.steps).toBe(4)
    expect(result.failIndex).toBeNull()
    expect(result.path).toHaveLength(5)
  })

  it('reports offMap and stops before leaving the grid', () => {
    const result = runProgram(baseMap, ['left'])
    expect(result.status).toBe('offMap')
    expect(result.failIndex).toBe(0)
    expect(result.end).toEqual({ row: 2, col: 0 })
    expect(result.path).toHaveLength(1)
  })

  it('reports hitRock when a move lands on an obstacle', () => {
    const map: MapConfig = { ...baseMap, obstacles: [{ row: 1, col: 0 }] }
    const result = runProgram(map, ['up'])
    expect(result.status).toBe('hitRock')
    expect(result.failIndex).toBe(0)
    expect(result.end).toEqual({ row: 2, col: 0 })
  })

  it('reports missedGoal when the path is legal but ends elsewhere', () => {
    const result = runProgram(baseMap, ['up'])
    expect(result.status).toBe('missedGoal')
    expect(result.end).toEqual({ row: 1, col: 0 })
    expect(result.failIndex).toBeNull()
  })

  it('handles an empty program by staying on the start tile', () => {
    const result = runProgram(baseMap, [])
    expect(result.status).toBe('missedGoal')
    expect(result.end).toEqual(baseMap.start)
    expect(result.path).toEqual([baseMap.start])
  })
})

describe('runProgram — fetch and carry', () => {
  const carryMap: MapConfig = {
    rows: 1,
    cols: 5,
    start: { row: 0, col: 0 },
    goal: { row: 0, col: 4 },
    tasks: [{ from: { row: 0, col: 1 }, to: { row: 0, col: 3 } }],
  }

  it('completes a pickup-and-drop run', () => {
    const result = runProgram(carryMap, ['right', 'pickup', 'right', 'right', 'drop', 'right'])
    expect(result.status).toBe('success')
    expect(result.tasksCompleted).toBe(1)
    expect(result.carryingAtEnd).toBe(false)
    expect(result.events.map((e) => e.type)).toEqual(['pickup', 'drop'])
    expect(result.executed).toEqual(['right', 'pickup', 'right', 'right', 'drop', 'right'])
  })

  it('fails a pickup on the wrong tile', () => {
    const result = runProgram(carryMap, ['pickup'])
    expect(result.status).toBe('badAction')
    expect(result.actionError).toMatch(/nothing to pick up/i)
  })

  it('reaching the goal still carrying leaves the task incomplete', () => {
    const result = runProgram(carryMap, ['right', 'pickup', 'right', 'right', 'right'])
    expect(result.status).toBe('success')
    expect(result.tasksCompleted).toBe(0)
    expect(result.carryingAtEnd).toBe(true)
  })
})

describe('evalPredicate', () => {
  const map: MapConfig = { rows: 3, cols: 3, start: { row: 1, col: 0 }, goal: { row: 0, col: 2 }, obstacles: [{ row: 1, col: 1 }] }
  const state = {
    pos: { row: 1, col: 0 },
    carrying: false,
    taskIndex: 0,
    path: [],
    events: [],
    worldEvents: [],
    executed: [],
    gates: {},
    keysHeld: 0,
    keysTaken: new Set<string>(),
  }

  it('senses a wall (rock) to the right', () => {
    expect(evalPredicate(map, state, { sensor: 'blocked', dir: 'right' })).toBe(true)
    expect(evalPredicate(map, state, { sensor: 'clear', dir: 'right' })).toBe(false)
  })

  it('senses the edge of the map as blocked', () => {
    expect(evalPredicate(map, state, { sensor: 'blocked', dir: 'left' })).toBe(true)
  })

  it('senses open ground above', () => {
    expect(evalPredicate(map, state, { sensor: 'clear', dir: 'up' })).toBe(true)
  })
})

describe('runInstructions — control flow', () => {
  it('runs a for-loop body the given number of times', () => {
    const loop: Loop = { kind: 'loop', count: 2, body: ['up', 'right'], label: '2x up,right' }
    const result = runInstructions(baseMap, [loop])
    expect(result.status).toBe('success')
    expect(result.executed).toEqual(['up', 'right', 'up', 'right'])
  })

  it('picks the THEN branch of a conditional when the sensor is true', () => {
    const map: MapConfig = { rows: 2, cols: 3, start: { row: 1, col: 0 }, goal: { row: 1, col: 2 }, obstacles: [{ row: 1, col: 1 }] }
    const cond: Conditional = {
      kind: 'conditional',
      predicate: { sensor: 'blocked', dir: 'right' },
      then: ['up', 'right', 'right', 'down'],
      else: ['right', 'right'],
      label: 'if wall right',
    }
    const result = runInstructions(map, [cond])
    expect(result.status).toBe('success')
    expect(result.executed).toEqual(['up', 'right', 'right', 'down'])
  })

  it('runs a while-loop until a wall blocks it', () => {
    const map: MapConfig = { rows: 1, cols: 5, start: { row: 0, col: 0 }, goal: { row: 0, col: 4 } }
    const w: While = { kind: 'while', predicate: { sensor: 'clear', dir: 'right' }, body: ['right'], label: 'while right clear' }
    const result = runInstructions(map, [w])
    expect(result.status).toBe('success')
    expect(result.end).toEqual({ row: 0, col: 4 })
    expect(result.executed).toHaveLength(4)
  })

  it('stops a while-loop at an obstacle, not just the edge', () => {
    const map: MapConfig = { rows: 1, cols: 6, start: { row: 0, col: 0 }, goal: { row: 0, col: 2 }, obstacles: [{ row: 0, col: 3 }] }
    const w: While = { kind: 'while', predicate: { sensor: 'clear', dir: 'right' }, body: ['right'], label: 'while right clear' }
    const result = runInstructions(map, [w])
    expect(result.status).toBe('success')
    expect(result.end).toEqual({ row: 0, col: 2 })
  })

  it('flags a while-loop that can never stop', () => {
    // Body never moves toward the sensed direction → infinite without a guard.
    const map: MapConfig = { rows: 3, cols: 3, start: { row: 1, col: 1 }, goal: { row: 0, col: 0 } }
    const w: While = { kind: 'while', predicate: { sensor: 'clear', dir: 'right' }, body: ['up', 'down'], label: 'spinner' }
    const result = runInstructions(map, [w])
    expect(result.status).toBe('loopStuck')
  })
})

describe('interactive mechanics', () => {
  it('teleports across paired pads without bouncing back', () => {
    const map: MapConfig = {
      rows: 1,
      cols: 5,
      start: { row: 0, col: 0 },
      goal: { row: 0, col: 4 },
      teleports: [{ a: { row: 0, col: 1 }, b: { row: 0, col: 3 } }],
    }
    const result = runProgram(map, ['right', 'right'])
    expect(result.status).toBe('success')
    expect(result.end).toEqual({ row: 0, col: 4 })
    expect(result.worldEvents.some((e) => e.kind === 'teleport')).toBe(true)
  })

  it('opens a gate when its plate is stepped on', () => {
    const map: MapConfig = {
      rows: 2,
      cols: 4,
      start: { row: 1, col: 0 },
      goal: { row: 1, col: 3 },
      gates: [{ id: 'g1', at: { row: 1, col: 2 }, open: false }],
      plates: [{ at: { row: 0, col: 1 }, gateId: 'g1', mode: 'open' }],
    }
    // Closed gate blocks a straight run.
    expect(runProgram(map, ['right', 'right']).status).toBe('hitRock')
    // Detour over the plate opens it, then the gate is passable.
    const opened = runProgram(map, ['right', 'up', 'down', 'right', 'right'])
    expect(opened.status).toBe('success')
    expect(opened.worldEvents.some((e) => e.kind === 'plate' && e.open)).toBe(true)
  })

  it('slides across ice until something blocks it', () => {
    const map: MapConfig = {
      rows: 1,
      cols: 6,
      start: { row: 0, col: 0 },
      goal: { row: 0, col: 4 },
      obstacles: [{ row: 0, col: 5 }],
      ice: [
        { row: 0, col: 1 },
        { row: 0, col: 2 },
        { row: 0, col: 3 },
        { row: 0, col: 4 },
      ],
    }
    const result = runProgram(map, ['right'])
    expect(result.status).toBe('success')
    expect(result.end).toEqual({ row: 0, col: 4 })
  })

  it('needs a key to pass a locked door', () => {
    const map: MapConfig = {
      rows: 1,
      cols: 5,
      start: { row: 0, col: 0 },
      goal: { row: 0, col: 4 },
      doors: [{ row: 0, col: 2 }],
      keys: [{ row: 0, col: 1 }],
    }
    const result = runProgram(map, ['right', 'right', 'right', 'right'])
    expect(result.status).toBe('success')
    expect(result.worldEvents.some((e) => e.kind === 'key')).toBe(true)
    expect(result.worldEvents.some((e) => e.kind === 'door')).toBe(true)
  })

  it('blocks a locked door when no key was collected', () => {
    const map: MapConfig = {
      rows: 1,
      cols: 5,
      start: { row: 0, col: 0 },
      goal: { row: 0, col: 4 },
      doors: [{ row: 0, col: 2 }],
    }
    expect(runProgram(map, ['right', 'right']).status).toBe('hitRock')
  })
})

describe('nested control flow', () => {
  it('runs a loop whose body contains another loop', () => {
    const map: MapConfig = { rows: 5, cols: 5, start: { row: 4, col: 0 }, goal: { row: 0, col: 4 } }
    const inner: Loop = { kind: 'loop', count: 1, body: ['up', 'right'], label: 'inner' }
    const outer: Loop = { kind: 'loop', count: 4, body: [inner], label: 'outer' }
    const result = runInstructions(map, [outer])
    expect(result.status).toBe('success')
    expect(result.executed).toHaveLength(8)
  })

  it('runs a loop nested inside a conditional branch', () => {
    const map: MapConfig = { rows: 1, cols: 5, start: { row: 0, col: 0 }, goal: { row: 0, col: 4 } }
    const cond: Conditional = {
      kind: 'conditional',
      predicate: { sensor: 'clear', dir: 'right' },
      then: [{ kind: 'loop', count: 4, body: ['right'], label: 'go' } as Loop],
      else: [],
      label: 'if clear go',
    }
    const result = runInstructions(map, [cond])
    expect(result.status).toBe('success')
    expect(result.end).toEqual({ row: 0, col: 4 })
  })
})

describe('checkpointsVisitedInOrder', () => {
  it('counts checkpoints visited in sequence along a path', () => {
    const checkpoints = [
      { row: 2, col: 2 },
      { row: 1, col: 1 },
    ]
    const path = [
      { row: 2, col: 0 },
      { row: 2, col: 1 },
      { row: 2, col: 2 },
      { row: 1, col: 2 },
      { row: 1, col: 1 },
    ]
    expect(checkpointsVisitedInOrder(path, checkpoints)).toBe(2)
  })
})

describe('carryFrames', () => {
  it('propagates pickup/drop counts forward along the path', () => {
    const path = [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ]
    const events = [
      { pathIndex: 1, type: 'pickup' as const, taskIndex: 0 },
      { pathIndex: 2, type: 'drop' as const, taskIndex: 0 },
    ]
    expect(carryFrames(path, events)).toEqual([
      { picked: 0, dropped: 0 },
      { picked: 1, dropped: 0 },
      { picked: 1, dropped: 1 },
    ])
  })
})

describe('loop iteration observability', () => {
  it('records per-loop iteration counts for a nested loop program', () => {
    const map: MapConfig = { rows: 5, cols: 5, start: { row: 4, col: 0 }, goal: { row: 0, col: 4 } }
    const inner: Loop = { kind: 'loop', count: 1, body: ['up', 'right'], label: 'inner' }
    const outer: Loop = { kind: 'loop', count: 4, body: [inner], label: 'outer' }
    const result = runInstructions(map, [outer])
    expect(result.status).toBe('success')
    expect(result.loopIterations).toEqual([
      { walkIndex: 1, iterations: 4, kind: 'loop' },
      { walkIndex: 2, iterations: 1, kind: 'loop' },
    ])
    expect(result.stuckBlockIndex).toBeNull()
  })

  it('sets stuckBlockIndex to the while that trips the iteration cap', () => {
    // Body oscillates without ever satisfying the exit predicate → cap trips.
    const map: MapConfig = { rows: 3, cols: 3, start: { row: 1, col: 1 }, goal: { row: 0, col: 0 } }
    const w: While = { kind: 'while', predicate: { sensor: 'clear', dir: 'right' }, body: ['up', 'down'], label: 'spinner' }
    const result = runInstructions(map, [w])
    expect(result.status).toBe('loopStuck')
    expect(result.stuckBlockIndex).toBe(1)
    expect(result.loopIterations).toHaveLength(1)
    expect(result.loopIterations[0].kind).toBe('while')
  })

  it('leaves loopIterations empty and stuckBlockIndex null for a no-loop program', () => {
    const result = runProgram(baseMap, ['up', 'up', 'right', 'right'])
    expect(result.status).toBe('success')
    expect(result.loopIterations).toEqual([])
    expect(result.stuckBlockIndex).toBeNull()
  })
})
