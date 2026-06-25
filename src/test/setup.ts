import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Ensure React Testing Library unmounts components between tests.
afterEach(() => {
  cleanup()
})
