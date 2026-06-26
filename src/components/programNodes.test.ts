import { describe, it, expect } from 'vitest'
import type { MapConfig } from '../types'
import { runInstructions } from '../engine/map'
import { iterationMap, nodeToInstruction } from './programNodes'
import type { ProgramNode } from './CommandSequence'

const loopNode = (id: string, count: number, body: ProgramNode[]): ProgramNode => ({
  id,
  kind: 'loop',
  count,
  body,
})

const moveNode = (id: string, command: 'up' | 'down' | 'left' | 'right'): ProgramNode => ({
  id,
  kind: 'move',
  command,
})

describe('iterationMap', () => {
  it('maps nested loop node ids to their iteration counts', () => {
    const inner = loopNode('inner', 1, [moveNode('i-up', 'up'), moveNode('i-right', 'right')])
    const outer = loopNode('outer', 4, [inner])
    const program = [outer]
    const map: MapConfig = { rows: 5, cols: 5, start: { row: 4, col: 0 }, goal: { row: 0, col: 4 } }
    const run = runInstructions(map, program.map(nodeToInstruction))
    expect(run.status).toBe('success')
    const iterations = iterationMap(program, run)
    expect(iterations.get('outer')).toBe(4)
    expect(iterations.get('inner')).toBe(1)
    expect(iterations.has('i-up')).toBe(false)
  })

  it('returns an empty map when the run has no loop iterations', () => {
    const program = [moveNode('m1', 'up'), moveNode('m2', 'right')]
    const map: MapConfig = { rows: 3, cols: 3, start: { row: 2, col: 0 }, goal: { row: 0, col: 2 } }
    const run = runInstructions(map, program.map(nodeToInstruction))
    expect(run.loopIterations).toEqual([])
    expect(iterationMap(program, run).size).toBe(0)
  })
})
