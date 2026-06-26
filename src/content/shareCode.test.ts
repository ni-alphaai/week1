import { describe, it, expect } from 'vitest'
import type { ShareablePuzzle } from './shareCode'
import { encodePuzzle, decodePuzzle } from './shareCode'
import { runInstructions } from '../engine/map'

// A simple plain-move navigation puzzle: 3x3 grid, walk from top-left to
// bottom-right. The solution is verified by the engine before sharing.
const navPuzzle: ShareablePuzzle = {
  map: { rows: 3, cols: 3, start: { row: 0, col: 0 }, goal: { row: 2, col: 2 } },
  availableCommands: ['up', 'down', 'left', 'right'],
  solution: ['down', 'down', 'right', 'right'],
  goal: 'Reach the corner',
  prompt: 'Walk to the treasure.',
}

// A loop puzzle modeled on the "march down the hall" exemplar: one Right card
// and a long straight corridor, so a Repeat is the only way across.
const loopPuzzle: ShareablePuzzle = {
  map: { rows: 1, cols: 6, start: { row: 0, col: 0 }, goal: { row: 0, col: 5 } },
  availableCommands: ['right'],
  blocks: ['loop'],
  loopRange: { min: 1, max: 6 },
  cardLimits: { right: 1, loop: 1 },
  solution: [{ kind: 'loop', count: 5, body: ['right'], label: 'Repeat 5×' }],
  goal: 'March down the hall',
}

describe('encodePuzzle / decodePuzzle round-trip', () => {
  it('round-trips a simple navigation puzzle', () => {
    const code = encodePuzzle(navPuzzle)
    expect(code.startsWith('v1.')).toBe(true)
    const back = decodePuzzle(code)
    expect(back).not.toBeNull()
    expect(back!.map).toEqual(navPuzzle.map)
    expect(back!.availableCommands).toEqual(navPuzzle.availableCommands)
    expect(back!.solution).toEqual(navPuzzle.solution)
    expect(back!.goal).toBe(navPuzzle.goal)
    expect(back!.prompt).toBe(navPuzzle.prompt)
  })

  it('round-trips a loop puzzle with nested control flow', () => {
    const code = encodePuzzle(loopPuzzle)
    const back = decodePuzzle(code)
    expect(back).not.toBeNull()
    expect(back!.blocks).toEqual(['loop'])
    expect(back!.loopRange).toEqual({ min: 1, max: 6 })
    expect(back!.cardLimits).toEqual({ right: 1, loop: 1 })
    expect(back!.solution).toEqual(loopPuzzle.solution)
    // The carried solution actually solves the carried map.
    expect(runInstructions(back!.map, back!.solution).status).toBe('success')
  })

  it('omits non-payload fields (optimal/difficulty/concept are not encoded)', () => {
    const padded = {
      ...navPuzzle,
      optimal: 4,
      difficulty: 3,
      concept: 'navigation',
      aiGenerated: true,
    } as ShareablePuzzle & Record<string, unknown>
    const code = encodePuzzle(padded)
    // The raw JSON body must not contain those keys.
    const json = atob(
      code
        .slice(3)
        .replace(/-/g, '+')
        .replace(/_/g, '/') + '='.repeat((4 - (code.slice(3).length % 4)) % 4),
    )
    expect(json).not.toContain('optimal')
    expect(json).not.toContain('difficulty')
    expect(json).not.toContain('concept')
    expect(json).not.toContain('aiGenerated')
  })
})

describe('decodePuzzle rejects bad codes', () => {
  it('returns null for a missing version prefix', () => {
    expect(decodePuzzle('notv1.something')).toBeNull()
  })

  it('returns null for an unknown version', () => {
    const code = encodePuzzle(navPuzzle)
    const v0 = 'v0.' + code.slice(3)
    expect(decodePuzzle(v0)).toBeNull()
  })

  it('returns null for garbage', () => {
    expect(decodePuzzle('v1.@@@')).toBeNull()
    expect(decodePuzzle('v1.')).toBeNull()
    expect(decodePuzzle('')).toBeNull()
    expect(decodePuzzle('not-even-a-code')).toBeNull()
  })

  it('returns null for valid base64url of non-JSON / wrong-shape JSON', () => {
    const enc = (s: string) =>
      'v1.' +
      btoa(encodeURIComponent(s).replace(/%([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    expect(decodePuzzle(enc('{not json'))).toBeNull()
    expect(decodePuzzle(enc('"a string"'))).toBeNull()
    expect(decodePuzzle(enc('{}'))).toBeNull()
    expect(decodePuzzle(enc('{"map":{}}'))).toBeNull()
  })

  it('returns null when a solution does not actually reach the goal', () => {
    const broken: ShareablePuzzle = {
      map: { rows: 3, cols: 3, start: { row: 0, col: 0 }, goal: { row: 2, col: 2 } },
      availableCommands: ['up', 'down', 'left', 'right'],
      // Walks into a corner and stops short of the goal.
      solution: ['down', 'right'],
    }
    expect(runInstructions(broken.map, broken.solution).status).not.toBe('success')
    expect(decodePuzzle(encodePuzzle(broken))).toBeNull()
  })

  it('returns null when a command in the solution is not in the offered palette', () => {
    const sneaky: ShareablePuzzle = {
      map: { rows: 3, cols: 3, start: { row: 0, col: 0 }, goal: { row: 2, col: 2 } },
      availableCommands: ['up', 'down', 'left'], // no 'right'
      solution: ['down', 'down', 'right', 'right'],
    }
    expect(decodePuzzle(encodePuzzle(sneaky))).toBeNull()
  })

  it('returns null for an out-of-bounds position', () => {
    const bad = encodePuzzle({
      ...navPuzzle,
      map: { rows: 3, cols: 3, start: { row: 0, col: 0 }, goal: { row: 9, col: 9 } },
    } as ShareablePuzzle)
    // Engine won't reach goal -> decode null even before considering bounds shape.
    expect(decodePuzzle(bad)).toBeNull()
  })

  it('never throws on hostile input', () => {
    expect(() => decodePuzzle('v1.////')).not.toThrow()
    expect(() => decodePuzzle('v1.' + 'A'.repeat(100000))).not.toThrow()
  })
})

describe('base64url handling', () => {
  it('encodePuzzle never emits URL-unsafe characters or padding', () => {
    const code = encodePuzzle(navPuzzle)
    const body = code.slice(3)
    expect(body).toMatch(/^[A-Za-z0-9_-]+$/)
    expect(body).not.toContain('+')
    expect(body).not.toContain('/')
    expect(body).not.toContain('=')
  })

  it('decodes a code whose body would have contained + or / in standard base64', () => {
    // Craft a puzzle whose JSON includes bytes that standard base64 would map to
    // '+' or '/'; the URL-safe alphabet must still round-trip. We just assert
    // the round-trip holds for a payload rich enough to exercise many bytes.
    const rich: ShareablePuzzle = {
      map: { rows: 4, cols: 4, start: { row: 0, col: 0 }, goal: { row: 3, col: 3 } },
      availableCommands: ['up', 'down', 'left', 'right'],
      blocks: ['loop', 'while', 'if'],
      predicateOptions: [
        { predicate: { sensor: 'blocked', dir: 'right' }, label: 'wall right??+/=' },
        { predicate: { sensor: 'clear', dir: 'up' }, label: 'clear up & down' },
      ],
      loopRange: { min: 1, max: 9 },
      cardLimits: { up: 1, down: 1, left: 1, right: 1, loop: 1, while: 1, if: 1 },
      goal: 'Tricky labels with +/ and = chars',
      prompt: 'Reach the goal.',
      feedback: { correct: 'Nice! +1 = win', hints: ['hint one', 'hint two'] },
      solution: ['down', 'down', 'down', 'right', 'right', 'right'],
    }
    const code = encodePuzzle(rich)
    const back = decodePuzzle(code)
    expect(back).not.toBeNull()
    expect(back!.goal).toBe(rich.goal)
    expect(back!.predicateOptions).toEqual(rich.predicateOptions)
    expect(back!.feedback).toEqual(rich.feedback)
  })

  it('rejects a standard-base64 (URL-unsafe) variant of a valid code', () => {
    const code = encodePuzzle(navPuzzle)
    // Convert the URL-safe body back to standard base64 (with + / and padding).
    const standard =
      code
        .slice(3)
        .replace(/-/g, '+')
        .replace(/_/g, '/') + '='.repeat((4 - (code.slice(3).length % 4)) % 4)
    expect(decodePuzzle('v1.' + standard)).toBeNull()
  })
})
