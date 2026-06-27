import { describe, it, expect, beforeEach, vi } from 'vitest'

// Reset module between tests so module-level state is fresh.
beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
})

async function load() {
  return import('./aiPreference')
}

describe('aiPreference', () => {
  it('defaults ON when localStorage is unset', async () => {
    const { isAiOn } = await load()
    expect(isAiOn()).toBe(true)
  })

  it('reads false from localStorage on init', async () => {
    localStorage.setItem('brillant.ai', '0')
    const { isAiOn } = await load()
    expect(isAiOn()).toBe(false)
  })

  it('setAiOn(false) persists to localStorage and isAiOn() returns false', async () => {
    const { isAiOn, setAiOn } = await load()
    setAiOn(false)
    expect(isAiOn()).toBe(false)
    expect(localStorage.getItem('brillant.ai')).toBe('0')
  })

  it('setAiOn(true) persists to localStorage and isAiOn() returns true', async () => {
    localStorage.setItem('brillant.ai', '0')
    const { isAiOn, setAiOn } = await load()
    setAiOn(true)
    expect(isAiOn()).toBe(true)
    expect(localStorage.getItem('brillant.ai')).toBe('1')
  })

  it('toggleAi() flips the value', async () => {
    const { isAiOn, toggleAi } = await load()
    expect(isAiOn()).toBe(true)
    toggleAi()
    expect(isAiOn()).toBe(false)
    toggleAi()
    expect(isAiOn()).toBe(true)
  })

  it('subscribeAi fires on change with new value', async () => {
    const { setAiOn, subscribeAi } = await load()
    const calls: boolean[] = []
    subscribeAi((v) => calls.push(v))
    setAiOn(false)
    setAiOn(true)
    expect(calls).toEqual([false, true])
  })

  it('subscribeAi returns an unsubscribe that stops firing', async () => {
    const { setAiOn, subscribeAi } = await load()
    const calls: boolean[] = []
    const unsub = subscribeAi((v) => calls.push(v))
    setAiOn(false)
    unsub()
    setAiOn(true)
    expect(calls).toEqual([false])
  })
})
