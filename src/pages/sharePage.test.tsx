import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { SharePage } from './SharePage'
import { encodePuzzle } from '../content/shareCode'

function renderShare(code: string) {
  return render(
    <MemoryRouter initialEntries={[`/share/${code}`]}>
      <Routes>
        <Route path="/share/:code" element={<SharePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('SharePage', () => {
  it('shows a friendly broken-link screen for an invalid code', () => {
    renderShare('totally-bogus-code')
    expect(screen.getByText('This puzzle link is broken')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Go to Brillant/ })).toHaveAttribute('href', '/')
  })

  it('renders a playable workspace for a valid share code', () => {
    const code = encodePuzzle({
      map: { rows: 1, cols: 4, start: { row: 0, col: 0 }, goal: { row: 0, col: 3 } },
      availableCommands: ['right'],
      solution: ['right', 'right', 'right'],
      goal: 'Reach the treasure!',
    })
    renderShare(code)
    expect(screen.getByText('Reach the treasure!')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Run program' })).toBeInTheDocument()
  })
})
