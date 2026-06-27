import type { Action, BlockKind, CardLimits, Command } from '../types'
import type { PaletteItem } from './CommandSequence'

// The fields any puzzle source (a lesson step or a shared puzzle) exposes to
// build its editor palette. PlayStep, SequenceStep, and ShareablePuzzle all
// satisfy this structurally, so the four pages share one builder.
export interface PaletteSource {
  availableCommands: Command[]
  availableActions?: Action[]
  blocks?: BlockKind[]
  cardLimits?: CardLimits
}

// Builds the editor palette straight from a puzzle source's offered cards:
// unique move cards, then unique action cards, then any composable container
// blocks (Repeat/While/If). Per-card `limit`s are drawn from `cardLimits`
// (undefined = unlimited). Moves-only sources yield only move cards.
export function buildPalette(source: PaletteSource): PaletteItem[] {
  const limits = source.cardLimits ?? {}

  const moves: PaletteItem[] = []
  const seenMove = new Set<Command>()
  for (const command of source.availableCommands) {
    if (seenMove.has(command)) continue
    seenMove.add(command)
    moves.push({ key: `m-${command}`, kind: 'move', command, limit: limits[command] })
  }

  const actions: PaletteItem[] = []
  const seenAction = new Set<Action>()
  for (const action of source.availableActions ?? []) {
    if (seenAction.has(action)) continue
    seenAction.add(action)
    actions.push({ key: `a-${action}`, kind: 'action', action, limit: limits[action] })
  }

  const blocks: PaletteItem[] = (source.blocks ?? []).map((kind) => ({
    key: `b-${kind}`,
    kind,
    limit: limits[kind],
  }))

  return [...moves, ...actions, ...blocks]
}
