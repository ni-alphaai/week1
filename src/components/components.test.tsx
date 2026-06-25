import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { MapConfig } from '../types'
import { BirdGuide } from './BirdGuide'
import { MapGrid } from './MapGrid'
import { CommandSequence } from './CommandSequence'
import type { PaletteItem, ProgramNode } from './CommandSequence'
import { Confetti } from './Confetti'

describe('BirdGuide', () => {
  it('renders Rico and the guide message', () => {
    render(<BirdGuide message="Count the tiles to the treasure." mood="explain" typewriter={false} />)
    expect(screen.getByText('Rico')).toBeInTheDocument()
    expect(screen.getByText('Your guide')).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('Count the tiles to the treasure.')
  })

  it('shows a hint chip when helping after a failure', () => {
    render(<BirdGuide message="Try climbing first." mood="hint" />)
    expect(screen.getByText('Hint')).toBeInTheDocument()
  })

  it('supports a sidebar layout variant', () => {
    render(<BirdGuide message="Sidebar guide." mood="explain" variant="sidebar" />)
    expect(screen.getByRole('note')).toHaveClass('guide-card--sidebar')
  })
})

describe('MapGrid', () => {
  const map: MapConfig = {
    rows: 3,
    cols: 3,
    start: { row: 2, col: 0 },
    goal: { row: 0, col: 2 },
  }

  it('labels the start tile', () => {
    render(<MapGrid map={map} explorer={map.start} />)
    expect(screen.getByText('start')).toBeInTheDocument()
  })

  it('shows bridge marker when bridge is open', () => {
    const bridged: MapConfig = {
      ...map,
      bridge: { row: 1, col: 1, open: true },
    }
    render(<MapGrid map={bridged} explorer={map.start} />)
    expect(screen.getByRole('img', { name: 'Open bridge' })).toBeInTheDocument()
  })

  it('accepts an activeTile prop for run highlighting', () => {
    const { container } = render(
      <MapGrid map={map} explorer={{ row: 1, col: 0 }} activeTile={{ row: 1, col: 0 }} />,
    )
    expect(container.querySelector('.animate-tile-glow')).toBeTruthy()
  })
})

describe('CommandSequence', () => {
  const palette: PaletteItem[] = [
    { key: 'm-up', kind: 'move', command: 'up' },
    { key: 'm-right', kind: 'move', command: 'right' },
    { key: 'b-loop', kind: 'loop' },
  ]

  it('adds a card to the program when a palette stamp is tapped', async () => {
    const onChange = vi.fn()
    render(<CommandSequence palette={palette} program={[]} onChange={onChange} />)
    await userEvent.click(screen.getByText('Up'))
    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as ProgramNode[]
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ kind: 'move', command: 'up' })
  })

  it('offers a Repeat container block in the palette', () => {
    render(<CommandSequence palette={palette} program={[]} onChange={vi.fn()} />)
    expect(screen.getByText(/Repeat …× block/)).toBeInTheDocument()
  })

  it('removes a node from the program when its × is tapped', async () => {
    const onChange = vi.fn()
    const program: ProgramNode[] = [{ id: 'm0', kind: 'move', command: 'up' }]
    render(<CommandSequence palette={[]} program={program} onChange={onChange} />)
    await userEvent.click(screen.getByLabelText('Remove block'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toHaveLength(0)
  })

  it('renders a loop block with a count stepper', () => {
    const program: ProgramNode[] = [{ id: 'l0', kind: 'loop', count: 3, body: [] }]
    render(<CommandSequence palette={[]} program={program} onChange={vi.fn()} />)
    expect(screen.getByText('Repeat')).toBeInTheDocument()
    expect(screen.getByLabelText('More repeats')).toBeInTheDocument()
  })

  it('shows remaining count for a limited card', () => {
    const limited: PaletteItem[] = [{ key: 'm-right', kind: 'move', command: 'right', limit: 2 }]
    render(<CommandSequence palette={limited} program={[]} onChange={vi.fn()} />)
    expect(screen.getByText('2 left')).toBeInTheDocument()
  })

  it('disables a palette stamp once its limit is reached and ignores taps', async () => {
    const onChange = vi.fn()
    const limited: PaletteItem[] = [{ key: 'm-right', kind: 'move', command: 'right', limit: 1 }]
    // Program already contains one Right, so the stamp is exhausted (0 left).
    const program: ProgramNode[] = [{ id: 'r0', kind: 'move', command: 'right' }]
    render(<CommandSequence palette={limited} program={program} onChange={onChange} />)
    expect(screen.getByText('0 left')).toBeInTheDocument()
    await userEvent.click(screen.getByLabelText('0 left').closest('[role="button"]')!)
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('Confetti', () => {
  it('renders confetti pieces without blocking interaction', () => {
    const { container } = render(<Confetti count={10} />)
    expect(container.querySelectorAll('.animate-confetti')).toHaveLength(10)
    expect(container.firstChild).toHaveClass('pointer-events-none')
  })
})
