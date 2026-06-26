import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordExplain,
  recordGen,
  snapshotAndReset,
  type TelemetrySnapshot,
} from './telemetry'

// The telemetry module holds in-memory counters at module scope. snapshotAndReset
// zeroes them, so calling it in beforeEach gives every test a clean slate
// without needing vi.resetModules().
beforeEach(() => {
  snapshotAndReset()
})

describe('recordGen', () => {
  it('increments the matching gen counter by one', () => {
    recordGen('requested')
    recordGen('served')
    recordGen('served')
    recordGen('abstained')
    recordGen('fallback')

    const snap = snapshotAndReset()
    expect(snap.genRequested).toBe(1)
    expect(snap.genServed).toBe(2)
    expect(snap.genAbstained).toBe(1)
    expect(snap.genFallback).toBe(1)
  })

  it('leaves the explain counters untouched when only gen events fire', () => {
    recordGen('requested')
    const snap = snapshotAndReset()
    expect(snap.explainRequested).toBe(0)
    expect(snap.explainServed).toBe(0)
    expect(snap.explainFallback).toBe(0)
    expect(snap.explainLeakBlocked).toBe(0)
  })
})

describe('recordExplain', () => {
  it('still increments the explain counters', () => {
    recordExplain('requested')
    recordExplain('served')
    recordExplain('leakBlocked')
    recordExplain('fallback')

    const snap = snapshotAndReset()
    expect(snap.explainRequested).toBe(1)
    expect(snap.explainServed).toBe(1)
    expect(snap.explainLeakBlocked).toBe(1)
    expect(snap.explainFallback).toBe(1)
  })
})

describe('snapshotAndReset', () => {
  it('returns the current counts and then zeroes every counter', () => {
    recordGen('requested')
    recordGen('served')
    recordExplain('requested')

    const first = snapshotAndReset()
    expect(first.genRequested).toBe(1)
    expect(first.genServed).toBe(1)
    expect(first.explainRequested).toBe(1)

    // A second snapshot with no intervening events is all zeroes — proves the
    // reset side effect and that the function is safe to call repeatedly.
    const second: TelemetrySnapshot = snapshotAndReset()
    expect(second.genRequested).toBe(0)
    expect(second.genServed).toBe(0)
    expect(second.genAbstained).toBe(0)
    expect(second.genFallback).toBe(0)
    expect(second.explainRequested).toBe(0)
    expect(second.explainServed).toBe(0)
    expect(second.explainFallback).toBe(0)
    expect(second.explainLeakBlocked).toBe(0)
  })

  it('is safe to call repeatedly on an empty state', () => {
    const snap = snapshotAndReset()
    expect(snap).toEqual({
      explainRequested: 0,
      explainServed: 0,
      explainFallback: 0,
      explainLeakBlocked: 0,
      genRequested: 0,
      genServed: 0,
      genAbstained: 0,
      genFallback: 0,
    })
  })
})
