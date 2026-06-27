import type { MapConfig } from '../types'

// Derives short, kid-facing objective lines straight from a map's data, so every
// puzzle gets a "what am I trying to do" callout without any per-lesson copy.
// Order roughly follows the natural play order: collect, carry, visit, unlock,
// then reach the goal.
export function describeObjectives(map: MapConfig): string[] {
  const lines: string[] = []

  const keys = map.keys ?? []
  if (keys.length === 1) lines.push('Grab the key')
  else if (keys.length > 1) lines.push(`Grab ${keys.length} keys`)

  const tasks = map.tasks ?? []
  if (tasks.length === 1) lines.push('Carry the gem to its flag')
  else if (tasks.length > 1) lines.push(`Deliver ${tasks.length} items`)

  const checkpoints = map.checkpoints ?? []
  if (checkpoints.length === 1) lines.push('Visit the stop')
  else if (checkpoints.length > 1) lines.push(`Visit ${checkpoints.length} stops`)

  const gates = map.gates ?? []
  const plates = map.plates ?? []
  if (gates.length > 0 && plates.length > 0) lines.push('Step on a plate to open the gate')

  // The binary-search goal tile is hidden, so the objective is the target value
  // rather than a visible chest.
  if (map.targetValue !== undefined) lines.push(`Find ${map.targetValue}`)
  else lines.push('Reach the chest')

  return lines
}
