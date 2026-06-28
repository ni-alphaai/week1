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

// One FizzBuzz decision as a beat reaction: check divide-by-3 on the outside,
// divide-by-5 inside each branch. Both-divisible -> SUPER, 3-only -> DASH,
// 5-only -> SHIELD, neither -> HOLD. The nesting is what makes the both-beat
// emit SUPER instead of a plain DASH or SHIELD.
const fizzBuzzBeat = (): Conditional => ({
  kind: 'conditional',
  predicate: { sensor: 'counterMod', divisor: 3, remainder: 0 },
  then: [
    {
      kind: 'conditional',
      predicate: { sensor: 'counterMod', divisor: 5, remainder: 0 },
      then: ['super'],
      else: ['dash'],
      label: 'count divides by 5',
    } as Conditional,
  ],
  else: [
    {
      kind: 'conditional',
      predicate: { sensor: 'counterMod', divisor: 5, remainder: 0 },
      then: ['shield'],
      else: ['hold'],
      label: 'count divides by 5',
    } as Conditional,
  ],
  label: 'count divides by 3',
})

export const lesson6: Lesson = {
  id: 'lesson-6-challenges',
  version: 1,
  title: 'Challenges',
  subtitle: 'Famous coding-interview puzzles, rebuilt for your explorer.',
  sequence: 6,
  skillIds: ['conditionals', 'loops', 'planning'],
  award: {
    id: 'algorithm-ace',
    title: 'Algorithm Ace',
    blurb: 'Cracked FizzBuzz with nested Ifs, multiplied steps with nested loops, and ran a real binary search — true algorithm thinking.',
    rarity: 'rare' as const,
  },
  steps: [
    {
      id: 'c7-intro',
      type: 'concept',
      title: 'Real algorithms',
      body: 'Three puzzles real programmers know. Take on **FizzBuzz** as a beat-dodging game, **multiply your steps** to reach faraway treasure, and run a real **binary search** to track down a hidden number. Crack all three to earn your **Algorithm Ace** badge.',
    },
    {
      id: 'c7-fizzbuzz-intro',
      type: 'concept',
      title: 'Dodge the beat',
      body: 'Rico faces the beat. The count ticks 0, 1, 2, 3, 4… and a beat flies at him each tick.\n\nThree beats are special:\nwhen the count **divides by 3**, Rico must **Dash**\nwhen the count **divides by 5**, Rico must **Shield**\nevery other beat, he just **Holds**\n\nThe twist: on a beat like **0** or **15**, the count divides by 3 **and** 5 at once — that needs a single **Super** move, not a Dash or a Shield.\n\nHere is the catch: checking "divides by 3?" and "divides by 5?" side by side misses those double beats. Programmers call this puzzle **FizzBuzz** — the double beat is the part that trips everyone up. Can you arrange your checks so that every beat ends up with exactly one action?',
    },
    {
      id: 'c7-fizzbuzz',
      type: 'beat',
      goal: 'FizzBuzz',
      prompt: 'Beats fly in on the count 0, 1, 2, 3… Divides by 3 → Dash, divides by 5 → Shield, the rare both-beat needs a Super, otherwise Hold. Give every one of the 16 beats the right action — and do not let the both-beat slip through as a plain Dash or Shield.',
      count: 16,
      rules: [
        { predicate: { sensor: 'counterMod', divisor: 15, remainder: 0 }, action: 'super' },
        { predicate: { sensor: 'counterMod', divisor: 3, remainder: 0 }, action: 'dash' },
        { predicate: { sensor: 'counterMod', divisor: 5, remainder: 0 }, action: 'shield' },
      ],
      defaultAction: 'hold',
      availableActions: ['dash', 'shield', 'super', 'hold'],
      blocks: ['loop', 'if'],
      predicateOptions: [divBy3, divBy5],
      loopRange: { min: 1, max: 16 },
      cardLimits: { dash: 1, shield: 1, super: 1, hold: 1 },
      actionMeta: {
        dash: { label: 'Dash', color: '#c9a227' },
        shield: { label: 'Shield', color: '#3d9e5f' },
        super: { label: 'Super', color: '#7a5cff' },
        hold: { label: 'Hold', color: '#5b6472' },
      },
      solution: [repeat(16, [fizzBuzzBeat()], 'Repeat 16×')],
      feedback: {
        correct: 'Nested If blocks caught the both-beats — that is FizzBuzz, solved with logic, not luck.',
        hints: [
          'Beat 0 divides by BOTH 3 and 5 — that is the case a flat plan gets wrong.',
          'Let one If ask its question inside a branch of the other, so the both-beat gets its own Super.',
          'Set the Repeat to 16 so every beat from 0 to 15 is covered.',
        ],
      },
    },
    {
      id: 'c7-sweep',
      type: 'conditional',
      requiresConditional: false,
      goal: 'Multiply your steps',
      prompt: 'The treasure is 8 steps to the right — but you get only ONE Right card and your Repeat can count no higher than 5. Find a way to stretch that single card into all 8 steps.',
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
      goal: 'Build the staircase',
      prompt: 'Climb to the top-right corner. Each stair is one step Up then three steps Right — and the whole staircase repeats. You get only ONE Up card and ONE Right card, so build the whole climb out of that one repeating stair.',
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
