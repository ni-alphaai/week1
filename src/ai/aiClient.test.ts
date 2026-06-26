import { describe, it, expect, vi, beforeEach } from 'vitest'

// Pretend Firebase is configured so getModel proceeds to build a model.
vi.mock('../storage/firebase', () => ({
  isFirebaseEnabled: true,
  firebaseApp: {},
  firebaseAuth: null,
  firestoreDb: null,
}))

// Pin the provider to gemini so this test is deterministic regardless of any
// ambient VITE_AI_PROVIDER in the environment (e.g. a local .env set to openai).
vi.mock('./config', () => ({
  aiProvider: 'gemini',
  AI_MODEL: 'gemini-2.5-flash',
  OPENAI_MODEL: 'gpt-4o-mini',
  OPENAI_STRONG_MODEL: 'gpt-4o',
  recaptchaSiteKey: undefined,
}))

const { getGenerativeModel } = vi.hoisted(() => ({
  getGenerativeModel: vi.fn((_ai: unknown, params: { systemInstruction?: string }) => {
    const sys = params?.systemInstruction
    return {
      systemInstruction: sys,
      generateContent: vi.fn(async () => ({ response: { text: () => `reply for: ${sys}` } })),
    }
  }),
}))

vi.mock('firebase/ai', () => ({
  getAI: vi.fn(() => ({})),
  getGenerativeModel,
  GoogleAIBackend: class {},
}))

import { generateText } from './aiClient'

beforeEach(() => getGenerativeModel.mockClear())

describe('aiClient model cache', () => {
  it('builds a separate model per system instruction and reuses it', async () => {
    const a1 = await generateText({ system: 'SYSTEM_A', prompt: 'hi' })
    expect(a1).toBe('reply for: SYSTEM_A')
    expect(getGenerativeModel).toHaveBeenCalledTimes(1)

    // Different system instruction -> a new model is built.
    const b1 = await generateText({ system: 'SYSTEM_B', prompt: 'hi' })
    expect(b1).toBe('reply for: SYSTEM_B')
    expect(getGenerativeModel).toHaveBeenCalledTimes(2)

    // Same system instruction as the first -> served from cache, no new build.
    const a2 = await generateText({ system: 'SYSTEM_A', prompt: 'again' })
    expect(a2).toBe('reply for: SYSTEM_A')
    expect(getGenerativeModel).toHaveBeenCalledTimes(2)
  })

  it('builds the model with the default model, and a fresh one when a model is given', async () => {
    await generateText({ system: 'SYS_DEFAULT', prompt: 'hi' })
    expect(getGenerativeModel).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ model: 'gemini-2.5-flash' }),
    )

    // An explicit (stronger) model is a different cache key, so a new build.
    await generateText({ system: 'SYS_DEFAULT', prompt: 'hi', model: 'gpt-4o' })
    expect(getGenerativeModel).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ model: 'gpt-4o' }),
    )
  })
})
