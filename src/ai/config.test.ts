import { describe, it, expect, vi, beforeEach } from 'vitest'

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
})

function stubCapability(explain: boolean, generation: boolean, adaptive: boolean) {
  const master = explain || generation || adaptive
  vi.stubEnv('VITE_AI_ENABLED', master ? 'true' : 'false')
  vi.stubEnv('VITE_AI_EXPLAIN_ENABLED', explain ? 'true' : 'false')
  vi.stubEnv('VITE_AI_GENERATION_ENABLED', generation ? 'true' : 'false')
  vi.stubEnv('VITE_AI_ADAPTIVE_ENABLED', adaptive ? 'true' : 'false')
}

async function load(preferenceOn: boolean) {
  vi.doMock('../lib/aiPreference', () => ({ isAiOn: () => preferenceOn }))
  return import('./config')
}

describe('config resolvers — Capability ceiling', () => {
  it('all return false when Capability is off regardless of Preference', async () => {
    stubCapability(false, false, false)
    const cfg = await load(true)
    expect(cfg.aiExplainOn()).toBe(false)
    expect(cfg.aiGenerationOn()).toBe(false)
    expect(cfg.aiAdaptiveOn()).toBe(false)
    expect(cfg.aiAnyOn()).toBe(false)
  })

  it('all return false when Capability is on but Preference is off', async () => {
    stubCapability(true, true, true)
    const cfg = await load(false)
    expect(cfg.aiExplainOn()).toBe(false)
    expect(cfg.aiGenerationOn()).toBe(false)
    expect(cfg.aiAdaptiveOn()).toBe(false)
    expect(cfg.aiAnyOn()).toBe(false)
  })

  it('return true when both Capability and Preference are on', async () => {
    stubCapability(true, true, true)
    const cfg = await load(true)
    expect(cfg.aiExplainOn()).toBe(true)
    expect(cfg.aiGenerationOn()).toBe(true)
    expect(cfg.aiAdaptiveOn()).toBe(true)
    expect(cfg.aiAnyOn()).toBe(true)
  })

  it('respects per-feature Capability (explain on, generation off)', async () => {
    stubCapability(true, false, false)
    const cfg = await load(true)
    expect(cfg.aiExplainOn()).toBe(true)
    expect(cfg.aiGenerationOn()).toBe(false)
    expect(cfg.aiAdaptiveOn()).toBe(false)
    expect(cfg.aiAnyOn()).toBe(true)
  })
})
