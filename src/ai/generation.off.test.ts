import { describe, it, expect, vi } from 'vitest'
import type { Command } from '../types'

// AI-off parity: generation disabled -> abstain (null), no model call.
vi.mock('./config', () => ({
  aiEnabled: false,
  aiExplainEnabled: false,
  aiGenerationEnabled: false,
  aiAdaptiveEnabled: false,
  AI_MODEL: 'test',
  recaptchaSiteKey: undefined,
}))
vi.mock('./aiClient', () => ({ generateText: vi.fn() }))

import { generateText } from './aiClient'
import { generatePuzzle } from './generation'

describe('generatePuzzle with generation disabled', () => {
  it('returns null and never calls the model', async () => {
    const res = await generatePuzzle({
      rows: 3,
      cols: 3,
      availableCommands: ['up', 'down', 'left', 'right'] as Command[],
      band: { minMoves: 2, maxMoves: 5 },
      successRule: 'reachGoal',
    })
    expect(res).toBeNull()
    expect(vi.mocked(generateText)).not.toHaveBeenCalled()
  })
})
