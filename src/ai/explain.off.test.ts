import { describe, it, expect, vi } from 'vitest'
import type { Instruction, MapConfig } from '../types'
import { runInstructions } from '../engine/map'

// AI-off parity: with the flag disabled, getExplanation must return the authored
// hint and must never call the model.
vi.mock('./config', () => ({
  aiEnabled: false,
  aiExplainEnabled: false,
  AI_MODEL: 'test',
  recaptchaSiteKey: undefined,
}))
vi.mock('./aiClient', () => ({ generateText: vi.fn() }))

import { generateText } from './aiClient'
import { getExplanation } from './explain'

describe('getExplanation with AI disabled', () => {
  it('returns the authored hint and never calls the model', async () => {
    const map: MapConfig = { rows: 1, cols: 3, start: { row: 0, col: 0 }, goal: { row: 0, col: 2 } }
    const instructions: Instruction[] = ['right']
    const run = runInstructions(map, instructions)
    const res = await getExplanation({
      stepId: 's1',
      goal: 'Reach the treasure',
      map,
      successRule: 'reachGoal',
      instructions,
      run,
      solution: ['right', 'right'],
      authoredHints: ['Authored nudge one'],
      priorFailCount: 0,
    })
    expect(res.source).toBe('authored')
    expect(res.text).toBe('Authored nudge one')
    expect(vi.mocked(generateText)).not.toHaveBeenCalled()
  })
})
