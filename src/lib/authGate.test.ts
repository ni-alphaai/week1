import { describe, it, expect } from 'vitest'
import { shouldGateForAuth } from './authGate'

// Guards the public-share carve-out in the auth gate: a /share/:code link is the
// feature's primary entry point for kids/parents without an account, so it must
// never be replaced by the sign-in form.
describe('shouldGateForAuth', () => {
  it('never gates a public /share link, even with auth enabled and no user', () => {
    expect(shouldGateForAuth(true, false, '/share/v1.abc123')).toBe(false)
  })

  it('gates a protected route when auth is enabled and nobody is signed in', () => {
    expect(shouldGateForAuth(true, false, '/course')).toBe(true)
  })

  it('does not gate once a parent is signed in', () => {
    expect(shouldGateForAuth(true, true, '/course')).toBe(false)
  })

  it('does not gate when Firebase auth is disabled (local mode)', () => {
    expect(shouldGateForAuth(false, false, '/parent')).toBe(false)
  })
})
