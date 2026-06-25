import { describe, it, expect, beforeEach } from 'vitest'
import { isMuted, playSound, setMuted, subscribeMuted, toggleMuted } from './sound'

describe('sound mute state', () => {
  beforeEach(() => {
    setMuted(false)
  })

  it('defaults to unmuted', () => {
    expect(isMuted()).toBe(false)
  })

  it('persists the muted flag to localStorage', () => {
    setMuted(true)
    expect(isMuted()).toBe(true)
    expect(window.localStorage.getItem('brillant.muted')).toBe('1')
    setMuted(false)
    expect(window.localStorage.getItem('brillant.muted')).toBe('0')
  })

  it('toggles back and forth', () => {
    toggleMuted()
    expect(isMuted()).toBe(true)
    toggleMuted()
    expect(isMuted()).toBe(false)
  })

  it('notifies subscribers and supports unsubscribe', () => {
    const seen: boolean[] = []
    const unsubscribe = subscribeMuted((value) => seen.push(value))
    setMuted(true)
    setMuted(false)
    unsubscribe()
    setMuted(true)
    expect(seen).toEqual([true, false])
  })

  it('never throws when playing a cue (no AudioContext in jsdom)', () => {
    expect(() => playSound('success')).not.toThrow()
    expect(() => playSound('error')).not.toThrow()
    expect(() => playSound('runStart')).not.toThrow()
    expect(() => playSound('bridge')).not.toThrow()
    expect(() => playSound('streak')).not.toThrow()
  })
})
