// Shared conversion between the CommandSequence editor's node tree and the
// engine's runnable Instruction[]. Both the lesson player and the practice
// player use these so nested loop/while/if programs build and run identically.

import type { Command, Instruction } from '../types'
import { isAction } from '../types'
import type { RunResult } from '../engine/map'
import type { ProgramNode } from './CommandSequence'

// Converts the editor's node tree into runnable instructions.
export function nodeToInstruction(node: ProgramNode): Instruction {
  if (node.kind === 'move') return node.command
  if (node.kind === 'action') return node.action
  if (node.kind === 'loop') {
    return { kind: 'loop', count: node.count, body: node.body.map(nodeToInstruction), label: `Repeat ${node.count}×` }
  }
  if (node.kind === 'while') {
    return { kind: 'while', predicate: node.predicate, body: node.body.map(nodeToInstruction), label: node.predicateLabel }
  }
  return {
    kind: 'conditional',
    predicate: node.predicate,
    then: node.then.map(nodeToInstruction),
    else: node.else.map(nodeToInstruction),
    label: node.predicateLabel,
  }
}

// Converts runnable instructions back into editor nodes — used to pre-fill a
// step's scaffold (`initialProgram`) into the editor. `locked` nodes cannot be
// removed or dragged (pinned scaffold); pass false for fully editable cards.
export function instructionToNode(inst: Instruction, locked = false): ProgramNode {
  const id = Math.random().toString(36).slice(2)
  if (typeof inst === 'string') {
    if (isAction(inst)) return { id, locked: locked || undefined, kind: 'action', action: inst }
    return { id, locked: locked || undefined, kind: 'move', command: inst as Command }
  }
  if (inst.kind === 'loop') {
    return { id, locked: locked || undefined, kind: 'loop', count: inst.count, body: inst.body.map((b) => instructionToNode(b, locked)) }
  }
  if (inst.kind === 'while') {
    return { id, locked: locked || undefined, kind: 'while', predicate: inst.predicate, predicateLabel: inst.label, body: inst.body.map((b) => instructionToNode(b, locked)) }
  }
  return {
    id,
    locked: locked || undefined,
    kind: 'if',
    predicate: inst.predicate,
    predicateLabel: inst.label,
    then: inst.then.map((b) => instructionToNode(b, locked)),
    else: inst.else.map((b) => instructionToNode(b, locked)),
  }
}

// Maps each ProgramNode (by its id) that is a loop/while to the iteration count
// from the run, by walking the program tree and the run's loopIterations in the
// same depth-first order the interpreter uses. Returns a Map<nodeId, number>.
export function iterationMap(program: ProgramNode[], run: RunResult): Map<string, number> {
  const result = new Map<string, number>()
  if (run.loopIterations.length === 0) return result
  const byWalkIndex = new Map<number, number>()
  for (const li of run.loopIterations) byWalkIndex.set(li.walkIndex, li.iterations)
  let counter = 0
  const walk = (nodes: ProgramNode[]): void => {
    for (const node of nodes) {
      counter += 1
      if (node.kind === 'loop' || node.kind === 'while') {
        const iterations = byWalkIndex.get(counter)
        if (iterations !== undefined) result.set(node.id, iterations)
        walk(node.body)
      } else if (node.kind === 'if') {
        walk(node.then)
        walk(node.else)
      }
    }
  }
  walk(program)
  return result
}
