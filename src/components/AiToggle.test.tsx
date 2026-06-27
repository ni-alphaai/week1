import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('AiToggle Capability gate', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('renders nothing when there is no AI Capability', async () => {
    vi.stubEnv('VITE_AI_ENABLED', 'false')
    vi.doMock('../ai/config', () => ({ aiEnabled: false }))
    const { AiToggle } = await import('./AiToggle')
    const { container } = render(<AiToggle />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the switch when AI Capability is present', async () => {
    vi.stubEnv('VITE_AI_ENABLED', 'true')
    vi.doMock('../ai/config', () => ({ aiEnabled: true }))
    const { AiToggle } = await import('./AiToggle')
    render(<AiToggle />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})
