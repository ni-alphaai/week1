import { describe, it, expect } from 'vitest'
import { medalPixelRatio } from './webgl'

describe('medalPixelRatio', () => {
  it('caps the grid (non-draggable) at 2', () => {
    expect(medalPixelRatio(1, false)).toBe(1)
    expect(medalPixelRatio(2, false)).toBe(2)
    expect(medalPixelRatio(3, false)).toBe(2)
  })

  it('supersamples the detail (draggable) view up to 3', () => {
    expect(medalPixelRatio(1, true)).toBe(2) // base 1 * 2
    expect(medalPixelRatio(2, true)).toBe(3) // base 2 * 2 -> capped at 3
    expect(medalPixelRatio(3, true)).toBe(3) // base capped at 2, *2 -> capped at 3
  })

  it('guards a zero / missing device ratio', () => {
    expect(medalPixelRatio(0, false)).toBe(1)
    expect(medalPixelRatio(0, true)).toBe(2)
  })
})
