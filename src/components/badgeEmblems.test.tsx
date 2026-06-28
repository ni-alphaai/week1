import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { BADGES } from '../content/badges'
import { emblemFor } from './badgeEmblems'

describe('emblemFor', () => {
  it('returns a renderable svg for every achievement badge in BADGES', () => {
    for (const badge of BADGES) {
      const { container } = render(<>{emblemFor(badge.id)}</>)
      expect(container.querySelector('svg'), `missing svg for badge "${badge.id}"`).toBeTruthy()
    }
  })

  it('falls back to the generic emblem for an unknown id', () => {
    const { container } = render(<>{emblemFor('unknown-badge-xyz')}</>)
    expect(container.querySelector('svg')).toBeTruthy()
  })

  it('passes className through to the rendered svg', () => {
    const { container } = render(<>{emblemFor('speedy', 'w-8 h-8 text-gold')}</>)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    // SVG className is an SVGAnimatedString in jsdom; use getAttribute instead
    expect(svg!.getAttribute('class')).toContain('w-8 h-8 text-gold')
  })

  it('passes className for an unknown id too (fallback respects className)', () => {
    const { container } = render(<>{emblemFor('mystery', 'size-12')}</>)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    // SVG className is an SVGAnimatedString in jsdom; use getAttribute instead
    expect(svg!.getAttribute('class')).toContain('size-12')
  })
})
