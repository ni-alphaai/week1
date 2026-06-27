import { describe, it, expect } from 'vitest'
import type { Loop, MapConfig } from '../types'
import type { CheckResult } from '../engine/checker'
import { runInstructions, runProgram, type RunResult } from '../engine/map'
import { buildRunTimeline, idleFrame } from './timeline'

const baseMap: MapConfig = {
  rows: 3,
  cols: 3,
  start: { row: 2, col: 0 },
  goal: { row: 0, col: 2 },
}

// buildRunTimeline only reads correct/message/run off the CheckResult.
function asResult(run: RunResult, correct = false, message = ''): CheckResult {
  return { correct, message, run }
}

const activeIndices = (t: ReturnType<typeof buildRunTimeline>) => t.frames.map((f) => f.activeStepIndex)

describe('buildRunTimeline — run strip mapping', () => {
  it('maps moves to the tile reached after each move', () => {
    const run = runProgram(baseMap, ['up', 'up', 'right', 'right'])
    const t = buildRunTimeline(asResult(run, true), baseMap)
    expect(t.outcome.run.executed).toEqual(['up', 'up', 'right', 'right'])
    expect(activeIndices(t)).toEqual([-1, 0, 1, 2, 3])
  })

  it('resolves actions on the tile the explorer is standing on', () => {
    const map: MapConfig = {
      ...baseMap,
      goal: { row: 2, col: 1 },
      tasks: [{ from: { row: 2, col: 0 }, to: { row: 2, col: 1 } }],
    }
    const run = runProgram(map, ['pickup', 'right', 'drop'])
    const t = buildRunTimeline(asResult(run, true), map)
    expect(activeIndices(t)).toEqual([0, 2])
  })

  it('unrolls loop bodies into one chip per executed step', () => {
    const map: MapConfig = { rows: 1, cols: 5, start: { row: 0, col: 0 }, goal: { row: 0, col: 3 } }
    const loop: Loop = { kind: 'loop', count: 3, body: ['right'], label: 'repeat' }
    const run = runInstructions(map, [loop])
    const t = buildRunTimeline(asResult(run, true), map)
    expect(t.outcome.run.executed).toEqual(['right', 'right', 'right'])
    expect(activeIndices(t)).toEqual([-1, 0, 1, 2])
  })

  it('omits the crashing move and keeps frames aligned to the partial path', () => {
    const run = runProgram(baseMap, ['up', 'up', 'up'])
    expect(run.status).toBe('offMap')
    const t = buildRunTimeline(asResult(run, false), baseMap)
    expect(t.outcome.run.executed).toEqual(['up', 'up'])
    expect(activeIndices(t)).toEqual([-1, 0, 1])
  })

  it('handles an empty program as a single start frame', () => {
    const run = runProgram(baseMap, [])
    const t = buildRunTimeline(asResult(run, false), baseMap)
    expect(t.frames).toHaveLength(1)
    expect(activeIndices(t)).toEqual([-1])
  })
})

describe('buildRunTimeline — frames', () => {
  it('faces the direction of travel, holding facing when no move occurs', () => {
    const run = runProgram(baseMap, ['up', 'up', 'right', 'right'])
    const t = buildRunTimeline(asResult(run, true), baseMap)
    expect(t.frames.map((f) => f.facing)).toEqual(['right', 'up', 'up', 'right', 'right'])
  })

  it('tracks the explorer onto each path tile and clears activeTile on settle', () => {
    const run = runProgram(baseMap, ['up', 'up', 'right', 'right'])
    const t = buildRunTimeline(asResult(run, true), baseMap)
    expect(t.frames[0].explorer).toEqual(baseMap.start)
    expect(t.frames.every((f) => f.activeTile !== null)).toBe(true)
    expect(t.settle.activeTile).toBeNull()
    expect(t.settle.explorer).toEqual({ row: 0, col: 2 })
  })

  it('leaves authored-lesson fields neutral on a plain navigation map', () => {
    const run = runProgram(baseMap, ['up', 'up', 'right', 'right'])
    const t = buildRunTimeline(asResult(run, true), baseMap)
    for (const f of t.frames) {
      expect(f.checkpointsDelivered).toBe(0)
      expect(f.gateState).toEqual({})
      expect(f.keysCollected).toBe(0)
      expect(f.searchWindow).toBeNull()
    }
  })
})

describe('buildRunTimeline — sound cues', () => {
  it('emits a step cue for every move after the first, none on the start tile', () => {
    const run = runProgram(baseMap, ['up', 'up', 'right', 'right'])
    const t = buildRunTimeline(asResult(run, true), baseMap)
    expect(t.cues).toEqual([[], ['step'], ['step'], ['step'], ['step']])
  })

  it('emits pick then place as tasks are carried, alongside the step hop', () => {
    const map: MapConfig = {
      ...baseMap,
      goal: { row: 2, col: 1 },
      tasks: [{ from: { row: 2, col: 0 }, to: { row: 2, col: 1 } }],
    }
    const run = runProgram(map, ['pickup', 'right', 'drop'])
    const t = buildRunTimeline(asResult(run, true), map)
    expect(t.cues).toEqual([['pick'], ['place', 'step']])
  })

  it('emits a bridge cue instead of step when crossing the bridge tile', () => {
    const map: MapConfig = { ...baseMap, bridge: { row: 1, col: 0, open: true } }
    const run = runProgram(map, ['up', 'up', 'right', 'right'])
    const t = buildRunTimeline(asResult(run, true), map)
    // tile index 1 is the bridge tile (row 1, col 0).
    expect(t.cues[1]).toEqual(['bridge'])
    expect(t.cues[2]).toEqual(['step'])
  })
})

describe('buildRunTimeline — outcome and settle', () => {
  it('reports solved on a correct run and fills checkpoints on settle', () => {
    const run = runProgram(baseMap, ['up', 'up', 'right', 'right'])
    const t = buildRunTimeline(asResult(run, true), baseMap)
    expect(t.outcome).toMatchObject({ solved: true, crashed: false, loopStuck: false })
    expect(t.settleCue).toBe('success')
  })

  it('reports crashed when an incorrect run did not reach the goal', () => {
    const run = runProgram(baseMap, ['up', 'up', 'up'])
    const t = buildRunTimeline(asResult(run, false, 'Off the grid!'), baseMap)
    expect(t.outcome).toMatchObject({ solved: false, crashed: true, message: 'Off the grid!' })
    expect(t.settleCue).toBe('error')
  })

  it('idleFrame is the neutral resting state at the map start', () => {
    expect(idleFrame(baseMap)).toEqual({
      explorer: baseMap.start,
      facing: 'right',
      activeTile: null,
      activeStepIndex: -1,
      taskPicked: 0,
      taskDropped: 0,
      isTeleporting: false,
      isDeparting: false,
      checkpointsDelivered: 0,
      gateState: {},
      keysCollected: 0,
      counter: undefined,
      searchWindow: null,
    })
  })
})
