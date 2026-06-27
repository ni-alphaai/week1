import type { Conditional, Lesson, Loop, PredicateOption, While } from '../../types'
import { emptyConditional, emptyWhile, loopWithEmptyIf, whileWithEmptyIf } from '../scaffolds'

// If a wall is on the right, climb over it; otherwise just step right.
const hopRight = (): Conditional => ({
  kind: 'conditional',
  predicate: { sensor: 'blocked', dir: 'right' },
  then: ['up', 'right', 'right', 'down'],
  else: ['right'],
  label: 'wall on the right',
})

// One-time hop over a single rock — used before a While, not inside a Repeat.
const hopOnce = (): Conditional => ({
  kind: 'conditional',
  predicate: { sensor: 'blocked', dir: 'right' },
  then: ['up', 'right', 'right', 'down'],
  else: [],
  label: 'wall on the right',
})

// If right is clear go right, otherwise go up — staircase navigation.
const stairStep = (): Conditional => ({
  kind: 'conditional',
  predicate: { sensor: 'clear', dir: 'right' },
  then: ['right'],
  else: ['up'],
  label: 'Right is clear',
})

// Grab a gem the moment you step on it; otherwise keep marching.
const grabOrMarch = (): Conditional => ({
  kind: 'conditional',
  predicate: { sensor: 'atGem' },
  then: ['pickup'],
  else: ['right'],
  label: 'standing on a gem',
})

// A pillar blocks the climb — sidestep right, then keep going up.
const climbAround = (): Conditional => ({
  kind: 'conditional',
  predicate: { sensor: 'blocked', dir: 'up' },
  then: ['right'],
  else: ['up'],
  label: 'wall above',
})

const loopRange = { min: 1, max: 9 }
const wallOnRight: PredicateOption[] = [{ predicate: { sensor: 'blocked', dir: 'right' }, label: 'wall on the right' }]
const clearRight: PredicateOption[] = [{ predicate: { sensor: 'clear', dir: 'right' }, label: 'Right is clear' }]
const atGemOption: PredicateOption[] = [{ predicate: { sensor: 'atGem' }, label: 'standing on a gem' }]
const wallAbove: PredicateOption[] = [{ predicate: { sensor: 'blocked', dir: 'up' }, label: 'wall above' }]

export const lesson2: Lesson = {
  id: 'lesson-4-if-else',
  version: 8,
  title: 'If / Else',
  subtitle: 'Sense the world and let the explorer choose its own path.',
  sequence: 4,
  skillIds: ['conditionals', 'planning'],
  steps: [
    {
      id: 'l2-intro',
      type: 'concept',
      title: 'Let the explorer decide',
      body: 'An **if / else** block senses something right now — a wall, a gem — and picks a path. Put it **inside a loop** and that choice repeats every step, so the explorer can handle a world it cannot predict.\n\nEach puzzle uses a **different program shape**: a repeating rule, a one-shot choice, a while-loop combo, or a gem pickup.',
    },
    {
      id: 'l2-q1',
      type: 'conditional',
      requiresConditional: true,
      goal: 'Through the gauntlet',
      prompt: 'Rocks block the corridor — and next time they could sit anywhere. Teach the explorer one rule that hops over a rock when it meets one, and reach the treasure.',
      map: {
        rows: 2,
        cols: 8,
        start: { row: 1, col: 0 },
        goal: { row: 1, col: 7 },
        obstacles: [{ row: 1, col: 2 }, { row: 1, col: 5 }],
      },
      availableCommands: ['right', 'up', 'down'],
      blocks: ['loop', 'if'],
      predicateOptions: wallOnRight,
      loopRange,
      cardLimits: { right: 3, up: 1, down: 1 },
      initialProgram: [
        loopWithEmptyIf(1, { sensor: 'blocked', dir: 'right' }, 'wall on the right'),
      ],
      solution: [
        {
          kind: 'loop',
          count: 5,
          body: [hopRight()],
          label: 'Repeat 5×',
        } as Loop,
      ],
      feedback: {
        correct: 'The If block hopped every rock it met — and the Repeat ran it all the way through.',
        hints: [
          'When a wall is on the right, the explorer needs to climb over it instead of walking into it; when the way is clear, it can just step ahead.',
          'Count how many times the If block has to run to carry you from start to goal — that is your Repeat number.',
        ],
      },
    },
    {
      id: 'l2-q2',
      type: 'conditional',
      requiresConditional: true,
      goal: 'Collect on contact',
      prompt: 'A gem sits in the corridor and the treasure is at the far end. You only get one Pick up card — teach the explorer to grab the gem the instant it steps on it, then march on and deliver it.',
      map: {
        rows: 2,
        cols: 8,
        start: { row: 1, col: 0 },
        goal: { row: 1, col: 7 },
        tasks: [{ from: { row: 1, col: 3 }, to: { row: 1, col: 7 }, label: 'the gem' }],
      },
      availableCommands: ['right'],
      availableActions: ['pickup', 'drop'],
      blocks: ['loop', 'if'],
      predicateOptions: atGemOption,
      loopRange,
      cardLimits: { right: 1, pickup: 1, drop: 1 },
      initialProgram: [
        loopWithEmptyIf(1, { sensor: 'atGem' }, 'standing on a gem'),
      ],
      solution: [
        {
          kind: 'loop',
          count: 8,
          body: [grabOrMarch()],
          label: 'Repeat 8×',
        } as Loop,
        'drop',
      ],
      feedback: {
        correct: 'Standing on a gem? Pick it up. Path clear? March on. One rule handled the whole delivery.',
        hints: [
          'The If should check whether the explorer is standing on the gem right now — not whether one is nearby.',
          'After the loop reaches the drop-off tile, play Drop once to finish the job.',
        ],
      },
    },
    {
      id: 'l2-q3',
      type: 'conditional',
      requiresConditional: true,
      goal: 'Staircase run',
      prompt: 'The steps of this staircase are uneven, so a fixed pattern will not work — the explorer has to feel its way. Build a rule that steps Right when the path ahead is open and Up when a wall blocks it.',
      map: {
        rows: 4,
        cols: 5,
        start: { row: 3, col: 0 },
        goal: { row: 0, col: 4 },
        obstacles: [{ row: 3, col: 2 }, { row: 2, col: 4 }],
      },
      availableCommands: ['right', 'up'],
      blocks: ['while', 'if'],
      predicateOptions: [
        { predicate: { sensor: 'clear', dir: 'up' }, label: 'Up is clear' },
        { predicate: { sensor: 'clear', dir: 'right' }, label: 'Right is clear' },
      ],
      cardLimits: { right: 1, up: 1, while: 1, if: 1 },
      initialProgram: [
        whileWithEmptyIf(
          { sensor: 'clear', dir: 'up' },
          'Up is clear',
          { sensor: 'clear', dir: 'right' },
          'Right is clear',
        ),
      ],
      solution: [
        {
          kind: 'while',
          predicate: { sensor: 'clear', dir: 'up' },
          body: [stairStep()],
          label: 'Up is clear',
        } as While,
      ],
      feedback: {
        correct: 'The If turned right on open paths and climbed at every wall — the loop steered itself up the staircase.',
        hints: [
          'The While keeps running while up is clear. The If inside decides which direction each step.',
          'Wire the If so the open path and the blocked path each send the explorer the way the goal describes.',
        ],
      },
    },
    {
      id: 'l2-debug',
      type: 'conditional',
      requiresConditional: true,
      goal: 'Debug: spot the swap',
      prompt: 'This staircase climber looks right, but the two branches of the If are swapped — so it climbs straight up the wall and never reaches the treasure. Read it, then swap the branches so it steps Right when the path is clear and Up when it is blocked.',
      map: {
        rows: 4,
        cols: 5,
        start: { row: 3, col: 0 },
        goal: { row: 0, col: 4 },
        obstacles: [{ row: 3, col: 2 }, { row: 2, col: 4 }],
      },
      availableCommands: ['right', 'up'],
      blocks: ['while', 'if'],
      predicateOptions: [
        { predicate: { sensor: 'clear', dir: 'up' }, label: 'Up is clear' },
        { predicate: { sensor: 'clear', dir: 'right' }, label: 'Right is clear' },
      ],
      cardLimits: { right: 1, up: 1 },
      editableInitial: true,
      initialProgram: [
        {
          kind: 'while',
          predicate: { sensor: 'clear', dir: 'up' },
          body: [
            {
              kind: 'conditional',
              predicate: { sensor: 'clear', dir: 'right' },
              then: ['up'],
              else: ['right'],
              label: 'Right is clear',
            } as Conditional,
          ],
          label: 'Up is clear',
        } as While,
      ],
      solution: [
        {
          kind: 'while',
          predicate: { sensor: 'clear', dir: 'up' },
          body: [stairStep()],
          label: 'Up is clear',
        } as While,
      ],
      feedback: {
        correct: 'Branches un-swapped — Right when open, Up when blocked. The loop climbs the staircase perfectly.',
        hints: [
          'Read what the explorer does when the path ahead is clear — is that really where you want it to go?',
          'The two move cards are sitting in the wrong branches; work out which one belongs in the "clear" case.',
        ],
      },
    },
    {
      id: 'l2-q4',
      type: 'conditional',
      requiresConditional: true,
      goal: 'Hop once, march on',
      prompt: 'One rock blocks the corridor right at the start — hop over it once. After that the path is clear for ages, so let a While loop march the rest of the way.',
      map: {
        rows: 2,
        cols: 10,
        start: { row: 1, col: 0 },
        goal: { row: 1, col: 9 },
        obstacles: [{ row: 1, col: 1 }],
      },
      availableCommands: ['right', 'up', 'down'],
      blocks: ['if', 'while'],
      predicateOptions: [...wallOnRight, ...clearRight],
      cardLimits: { right: 3, up: 1, down: 1, if: 1, while: 1 },
      initialProgram: [
        emptyConditional({ sensor: 'blocked', dir: 'right' }, 'wall on the right'),
        emptyWhile({ sensor: 'clear', dir: 'right' }, 'Right is clear'),
      ],
      solution: [
        hopOnce(),
        {
          kind: 'while',
          predicate: { sensor: 'clear', dir: 'right' },
          body: ['right'],
          label: 'Right is clear',
        } as While,
      ],
      feedback: {
        correct: 'One If for the rock at the door, one While for the long open run — not every problem needs a Repeat.',
        hints: [
          'The first rock only appears once — handle it with a single If block before the march begins.',
          'Once the path ahead stays clear, a While loop can run all the way to the treasure.',
        ],
      },
    },
    {
      id: 'l2-q5',
      type: 'conditional',
      requiresConditional: true,
      goal: 'Pillar climb',
      prompt: 'Pillars jut from the left wall and block the straight climb. When a pillar blocks the way up, sidestep right — otherwise keep climbing.',
      map: {
        rows: 4,
        cols: 4,
        start: { row: 3, col: 0 },
        goal: { row: 0, col: 2 },
        obstacles: [{ row: 1, col: 0 }],
      },
      availableCommands: ['right', 'up'],
      blocks: ['loop', 'if'],
      predicateOptions: wallAbove,
      loopRange,
      cardLimits: { right: 2, up: 2 },
      initialProgram: [
        loopWithEmptyIf(1, { sensor: 'blocked', dir: 'up' }, 'wall above'),
      ],
      solution: [
        {
          kind: 'loop',
          count: 5,
          body: [climbAround()],
          label: 'Repeat 5×',
        } as Loop,
      ],
      feedback: {
        correct: 'Sidestep around the pillar, then keep climbing — the If read the ceiling every step.',
        hints: [
          'This time the sense is "wall above", not "wall on the right".',
          'Count how many If-block runs carry you from start to goal — that is your Repeat number.',
        ],
      },
    },
  ],
}
