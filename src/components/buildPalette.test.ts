import { describe, expect, it } from 'vitest'
import { buildPalette } from './buildPalette'

describe('buildPalette', () => {
  it('yields only move cards for a moves-only source', () => {
    const palette = buildPalette({ availableCommands: ['up', 'right'] })
    expect(palette).toEqual([
      { key: 'm-up', kind: 'move', command: 'up', limit: undefined },
      { key: 'm-right', kind: 'move', command: 'right', limit: undefined },
    ])
  })

  it('orders cards moves, then actions, then blocks', () => {
    const palette = buildPalette({
      availableCommands: ['up'],
      availableActions: ['pickup'],
      blocks: ['loop', 'if'],
    })
    expect(palette.map((p) => p.kind)).toEqual(['move', 'action', 'loop', 'if'])
    expect(palette.map((p) => p.key)).toEqual(['m-up', 'a-pickup', 'b-loop', 'b-if'])
  })

  it('dedupes repeated commands and actions, keeping first occurrence', () => {
    const palette = buildPalette({
      availableCommands: ['up', 'up', 'down'],
      availableActions: ['pickup', 'pickup'],
    })
    expect(palette.map((p) => p.key)).toEqual(['m-up', 'm-down', 'a-pickup'])
  })

  it('draws per-card limits from cardLimits', () => {
    const palette = buildPalette({
      availableCommands: ['up'],
      availableActions: ['drop'],
      blocks: ['while'],
      cardLimits: { up: 3, drop: 1, while: 2 },
    })
    expect(palette).toEqual([
      { key: 'm-up', kind: 'move', command: 'up', limit: 3 },
      { key: 'a-drop', kind: 'action', action: 'drop', limit: 1 },
      { key: 'b-while', kind: 'while', limit: 2 },
    ])
  })

  it('treats missing optional fields as empty', () => {
    expect(buildPalette({ availableCommands: [] })).toEqual([])
  })
})
