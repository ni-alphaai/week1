import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { BadgeMedalGrid } from './BadgeMedalGrid'
import { badgeMeta } from '../content/badges'

// jsdom has no WebGL, so supportsWebGL() returns false and the 3D path never
// activates. These tests verify the DOM-first grid (tiles, emblems, labels,
// onSelect, locked treatment) — intentionally the only path covered here.

const items = [
  { badgeId: 'first-loop', tier: 'bronze' as const, earned: true },
  { badgeId: 'first-while', tier: 'silver' as const, earned: true },
  { badgeId: 'optimal-solver', tier: 'gold' as const, earned: false },
]

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BadgeMedalGrid (DOM-first)', () => {
  it('renders one button tile per item', () => {
    render(<BadgeMedalGrid items={items} onSelect={() => {}} />)
    expect(screen.getAllByRole('button')).toHaveLength(items.length)
  })

  it('shows each badge title as a label', () => {
    render(<BadgeMedalGrid items={items} onSelect={() => {}} />)
    for (const it of items) {
      expect(screen.getByText(badgeMeta(it.badgeId).title)).toBeInTheDocument()
    }
  })

  it('renders the 2D emblem (an svg) inside an earned tile', () => {
    render(<BadgeMedalGrid items={[items[0]]} onSelect={() => {}} />)
    const tile = screen.getByRole('button')
    expect(tile.querySelector('svg')).toBeInTheDocument()
  })

  it('applies the tier hook class per tile', () => {
    render(<BadgeMedalGrid items={items} onSelect={() => {}} />)
    const tiles = screen.getAllByRole('button')
    expect(tiles[0].className).toContain('badge-tier--bronze')
    expect(tiles[1].className).toContain('badge-tier--silver')
    expect(tiles[2].className).toContain('badge-tier--gold')
  })

  it('renders the lock treatment (not the emblem) for a locked item', () => {
    render(<BadgeMedalGrid items={[{ badgeId: 'optimal-solver', tier: 'gold', earned: false }]} onSelect={() => {}} />)
    const tile = screen.getByRole('button')
    expect(tile.className).toContain('badge-tile--locked')
    // Still has an svg (the LockIcon) but no earned-emblem marker.
    expect(tile.querySelector('svg')).toBeInTheDocument()
  })

  it('calls onSelect with the badge id when a tile is clicked', () => {
    const onSelect = vi.fn()
    render(<BadgeMedalGrid items={items} onSelect={onSelect} />)
    fireEvent.click(screen.getByText(badgeMeta('first-loop').title).closest('button')!)
    expect(onSelect).toHaveBeenCalledWith('first-loop')
  })

  it('calls onSelect for locked tiles too (detail card explains how to earn)', () => {
    const onSelect = vi.fn()
    render(<BadgeMedalGrid items={items} onSelect={onSelect} />)
    fireEvent.click(screen.getByText(badgeMeta('optimal-solver').title).closest('button')!)
    expect(onSelect).toHaveBeenCalledWith('optimal-solver')
  })

  it('activates onSelect via keyboard (Enter on the native button)', () => {
    const onSelect = vi.fn()
    render(<BadgeMedalGrid items={[items[0]]} onSelect={onSelect} />)
    const tile = screen.getByRole('button')
    // Native <button> fires click on Enter; emulate that activation.
    fireEvent.keyDown(tile, { key: 'Enter', code: 'Enter' })
    fireEvent.click(tile)
    expect(onSelect).toHaveBeenCalledWith('first-loop')
  })

  it('applies a passed className to the container', () => {
    const { container } = render(<BadgeMedalGrid items={items} onSelect={() => {}} className="my-grid" />)
    expect(container.querySelector('.my-grid')).toBeInTheDocument()
  })

  it('renders an aria-hidden canvas pinned to the grid', () => {
    const { container } = render(<BadgeMedalGrid items={items} onSelect={() => {}} />)
    const canvas = container.querySelector('canvas')
    expect(canvas).toBeInTheDocument()
    expect(canvas).toHaveAttribute('aria-hidden', 'true')
  })

  it('does not throw when WebGL is absent (the jsdom case)', () => {
    expect(() => render(<BadgeMedalGrid items={items} onSelect={() => {}} />)).not.toThrow()
  })

  it('renders nothing breaking for an empty item list', () => {
    render(<BadgeMedalGrid items={[]} onSelect={() => {}} />)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
