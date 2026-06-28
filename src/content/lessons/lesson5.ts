import type { Conditional, Instruction, Lesson, PredicateOption } from '../../types'

type Dir = 'right' | 'up' | 'left' | 'down'
const cap = (dir: Dir) => `${dir[0].toUpperCase()}${dir.slice(1)}`

// Run `body` while `dir` is clear. Pass a custom body to nest blocks inside.
const whileClear = (dir: Dir, body?: Instruction[]): Instruction => ({
  kind: 'while',
  predicate: { sensor: 'clear', dir },
  body: body ?? [dir],
  label: `${cap(dir)} is clear`,
})

// Run a fixed-count loop. Accepts any Instruction[] as body.
const repeat = (count: number, body: Instruction[]): Instruction => ({
  kind: 'loop',
  count,
  body,
  label: `Repeat ${count}×`,
})

const hopRight = (): Conditional => ({
  kind: 'conditional',
  predicate: { sensor: 'blocked', dir: 'right' },
  then: ['up', 'right', 'right', 'down'],
  else: ['right'],
  label: 'wall on the right',
})

const predicateOptions: PredicateOption[] = [
  { predicate: { sensor: 'clear', dir: 'right' }, label: 'Right is clear' },
  { predicate: { sensor: 'clear', dir: 'up' }, label: 'Up is clear' },
  { predicate: { sensor: 'clear', dir: 'left' }, label: 'Left is clear' },
  { predicate: { sensor: 'clear', dir: 'down' }, label: 'Down is clear' },
  { predicate: { sensor: 'blocked', dir: 'right' }, label: 'wall on the right' },
  { predicate: { sensor: 'blocked', dir: 'up' }, label: 'wall above' },
]

const wallOptions: PredicateOption[] = [
  { predicate: { sensor: 'blocked', dir: 'right' }, label: 'wall on the right' },
  { predicate: { sensor: 'blocked', dir: 'up' }, label: 'wall above' },
]

const loopRange = { min: 1, max: 8 }

export const lesson5: Lesson = {
  id: 'lesson-5-final-challenge',
  version: 4,
  title: 'All Together Now',
  subtitle: 'Practice mixing every tool — bigger challenges are still ahead.',
  sequence: 5,
  skillIds: ['conditionals', 'loops', 'planning'],
  award: {
    id: 'combo-coder',
    title: 'Combo Coder',
    blurb: 'Mixed Repeat, While, and If / else together across five tough routes.',
    rarity: 'uncommon' as const,
  },
  steps: [
    {
      id: 'l5-intro',
      type: 'concept',
      title: 'The toolbox',
      body: 'Three tools, one toolbox: **Repeat**, **While**, and **If / else**. Pick the right one for each part of the route to earn your **Combo Coder** badge!',
    },
    {
      id: 'l5-q1',
      type: 'conditional',
      requiresConditional: false,
      goal: 'Run, hop, run',
      prompt: 'Two rocks sit in a long corridor, and you have only a handful of Right cards — far too few to walk it by hand. Get past every rock to the treasure.',
      map: {
        rows: 2,
        cols: 9,
        start: { row: 1, col: 0 },
        goal: { row: 1, col: 8 },
        obstacles: [{ row: 1, col: 3 }, { row: 1, col: 6 }],
      },
      availableCommands: ['right', 'up', 'down'],
      blocks: ['loop', 'if'],
      predicateOptions: wallOptions,
      loopRange,
      cardLimits: { right: 3, up: 1, down: 1 },
      solution: [
        {
          kind: 'loop',
          count: 6,
          body: [hopRight()],
          label: 'Repeat 6× → hop over any rock',
        } as Instruction,
      ],
      feedback: {
        correct: 'One If block hopped both rocks and stepped through the gaps — the Repeat ran it the whole way.',
        hints: [
          'Teach one rule that climbs over a wall when it meets one, and just steps ahead when the way is clear.',
          'Count how many If-block runs carry you from start to goal — that is your Repeat number.',
        ],
      },
    },
    {
      id: 'l5-q2',
      type: 'conditional',
      requiresConditional: false,
      goal: 'Grab the key, open the door',
      prompt: 'A locked door blocks the path up. The key is somewhere in the bottom row — grab it first, then reach the treasure.',
      map: {
        rows: 5,
        cols: 6,
        start: { row: 4, col: 0 },
        goal: { row: 0, col: 3 },
        keys: [{ row: 4, col: 4 }],
        doors: [{ row: 2, col: 3 }],
      },
      availableCommands: ['right', 'left', 'up'],
      blocks: ['while', 'loop', 'if'],
      predicateOptions,
      loopRange,
      cardLimits: { right: 1, up: 1, left: 1 },
      solution: [repeat(4, ['right']), 'left', whileClear('up')],
      feedback: {
        correct: 'Key grabbed, door opened, While block to the top — sharp planning.',
        hints: [
          'The door stays locked until you are carrying a key.',
          'Fetch the key first, line yourself up under the door\'s column, then climb once it reads clear.',
        ],
      },
    },
    {
      id: 'l5-q3',
      type: 'conditional',
      requiresConditional: false,
      goal: 'Open the gate, then run',
      prompt: 'A sliding gate blocks the long corridor, and its switch sits up and to the side. Open the gate and reach the treasure — there are too few Right cards to walk it by hand.',
      map: {
        rows: 2,
        cols: 7,
        start: { row: 1, col: 0 },
        goal: { row: 1, col: 6 },
        gates: [{ id: 'g1', at: { row: 1, col: 3 }, open: false }],
        plates: [{ at: { row: 0, col: 1 }, gateId: 'g1', mode: 'open' }],
      },
      availableCommands: ['right', 'up', 'down'],
      blocks: ['while', 'loop', 'if'],
      predicateOptions: [
        { predicate: { sensor: 'clear', dir: 'right' }, label: 'Right is clear' },
      ],
      cardLimits: { right: 2, up: 1, down: 1 },
      solution: [
        'up',
        'right',
        'down',
        whileClear('right'),
      ],
      feedback: {
        correct: 'One step on the switch reshaped the corridor — then the While loop ran the whole way through.',
        hints: [
          'The switch sits up off the corridor — detour up onto it and back down to slide the gate open behind you.',
          'With the corridor open, one While loop can run the rest of the way to the treasure.',
        ],
      },
    },
    {
      id: 'l5-q4',
      type: 'conditional',
      requiresConditional: false,
      goal: 'Gauntlet run',
      prompt: 'Three rocks guard the corridor, and you have too few Right cards to walk it by hand. Get past them all to the treasure.',
      map: {
        rows: 2,
        cols: 11,
        start: { row: 1, col: 0 },
        goal: { row: 1, col: 10 },
        obstacles: [{ row: 1, col: 2 }, { row: 1, col: 5 }, { row: 1, col: 8 }],
      },
      availableCommands: ['right', 'up', 'down'],
      blocks: ['loop', 'if'],
      predicateOptions: wallOptions,
      loopRange: { min: 1, max: 15 },
      cardLimits: { right: 3, up: 1, down: 1 },
      solution: [
        {
          kind: 'loop',
          count: 7,
          body: [hopRight()],
          label: 'Repeat 7× → hop over any rock',
        } as Instruction,
      ],
      feedback: {
        correct: 'Three hops, four steps — a Repeat with an If handled them all.',
        hints: [
          'Count how many If-block executions you need from start to goal.',
          'Each hop moves you two tiles (over the rock); each else moves one tile.',
        ],
      },
    },
    {
      id: 'l5-q5',
      type: 'conditional',
      requiresConditional: false,
      goal: 'The Combo Coder run',
      prompt: 'A tough mix: two rocks guard the way to the gem, and the Right cards are too few to walk it by hand. Get past them, grab the gem, and carry it up to the treasure. Clear it to earn your **Combo Coder** badge.',
      map: {
        rows: 5,
        cols: 9,
        start: { row: 4, col: 0 },
        goal: { row: 0, col: 8 },
        obstacles: [{ row: 4, col: 2 }, { row: 4, col: 5 }],
        tasks: [{ from: { row: 4, col: 8 }, to: { row: 0, col: 8 }, label: 'the gem' }],
      },
      availableCommands: ['right', 'up', 'down'],
      availableActions: ['pickup', 'drop'],
      blocks: ['while', 'if', 'loop'],
      predicateOptions,
      loopRange,
      cardLimits: { right: 3, up: 2, down: 1 },
      solution: [
        repeat(6, [hopRight()]),
        'pickup',
        whileClear('up'),
        'drop',
      ],
      feedback: {
        correct: 'Repeat + If hopped the rocks, While carried the gem to the top — every tool in one program. You are a Combo Coder!',
        hints: [
          'Reuse the hop-the-wall rule inside a Repeat to clear the rocks on the way to the gem.',
          'Once you reach the gem, Pick up, let a While carry it straight up to the flag, then Drop.',
        ],
      },
    },
  ],
}
