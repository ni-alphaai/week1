import { describe, it, expect, vi, beforeEach } from 'vitest'

// Pretend Firebase is configured so the callable lookup proceeds.
vi.mock('../storage/firebase', () => ({
  isFirebaseEnabled: true,
  firebaseApp: {},
  firebaseAuth: null,
  firestoreDb: null,
}))

// Force the OpenAI provider for this file only (config is read at module load).
vi.mock('./config', () => ({
  aiProvider: 'openai',
  AI_MODEL: 'gemini-2.5-flash',
  OPENAI_MODEL: 'gpt-4o-mini',
  OPENAI_STRONG_MODEL: 'gpt-4o',
  recaptchaSiteKey: undefined,
}))

const mocks = vi.hoisted(() => {
  const callable = vi.fn()
  return {
    callable,
    httpsCallable: vi.fn(() => callable),
    getFunctions: vi.fn(() => ({})),
  }
})

vi.mock('firebase/functions', () => ({
  getFunctions: mocks.getFunctions,
  httpsCallable: mocks.httpsCallable,
}))

import { generateText } from './aiClient'

beforeEach(() => mocks.callable.mockReset())

describe('aiClient openai provider', () => {
  it('calls the aiGenerate callable and returns its text', async () => {
    mocks.callable.mockResolvedValue({ data: { text: '  hello kid  ' } })
    const out = await generateText({ system: 'SYS', prompt: 'PROMPT' })
    expect(out).toBe('hello kid')
    expect(mocks.httpsCallable).toHaveBeenCalledWith(expect.anything(), 'aiGenerate')
    expect(mocks.callable).toHaveBeenCalledWith({ system: 'SYS', prompt: 'PROMPT', model: 'gpt-4o-mini' })
  })

  it('fails closed to null on a blank/missing response', async () => {
    mocks.callable.mockResolvedValue({ data: { text: '   ' } })
    expect(await generateText({ system: 'SYS', prompt: 'PROMPT' })).toBeNull()

    mocks.callable.mockResolvedValue({ data: {} })
    expect(await generateText({ system: 'SYS', prompt: 'PROMPT' })).toBeNull()
  })

  it('threads an explicit model and timeout into the callable', async () => {
    mocks.callable.mockResolvedValue({ data: { text: 'ok' } })
    const out = await generateText({ system: 'SYS', prompt: 'PROMPT', model: 'gpt-4o', timeoutMs: 15000 })
    expect(out).toBe('ok')
    expect(mocks.callable).toHaveBeenCalledWith({ system: 'SYS', prompt: 'PROMPT', model: 'gpt-4o' })
  })

  it('retries once and serves the second response when the first is empty', async () => {
    mocks.callable
      .mockResolvedValueOnce({ data: { text: '' } })
      .mockResolvedValueOnce({ data: { text: 'recovered' } })
    expect(await generateText({ system: 'SYS', prompt: 'PROMPT' })).toBe('recovered')
    expect(mocks.callable).toHaveBeenCalledTimes(2)
  })
})
