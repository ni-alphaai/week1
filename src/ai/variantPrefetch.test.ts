import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Lesson } from '../types'

vi.mock('./generation', () => ({
  generatePuzzle: vi.fn(async () => ({ aiGenerated: true, source: 'ai' })),
  SMALLER_VARIANT_OPTS: { allowFamiliarSolution: true },
}))
vi.mock('../content/generated', () => ({
  smallerVariantTemplate: vi.fn(() => ({ rows: 6, cols: 6, concept: 'loops', targetLevel: 3 })),
  deriveSmallerVariantPuzzle: vi.fn(() => ({ aiGenerated: true, source: 'authored' })),
}))

import {
  warmSmallerVariant,
  peekSmallerVariant,
  consumeSmallerVariant,
  clearSmallerVariant,
} from './variantPrefetch'
import { generatePuzzle } from './generation'
import { smallerVariantTemplate, deriveSmallerVariantPuzzle } from '../content/generated'

const mockedGen = vi.mocked(generatePuzzle)
const mockedTemplate = vi.mocked(smallerVariantTemplate)
const mockedDerive = vi.mocked(deriveSmallerVariantPuzzle)

const lesson = { id: 'lesson-x' } as Lesson

// Let the background AI-upgrade microtask chain settle.
const flush = () => new Promise((r) => setTimeout(r, 0))

beforeEach(() => {
  clearSmallerVariant('lesson-x')
  mockedGen.mockClear()
  mockedGen.mockResolvedValue({ aiGenerated: true, source: 'ai' } as never)
  mockedTemplate.mockReset()
  mockedTemplate.mockReturnValue({ rows: 6, cols: 6, concept: 'loops', targetLevel: 3 } as never)
  mockedDerive.mockReset()
  mockedDerive.mockReturnValue({ aiGenerated: true, source: 'authored' } as never)
})

describe('warmSmallerVariant', () => {
  it('warms once per lesson and is ready instantly via the authored fallback', async () => {
    const first = warmSmallerVariant(lesson)
    const second = warmSmallerVariant(lesson)
    expect(first).toBe(second)
    expect(mockedGen).toHaveBeenCalledTimes(1)
    // Familiar solutions are allowed for the remediation variant.
    expect(mockedGen.mock.calls[0][1]).toEqual({ allowFamiliarSolution: true })
    // Readiness resolves immediately to the deterministic authored fallback —
    // it never blocks on the slow AI round-trip.
    expect(await first!).toEqual({ aiGenerated: true, source: 'authored' })
    expect(mockedDerive).toHaveBeenCalledWith(lesson)
  })

  it('upgrades the served puzzle to the AI result once generation lands', async () => {
    warmSmallerVariant(lesson)
    // Before the AI resolves, consume serves the authored fallback.
    expect(consumeSmallerVariant('lesson-x')).toEqual({ aiGenerated: true, source: 'authored' })
    // After the background generation lands, consume serves the fresher AI puzzle.
    await flush()
    expect(consumeSmallerVariant('lesson-x')).toEqual({ aiGenerated: true, source: 'ai' })
  })

  it('peek returns the readiness promise; clear forces a fresh warm', async () => {
    const warmed = warmSmallerVariant(lesson)
    expect(peekSmallerVariant('lesson-x')).toBe(warmed)
    clearSmallerVariant('lesson-x')
    expect(peekSmallerVariant('lesson-x')).toBeNull()
    expect(consumeSmallerVariant('lesson-x')).toBeNull()
    warmSmallerVariant(lesson)
    expect(mockedGen).toHaveBeenCalledTimes(2)
  })

  it('returns null without generating when the lesson has no generator concept', () => {
    mockedTemplate.mockReturnValue(null)
    expect(warmSmallerVariant(lesson)).toBeNull()
    expect(mockedGen).not.toHaveBeenCalled()
    expect(mockedDerive).not.toHaveBeenCalled()
  })

  it('keeps serving the authored fallback when AI generation rejects', async () => {
    mockedGen.mockRejectedValueOnce(new Error('boom'))
    const warmed = warmSmallerVariant(lesson)
    expect(await warmed!).toEqual({ aiGenerated: true, source: 'authored' })
    await flush()
    expect(consumeSmallerVariant('lesson-x')).toEqual({ aiGenerated: true, source: 'authored' })
  })

  it('keeps serving the authored fallback when AI generation abstains (null)', async () => {
    mockedGen.mockResolvedValueOnce(null as never)
    const warmed = warmSmallerVariant(lesson)
    expect(await warmed!).toEqual({ aiGenerated: true, source: 'authored' })
    await flush()
    expect(consumeSmallerVariant('lesson-x')).toEqual({ aiGenerated: true, source: 'authored' })
  })

  it('readiness resolves to null only when there is no authored fallback either', async () => {
    mockedDerive.mockReturnValue(null as never)
    const warmed = warmSmallerVariant(lesson)
    expect(await warmed!).toBeNull()
    expect(consumeSmallerVariant('lesson-x')).toBeNull()
  })
})
