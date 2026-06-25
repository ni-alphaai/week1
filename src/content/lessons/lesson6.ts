import type { Conditional, Instruction, Lesson, Loop, PredicateOption, While } from '../../types'

type Dir = 'right' | 'up' | 'left' | 'down'
const cap = (dir: Dir) => `${dir[0].toUpperCase()}${dir.slice(1)}`

// Run `body` an exact number of times.
const repeat = (count: number, body: Instruction[], label: string): Loop => ({
  kind: 'loop',
  count,
  body,
  label,
})

// Keep running `body` while `dir` is clear (used to scan a corridor).
const whileClear = (dir: Dir, body: Instruction[]): While => ({
  kind: 'while',
  predicate: { sensor: 'clear', dir },
  body,
  label: `${cap(dir)} is clear`,
})

// The counter conditions, with kid-friendly labels.
const evenOdd: PredicateOption[] = [
  { predicate: { sensor: 'counterEven' }, label: 'count is even' },
  { predicate: { sensor: 'counterOdd' }, label: 'count is odd' },
]
const clearRight: PredicateOption = { predicate: { sensor: 'clear', dir: 'right' }, label: 'Right is clear' }
const clearUp: PredicateOption = { predicate: { sensor: 'clear', dir: 'up' }, label: 'Up is clear' }
const divBy3: PredicateOption = {
  predicate: { sensor: 'counterMod', divisor: 3, remainder: 0 },
  label: 'count divides by 3',
}
const divBy5: PredicateOption = {
  predicate: { sensor: 'counterMod', divisor: 5, remainder: 0 },
  label: 'count divides by 5',
}

const loopRange = { min: 1, max: 8 }

export const lesson6: Lesson = {
  id: 'lesson-6-counter-code',
  version: 2,
  title: 'Counter Code',
  subtitle: 'Your explorer counts its steps — turn that count into a calculator.',
  sequence: 6,
  skillIds: ['conditionals', 'loops', 'planning'],
  award: {
    id: 'master-coder',
    title: 'Master Coder',
    blurb: 'Turned the step counter into a calculator — even/odd and modulo logic mastered.',
  },
  steps: [
    {
      id: 'l6-intro',
      type: 'concept',
      title: 'The step counter',
      body: 'Your explorer **counts every step it takes**, starting at **zero**. Your If blocks can now sense that count — check if it\'s **even**, **odd**, or **divisible by a number** — and behave differently on each step. Some tiles even **boost** the count when you land on them. Clear all five to earn your **Master Coder** badge!',
    },
    {
      id: 'l6-q1',
      type: 'conditional',
      requiresConditional: false,
      goal: 'Even or odd',
      prompt: 'Reach the treasure at the top-right corner. The field is open, so only your step count can tell you when to climb and when to step forward. The counter starts at 0 (even). Work out the rule and set the Repeat count.',
      map: {
        rows: 3,
        cols: 3,
        start: { row: 2, col: 0 },
        goal: { row: 0, col: 2 },
      },
      availableCommands: ['up', 'right', 'down', 'left'],
      blocks: ['loop', 'if'],
      predicateOptions: evenOdd,
      loopRange,
      cardLimits: { up: 1, right: 1 },
      initialProgram: [
        repeat(
          1,
          [
            {
              kind: 'conditional',
              predicate: { sensor: 'counterEven' },
              then: [],
              else: [],
              label: 'count is even',
            } as Conditional,
          ],
          'Repeat 1×',
        ),
      ],
      solution: [
        repeat(
          4,
          [
            {
              kind: 'conditional',
              predicate: { sensor: 'counterEven' },
              then: ['up'],
              else: ['right'],
              label: 'count is even',
            } as Conditional,
          ],
          'Repeat 4× → if count is even',
        ),
      ],
      feedback: {
        correct: 'Up on even, right on odd — the counter built a perfect staircase.',
        hints: [
          'The count flips even/odd every move: 0, 1, 2, 3… so the If can pick a different direction each step.',
          'Decide which move belongs on the even step and which on the odd, then count the moves to set the Repeat.',
        ],
      },
    },
    {
      id: 'l6-q2',
      type: 'conditional',
      requiresConditional: false,
      goal: 'Skip and collect',
      prompt: 'A gem sits in the row, but you have no gem-sensor this time — only the step counter. Time your grab by the count, then carry the gem to the treasure and drop it.',
      map: {
        rows: 1,
        cols: 5,
        start: { row: 0, col: 0 },
        goal: { row: 0, col: 4 },
        tasks: [{ from: { row: 0, col: 2 }, to: { row: 0, col: 4 }, label: 'the gem' }],
      },
      availableCommands: ['right', 'left'],
      availableActions: ['pickup', 'drop'],
      blocks: ['while', 'if'],
      predicateOptions: [clearRight, ...evenOdd],
      cardLimits: { right: 3, pickup: 1, drop: 1 },
      initialProgram: [
        whileClear('right', [
          {
            kind: 'conditional',
            predicate: { sensor: 'counterEven' },
            then: [],
            else: [],
            label: 'count is even',
          } as Conditional,
        ]),
      ],
      solution: [
        'right',
        whileClear('right', [
          {
            kind: 'conditional',
            predicate: { sensor: 'counterEven' },
            then: ['pickup', 'right'],
            else: ['right'],
            label: 'count is even',
          } as Conditional,
        ]),
        'drop',
      ],
      feedback: {
        correct: 'The counter landed even right on the gem — picked up without you counting tiles.',
        hints: [
          'A single step before the loop changes whether the count is even or odd when you reach the gem — work out the timing so the gem tile lines up.',
          'Use that even/odd cue to fire Pick up on exactly the gem tile, then Drop once you reach the flag.',
        ],
      },
    },
    {
      id: 'l6-q3',
      type: 'conditional',
      requiresConditional: false,
      goal: 'Every third',
      prompt: 'Climb to the treasure across an open field. There are no walls to feel for — the only thing you can sense is your step count. Work out the rule: how often must you turn upward instead of stepping forward? Then set the Repeat count to land exactly on the corner.',
      map: {
        rows: 4,
        cols: 7,
        start: { row: 3, col: 0 },
        goal: { row: 0, col: 6 },
      },
      availableCommands: ['right', 'up'],
      blocks: ['loop', 'if'],
      predicateOptions: [divBy3, divBy5],
      loopRange: { min: 1, max: 12 },
      cardLimits: { right: 1, up: 1 },
      initialProgram: [
        repeat(
          1,
          [
            {
              kind: 'conditional',
              predicate: { sensor: 'counterMod', divisor: 3, remainder: 0 },
              then: [],
              else: [],
              label: 'count divides by 3',
            } as Conditional,
          ],
          'Repeat 1×',
        ),
      ],
      solution: [
        repeat(
          9,
          [
            {
              kind: 'conditional',
              predicate: { sensor: 'counterMod', divisor: 3, remainder: 0 },
              then: ['up'],
              else: ['right'],
              label: 'count divides by 3',
            } as Conditional,
          ],
          'Repeat 9×',
        ),
      ],
      feedback: {
        correct: 'One step up for every three — the counter drew a perfect slope to the corner.',
        hints: [
          'The field is open, so clear/blocked tell you nothing — only the step count matters.',
          'Pick the divide-by rule that turns you upward at the right rhythm, then count the moves to set the Repeat.',
        ],
      },
    },
    {
      id: 'l6-debug',
      type: 'conditional',
      requiresConditional: false,
      goal: 'Debug: wrong rhythm',
      prompt: 'This climber uses the right Repeat count and the right moves, but it picks the wrong rhythm — "count is even" makes it turn up far too often and it walks off the top. Read it, then change only the condition so it climbs at the correct pace and lands on the treasure.',
      map: {
        rows: 4,
        cols: 7,
        start: { row: 3, col: 0 },
        goal: { row: 0, col: 6 },
      },
      availableCommands: ['right', 'up'],
      blocks: ['loop', 'if'],
      predicateOptions: [...evenOdd, divBy3],
      loopRange: { min: 1, max: 12 },
      cardLimits: { right: 1, up: 1 },
      editableInitial: true,
      initialProgram: [
        repeat(
          9,
          [
            {
              kind: 'conditional',
              predicate: { sensor: 'counterEven' },
              then: ['up'],
              else: ['right'],
              label: 'count is even',
            } as Conditional,
          ],
          'Repeat 9×',
        ),
      ],
      solution: [
        repeat(
          9,
          [
            {
              kind: 'conditional',
              predicate: { sensor: 'counterMod', divisor: 3, remainder: 0 },
              then: ['up'],
              else: ['right'],
              label: 'count divides by 3',
            } as Conditional,
          ],
          'Repeat 9×',
        ),
      ],
      feedback: {
        correct: 'One up for every three, not every two — the right rhythm draws a clean slope to the corner.',
        hints: [
          '"Even" is true every other step — that climbs twice as fast as the slope needs.',
          'Only the condition is wrong: leave the moves and count alone, and pick the divide-by rule whose rhythm matches one climb every few steps.',
        ],
      },
    },
    {
      id: 'l6-q4',
      type: 'conditional',
      requiresConditional: false,
      goal: 'Counter tiles boost',
      prompt: 'The glowing tile in the middle boosts your count when you land on it. Use that to reach the treasure in the top-right corner.',
      map: {
        rows: 2,
        cols: 5,
        start: { row: 1, col: 0 },
        goal: { row: 0, col: 4 },
        counterTiles: [{ at: { row: 1, col: 2 }, bonus: 2 }],
      },
      availableCommands: ['right', 'up', 'down', 'left'],
      blocks: ['while', 'if'],
      predicateOptions: [clearUp, clearRight, divBy3],
      cardLimits: { right: 2, up: 1 },
      initialProgram: [
        whileClear('up', [
          {
            kind: 'conditional',
            predicate: { sensor: 'counterMod', divisor: 3, remainder: 0 },
            then: [],
            else: [],
            label: 'count divides by 3',
          } as Conditional,
        ]),
      ],
      solution: [
        'right',
        whileClear('up', [
          {
            kind: 'conditional',
            predicate: { sensor: 'counterMod', divisor: 3, remainder: 0 },
            then: ['up'],
            else: ['right'],
            label: 'count divides by 3',
          } as Conditional,
        ]),
      ],
      feedback: {
        correct: 'The +2 boost pushed "divides by 3" to the last column — so you climbed exactly onto the treasure.',
        hints: [
          'Scan while Up is clear so the loop stops once you reach the top row.',
          'The glowing tile adds 2 to your count, so the divide-by-3 turn happens one column later than you\'d expect.',
        ],
      },
    },
    {
      id: 'l6-q5',
      type: 'conditional',
      requiresConditional: false,
      goal: 'Every fifth',
      prompt: 'A wider open field, a gentler slope. Same idea as before, but the turn comes around less often. Sense only the step count, work out how often to climb, and set the Repeat to finish exactly on the treasure.',
      map: {
        rows: 3,
        cols: 9,
        start: { row: 2, col: 0 },
        goal: { row: 0, col: 8 },
      },
      availableCommands: ['right', 'up'],
      blocks: ['loop', 'if'],
      predicateOptions: [divBy3, divBy5],
      loopRange: { min: 1, max: 14 },
      cardLimits: { right: 1, up: 1 },
      initialProgram: [
        repeat(
          1,
          [
            {
              kind: 'conditional',
              predicate: { sensor: 'counterMod', divisor: 5, remainder: 0 },
              then: [],
              else: [],
              label: 'count divides by 5',
            } as Conditional,
          ],
          'Repeat 1×',
        ),
      ],
      solution: [
        repeat(
          10,
          [
            {
              kind: 'conditional',
              predicate: { sensor: 'counterMod', divisor: 5, remainder: 0 },
              then: ['up'],
              else: ['right'],
              label: 'count divides by 5',
            } as Conditional,
          ],
          'Repeat 10×',
        ),
      ],
      feedback: {
        correct: 'One step up for every five — a longer stride between climbs, landing right on the treasure.',
        hints: [
          'The climbs come less often here than in the divide-by-3 puzzle — pick the divisor that matches this gentler slope.',
          'Turn upward when the count hits that rhythm, otherwise step Right, then count the moves to set the Repeat.',
        ],
      },
    },
  ],
}
