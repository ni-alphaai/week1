import type { Conditional, Instruction, Lesson, Loop, PredicateOption, While } from '../../types'

// Run `body` an exact number of times.
const repeat = (count: number, body: Instruction[], label: string): Loop => ({
  kind: 'loop',
  count,
  body,
  label,
})

const divBy3: PredicateOption = {
  predicate: { sensor: 'counterMod', divisor: 3, remainder: 0 },
  label: 'count divides by 3',
}
const divBy5: PredicateOption = {
  predicate: { sensor: 'counterMod', divisor: 5, remainder: 0 },
  label: 'count divides by 5',
}

// Comparison sensors for the higher/lower number search.
const searching: PredicateOption = { predicate: { sensor: 'targetNotFound' }, label: 'still searching' }
const numberHigher: PredicateOption = { predicate: { sensor: 'targetHigher' }, label: 'the number is higher' }
const numberLower: PredicateOption = { predicate: { sensor: 'targetLower' }, label: 'the number is lower' }

// One FizzBuzz decision: check divide-by-3 on the outside, divide-by-5 inside
// each branch. Both-divisible -> step right, 3-only -> up, 5-only -> down,
// neither -> right. The nesting is what makes the both-case behave correctly.
const fizzBuzzStep = (): Conditional => ({
  kind: 'conditional',
  predicate: { sensor: 'counterMod', divisor: 3, remainder: 0 },
  then: [
    {
      kind: 'conditional',
      predicate: { sensor: 'counterMod', divisor: 5, remainder: 0 },
      then: ['right'],
      else: ['up'],
      label: 'count divides by 5',
    } as Conditional,
  ],
  else: [
    {
      kind: 'conditional',
      predicate: { sensor: 'counterMod', divisor: 5, remainder: 0 },
      then: ['down'],
      else: ['right'],
      label: 'count divides by 5',
    } as Conditional,
  ],
  label: 'count divides by 3',
})

export const lesson7: Lesson = {
  id: 'lesson-7-challenges',
  version: 1,
  title: 'Challenges',
  subtitle: 'Famous coding-interview puzzles, rebuilt for your explorer.',
  sequence: 7,
  skillIds: ['conditionals', 'loops', 'planning'],
  award: {
    id: 'algorithm-ace',
    title: 'Algorithm Ace',
    blurb: 'Cracked FizzBuzz with nested Ifs, multiplied steps with nested loops, and ran a real binary search — true algorithm thinking.',
  },
  steps: [
    {
      id: 'c7-intro',
      type: 'concept',
      title: 'Real algorithms',
      body: 'Three puzzles real programmers know. Build **FizzBuzz** with an If inside an If, **multiply your steps** with a loop inside a loop, and run a **binary search** that jumps to the middle and tosses half the tiles every guess. Clear them to earn your **Algorithm Ace** badge.',
    },
    {
      id: 'c7-fizzbuzz-intro',
      type: 'concept',
      title: 'Step to the beat',
      body: 'Rico crosses the floor to a steady beat, counting every step: 0, 1, 2, 3, 4…\n\nTwo beats are special:\nwhen the count **divides by 3** (every 3rd beat), Rico hops **Up**\nwhen the count **divides by 5** (every 5th beat), Rico dips **Down**\nevery other beat, he just struts **Right**\n\nThe twist: on a beat like **0** or **15**, the count divides by 3 **and** 5 at the same time — but Rico can\'t hop and dip on one beat, so he just struts **Right**.\n\nChecking "divides by 3?" and "divides by 5?" side by side misses those double beats. Programmers call this puzzle **FizzBuzz**, and the trick is to nest one **If inside another**: ask "divides by 3?", and *inside* it ask "divides by 5?". Now every beat has exactly one move.',
    },
    {
      id: 'c7-fizzbuzz',
      type: 'conditional',
      requiresConditional: false,
      goal: 'FizzBuzz',
      prompt: 'Cross to the beat: divides by 3 → hop Up, divides by 5 → dip Down, otherwise strut Right. Nest one If inside another to catch the "both" beats, then set the Repeat to run it all the way.',
      map: {
        rows: 3,
        cols: 10,
        start: { row: 2, col: 0 },
        goal: { row: 0, col: 9 },
        obstacles: [{ row: 1, col: 0 }],
      },
      availableCommands: ['right', 'up', 'down'],
      blocks: ['loop', 'if'],
      predicateOptions: [divBy3, divBy5],
      loopRange: { min: 1, max: 16 },
      cardLimits: { right: 2, up: 1, down: 1 },
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
      solution: [repeat(15, [fizzBuzzStep()], 'Repeat 15×')],
      feedback: {
        correct: 'Nested If blocks told FizzBuzz apart from plain Fizz — that is the puzzle, solved with logic, not luck.',
        hints: [
          'The count starts at 0, which divides by BOTH 3 and 5 — that is the case a flat plan gets wrong.',
          'Try letting one If ask its question inside a branch of the other, so the both-divisible step is handled on its own.',
        ],
      },
    },
    {
      id: 'c7-sweep',
      type: 'conditional',
      requiresConditional: false,
      goal: 'Loop inside a loop',
      prompt: 'The treasure is 8 steps to the right — but you get only ONE Right card and your Repeat can count no higher than 5. Nest a Repeat inside a Repeat to multiply your steps and reach it.',
      map: {
        rows: 1,
        cols: 9,
        start: { row: 0, col: 0 },
        goal: { row: 0, col: 8 },
      },
      availableCommands: ['right'],
      blocks: ['loop'],
      loopRange: { min: 1, max: 5 },
      cardLimits: { right: 1 },
      solution: [repeat(4, [repeat(2, ['right'], 'Repeat 2×')], 'Repeat 4×')],
      feedback: {
        correct: 'A loop inside a loop multiplied your single Right card into eight steps. That is how nesting scales.',
        hints: [
          'One Right card can only stretch so far on its own — a loop inside a loop multiplies how many steps it makes.',
          'Think of the distance as two numbers multiplied together, and let the outer loop run the inner one.',
        ],
      },
    },
    {
      id: 'c7-climb',
      type: 'conditional',
      requiresConditional: false,
      goal: 'Stairs by nesting',
      prompt: 'Climb to the top-right corner. Each stair is one step Up then three steps Right — and the whole staircase repeats. You get only ONE Up card and ONE Right card, so nest a Repeat inside a Repeat to build the climb.',
      map: {
        rows: 4,
        cols: 10,
        start: { row: 3, col: 0 },
        goal: { row: 0, col: 9 },
      },
      availableCommands: ['right', 'up'],
      blocks: ['loop'],
      loopRange: { min: 1, max: 4 },
      cardLimits: { right: 1, up: 1 },
      solution: [
        repeat(3, ['up', repeat(3, ['right'], 'Repeat 3×')], 'Repeat 3×'),
      ],
      feedback: {
        correct: 'One stair, repeated three times — an outer loop running an inner loop built the whole climb.',
        hints: [
          'A staircase is the same little step repeated — find the shape of one stair first.',
          'Once you know one stair, work out how many stairs it takes to reach the top, and let the outer loop repeat them.',
        ],
      },
    },
    {
      id: 'c7-binary',
      type: 'concept',
      title: 'Binary search',
      body: 'How do you find a number in a sorted row without checking every tile? Keep a **range** of tiles it could be in. Each round: **Go to middle** of the range and read it, then throw away the half that cannot hold your number — **Discard lower half** if your target is higher, **Discard upper half** if it is lower. The range halves every round, so even a long row falls in just a few jumps. The greyed-out tiles show what you have ruled out.',
    },
    {
      id: 'c7-search',
      type: 'conditional',
      requiresConditional: false,
      goal: 'Binary search',
      prompt: 'Find the hidden number without checking every tile. Keep going while you are still searching: jump to the middle of what is left, then throw away the half that cannot be hiding your number. Watch the greyed-out tiles — half the range should vanish on every guess.',
      map: {
        rows: 1,
        cols: 7,
        start: { row: 0, col: 0 },
        goal: { row: 0, col: 6 },
        targetValue: 60,
        binarySearch: true,
        numberTiles: [
          { at: { row: 0, col: 0 }, value: 5 },
          { at: { row: 0, col: 1 }, value: 11 },
          { at: { row: 0, col: 2 }, value: 18 },
          { at: { row: 0, col: 3 }, value: 26 },
          { at: { row: 0, col: 4 }, value: 35 },
          { at: { row: 0, col: 5 }, value: 47 },
          { at: { row: 0, col: 6 }, value: 60 },
        ],
      },
      availableCommands: [],
      availableActions: ['toMiddle', 'discardLower', 'discardUpper'],
      blocks: ['while', 'if'],
      predicateOptions: [searching, numberHigher, numberLower],
      cardLimits: { toMiddle: 1, discardLower: 1, discardUpper: 1 },
      initialProgram: [
        {
          kind: 'while',
          predicate: { sensor: 'targetNotFound' },
          body: [
            {
              kind: 'conditional',
              predicate: { sensor: 'targetHigher' },
              then: [],
              else: [],
              label: 'the number is higher',
            } as Conditional,
          ],
          label: 'still searching',
        } as While,
      ],
      solution: [
        {
          kind: 'while',
          predicate: { sensor: 'targetNotFound' },
          body: [
            'toMiddle',
            {
              kind: 'conditional',
              predicate: { sensor: 'targetHigher' },
              then: ['discardLower'],
              else: ['discardUpper'],
              label: 'the number is higher',
            } as Conditional,
          ],
          label: 'still searching',
        } as While,
      ],
      feedback: {
        correct: 'That is real binary search! Every round you went to the middle and tossed half the tiles, so the whole row fell in about three jumps.',
        hints: [
          'Each round does two things in order: look at the middle tile, then rule out the half that cannot hold your number.',
          'If your number is bigger than the middle tile, it must lie further along — so which half is safe to throw away?',
        ],
      },
    },
    {
      id: 'c7-search2',
      type: 'conditional',
      requiresConditional: false,
      goal: 'Search, the other way',
      prompt: 'Same binary search, but the number is hiding low this time. The very same loop still works — jump to the middle and rule out the half that cannot hold your number — it just throws away the other side first.',
      map: {
        rows: 1,
        cols: 7,
        start: { row: 0, col: 6 },
        goal: { row: 0, col: 0 },
        targetValue: 4,
        binarySearch: true,
        numberTiles: [
          { at: { row: 0, col: 0 }, value: 4 },
          { at: { row: 0, col: 1 }, value: 9 },
          { at: { row: 0, col: 2 }, value: 15 },
          { at: { row: 0, col: 3 }, value: 22 },
          { at: { row: 0, col: 4 }, value: 30 },
          { at: { row: 0, col: 5 }, value: 40 },
          { at: { row: 0, col: 6 }, value: 52 },
        ],
      },
      availableCommands: [],
      availableActions: ['toMiddle', 'discardLower', 'discardUpper'],
      blocks: ['while', 'if'],
      predicateOptions: [searching, numberHigher, numberLower],
      cardLimits: { toMiddle: 1, discardLower: 1, discardUpper: 1 },
      initialProgram: [
        {
          kind: 'while',
          predicate: { sensor: 'targetNotFound' },
          body: [
            {
              kind: 'conditional',
              predicate: { sensor: 'targetHigher' },
              then: [],
              else: [],
              label: 'the number is higher',
            } as Conditional,
          ],
          label: 'still searching',
        } as While,
      ],
      solution: [
        {
          kind: 'while',
          predicate: { sensor: 'targetNotFound' },
          body: [
            'toMiddle',
            {
              kind: 'conditional',
              predicate: { sensor: 'targetHigher' },
              then: ['discardLower'],
              else: ['discardUpper'],
              label: 'the number is higher',
            } as Conditional,
          ],
          label: 'still searching',
        } as While,
      ],
      feedback: {
        correct: 'Same binary search, mirror image — it tossed the upper half first and halved its way down to the number with no wasted guesses.',
        hints: [
          'Binary search does not care which side the number is on — the same loop you built before still works.',
          'Compare the first middle tile to your target to see which half disappears on the opening guess.',
        ],
      },
    },
  ],
}
