import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Instruction, MapConfig } from '../types'
import { runInstructions } from '../engine/map'

vi.mock('./config', () => ({
  aiEnabled: true,
  aiExplainEnabled: true,
  AI_MODEL: 'test',
  recaptchaSiteKey: undefined,
}))
vi.mock('./aiClient', () => ({ generateText: vi.fn() }))

import { generateText } from './aiClient'
import { getExplanation, clearExplanationCache } from './explain'

const map: MapConfig = { rows: 1, cols: 3, start: { row: 0, col: 0 }, goal: { row: 0, col: 2 } }

function baseReq(overrides: Record<string, unknown> = {}) {
  const instructions: Instruction[] = ['right']
  const run = runInstructions(map, instructions)
  return {
    stepId: 's1',
    goal: 'Reach the treasure',
    map,
    successRule: 'reachGoal' as const,
    instructions,
    run,
    solution: ['right', 'right'] as Instruction[],
    authoredHints: ['Authored nudge one', 'Authored nudge two'],
    priorFailCount: 0,
    ...overrides,
  }
}

const mockedGen = vi.mocked(generateText)

beforeEach(() => {
  clearExplanationCache()
  mockedGen.mockReset()
})

describe('getExplanation', () => {
  it('returns AI text when the reply is clean', async () => {
    mockedGen.mockResolvedValueOnce('Nice try! Look at where the explorer ends up.')
    const res = await getExplanation(baseReq())
    expect(res.source).toBe('ai')
    expect(res.text).toContain('Nice try')
  })

  it('regenerates once on a leak, then serves the clean reply', async () => {
    mockedGen
      .mockResolvedValueOnce('Go right then right.')
      .mockResolvedValueOnce('Good effort, look again at the map.')
    const res = await getExplanation(baseReq())
    expect(res.source).toBe('ai')
    expect(res.text).toBe('Good effort, look again at the map.')
    expect(mockedGen).toHaveBeenCalledTimes(2)
  })

  it('falls back to a distinct diagnostic message on a persistent leak', async () => {
    mockedGen.mockResolvedValue('go right then right')
    const res = await getExplanation(baseReq())
    expect(res.source).toBe('diagnostic')
    expect(res.text).toContain('not on the treasure')
    // Distinct from the on-screen authored hint.
    expect(res.text).not.toBe('Authored nudge one')
  })

  it('falls back to a diagnostic message when the model returns nothing', async () => {
    mockedGen.mockResolvedValue(null)
    const res = await getExplanation(baseReq())
    expect(res.source).toBe('diagnostic')
  })
})
