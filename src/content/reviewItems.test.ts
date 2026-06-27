import { describe, it, expect } from 'vitest'
import { authoredItemForSkill, reviewItemForSkill } from './reviewItems'

describe('authored-first review items', () => {
  it('returns an authored puzzle for every known skill (none orphaned)', () => {
    for (const skill of ['sequencing', 'loops', 'conditionals', 'planning']) {
      expect(authoredItemForSkill(skill)).not.toBeNull()
    }
  })
  it('reviewItemForSkill serves the authored puzzle with a blank editor by default', () => {
    const item = reviewItemForSkill('loops', 1)
    expect(item.source).toBe('authored')
    expect(item.blankEditor).toBe(true)
    expect(item.puzzle).toBeTruthy()
  })
})
