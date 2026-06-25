import type { Conditional, Instruction, Lesson, Loop, While } from '../../types'

// If a wall is on the right, climb over it; otherwise just step right.
const hopRight = (): Conditional => ({
  kind: 'conditional',
  predicate: { sensor: 'blocked', dir: 'right' },
  then: ['up', 'right', 'right', 'down'],
  else: ['right'],
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

const loopRange = { min: 1, max: 9 }

export const lesson2: Lesson = {
  id: 'lesson-4-if-else',
  version: 5,
  title: 'If / Else',
  subtitle: 'Sense the world and let the explorer choose its own path.',
  sequence: 4,
  skillIds: ['conditionals', 'planning'],
  steps: [
    {
      id: 'l2-intro',
      type: 'concept',
      title: 'Let the explorer decide',
      body: 'An **if / else** block senses something right now — a wall, a gem — and picks a path. Put it **inside a loop** and that choice repeats every step, so the explorer can handle a world it cannot predict.',
    },
    {
      id: 'l2-q1',
      type: 'conditional',
      goal: 'Through the gauntlet',
      prompt: 'Rocks block the corridor — and next time they could sit anywhere. Teach the explorer one rule that handles a rock wherever it appears, and reach the treasure.',
      map: {
        rows: 2,
        cols: 8,
        start: { row: 1, col: 0 },
        goal: { row: 1, col: 7 },
        obstacles: [{ row: 1, col: 2 }, { row: 1, col: 5 }],
      },
      availableCommands: ['right', 'up', 'down'],
      blocks: ['loop', 'if'],
      predicateOptions: [
        { predicate: { sensor: 'blocked', dir: 'right' }, label: 'wall on the right' },
      ],
      loopRange,
      cardLimits: { right: 3, up: 1, down: 1 },
      initialProgram: [
        {
          kind: 'loop',
          count: 1,
          body: [
            {
              kind: 'conditional',
              predicate: { sensor: 'blocked', dir: 'right' },
              then: [],
              else: [],
              label: 'wall on the right',
            } as Instruction,
          ],
          label: 'Repeat 1×',
        } as Loop,
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
      goal: 'Flip the switch',
      prompt: 'A sliding gate blocks the corridor, and the switch above it slides the gate open. Find your way past the gate to the treasure.',
      map: {
        rows: 2,
        cols: 5,
        start: { row: 1, col: 0 },
        goal: { row: 1, col: 4 },
        gates: [{ id: 'g1', at: { row: 1, col: 2 }, open: false }],
        plates: [{ at: { row: 0, col: 2 }, gateId: 'g1', mode: 'open' }],
      },
      availableCommands: ['right', 'up', 'down'],
      blocks: ['loop', 'if'],
      predicateOptions: [
        { predicate: { sensor: 'blocked', dir: 'right' }, label: 'wall on the right' },
      ],
      loopRange,
      cardLimits: { right: 2, up: 1, down: 1 },
      initialProgram: [
        {
          kind: 'loop',
          count: 1,
          body: [
            {
              kind: 'conditional',
              predicate: { sensor: 'blocked', dir: 'right' },
              then: [],
              else: [],
              label: 'wall on the right',
            } as Instruction,
          ],
          label: 'Repeat 1×',
        } as Loop,
      ],
      solution: [
        {
          kind: 'loop',
          count: 4,
          body: [
            {
              kind: 'conditional',
              predicate: { sensor: 'blocked', dir: 'right' },
              then: ['up', 'right', 'down'],
              else: ['right'],
              label: 'wall on the right',
            } as Conditional,
          ],
          label: 'Repeat 4×',
        } as Loop,
      ],
      feedback: {
        correct: 'The If detoured over the switch the moment it met the gate — then strolled through the open way.',
        hints: [
          'When the gate blocks the way right, detour up over it — the switch waiting up there slides the gate open as you pass; when the way is clear, just step ahead.',
          'Count how many times the If block has to run to carry you from start to goal — that is your Repeat number.',
        ],
      },
    },
    {
      id: 'l2-q3',
      type: 'conditional',
      goal: 'Staircase run',
      // Map: 4×5 with an UNEVEN staircase (run lengths 1, 2, 1) so no fixed
      // pattern works — the explorer must sense right-vs-up at every step.
      // Walls at (3,2),(2,4). Path: R(3,1) U(2,1) R(2,2) R(2,3) U(1,3) R(1,4) U(0,4)=goal.
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
      cardLimits: { right: 1, up: 1 },
      initialProgram: [
        {
          kind: 'while',
          predicate: { sensor: 'clear', dir: 'up' },
          body: [],
          label: 'Up is clear',
        } as Instruction,
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
      goal: 'Long staircase',
      // 5×6 map, start (4,0), goal (0,5). UNEVEN steps (runs 2,0,1,2 with a
      // double-up) so only sense-and-step works, never a fixed repeat.
      // Walls at (4,3),(3,3),(2,4).
      // Path: R(4,1) R(4,2) U(3,2) U(2,2) R(2,3) U(1,3) R(1,4) R(1,5) U(0,5)=goal.
      prompt: 'A longer, more jagged staircase — some steps are tall, some are wide. Let the explorer feel each one: Right when it can, Up when a wall is in the way.',
      map: {
        rows: 5,
        cols: 6,
        start: { row: 4, col: 0 },
        goal: { row: 0, col: 5 },
        obstacles: [{ row: 4, col: 3 }, { row: 3, col: 3 }, { row: 2, col: 4 }],
      },
      availableCommands: ['right', 'up'],
      blocks: ['while', 'if'],
      predicateOptions: [
        { predicate: { sensor: 'clear', dir: 'up' }, label: 'Up is clear' },
        { predicate: { sensor: 'clear', dir: 'right' }, label: 'Right is clear' },
      ],
      cardLimits: { right: 1, up: 1 },
      initialProgram: [
        {
          kind: 'while',
          predicate: { sensor: 'clear', dir: 'up' },
          body: [],
          label: 'Up is clear',
        } as Instruction,
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
        correct: 'Longer staircase, same rule — right when clear, up when not. The loop handled every step.',
        hints: [
          'The While keeps running while up is clear. The If inside decides right or up each step.',
          'Match each branch to the rule in the goal: one direction when the way is clear, the other when it is blocked.',
        ],
      },
    },
    {
      id: 'l2-q5',
      type: 'conditional',
      goal: 'Two switches',
      prompt: 'Two sliding gates now block the way, each with its own switch above. Get past both gates to the treasure — one rule should handle them all.',
      map: {
        rows: 2,
        cols: 7,
        start: { row: 1, col: 0 },
        goal: { row: 1, col: 6 },
        gates: [
          { id: 'g1', at: { row: 1, col: 2 }, open: false },
          { id: 'g2', at: { row: 1, col: 4 }, open: false },
        ],
        plates: [
          { at: { row: 0, col: 2 }, gateId: 'g1', mode: 'open' },
          { at: { row: 0, col: 4 }, gateId: 'g2', mode: 'open' },
        ],
      },
      availableCommands: ['right', 'up', 'down'],
      blocks: ['loop', 'if'],
      predicateOptions: [
        { predicate: { sensor: 'blocked', dir: 'right' }, label: 'wall on the right' },
      ],
      loopRange,
      cardLimits: { right: 2, up: 1, down: 1 },
      initialProgram: [
        {
          kind: 'loop',
          count: 1,
          body: [
            {
              kind: 'conditional',
              predicate: { sensor: 'blocked', dir: 'right' },
              then: [],
              else: [],
              label: 'wall on the right',
            } as Instruction,
          ],
          label: 'Repeat 1×',
        } as Loop,
      ],
      solution: [
        {
          kind: 'loop',
          count: 6,
          body: [
            {
              kind: 'conditional',
              predicate: { sensor: 'blocked', dir: 'right' },
              then: ['up', 'right', 'down'],
              else: ['right'],
              label: 'wall on the right',
            } as Conditional,
          ],
          label: 'Repeat 6×',
        } as Loop,
      ],
      feedback: {
        correct: 'One If block, two gates — the loop opened each switch in turn and walked you through.',
        hints: [
          'It is the exact same over-the-gate detour as the single-gate puzzle, just repeated more times.',
          'Reuse that same detour rule, then count how many If-block runs it takes to reach the goal for your Repeat number.',
        ],
      },
    },
  ],
}
