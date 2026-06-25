import type { Instruction, Lesson, PredicateOption } from '../../types'

type Dir = 'right' | 'up' | 'left' | 'down'
const cap = (dir: Dir) => `${dir[0].toUpperCase()}${dir.slice(1)}`
const whileClear = (dir: Dir): Instruction => ({
  kind: 'while',
  predicate: { sensor: 'clear', dir },
  body: [dir],
  label: `${cap(dir)} is clear`,
})

// Empty While scaffold for initialProgram (body filled by the learner).
const emptyWhile = (dir: Dir): Instruction => ({
  kind: 'while',
  predicate: { sensor: 'clear', dir },
  body: [],
  label: `${cap(dir)} is clear`,
})

// Per-puzzle predicate option sets — only directions relevant to the puzzle.
const rightOnly: PredicateOption[] = [
  { predicate: { sensor: 'clear', dir: 'right' }, label: 'Right is clear' },
]
const rightUp: PredicateOption[] = [
  { predicate: { sensor: 'clear', dir: 'right' }, label: 'Right is clear' },
  { predicate: { sensor: 'clear', dir: 'up' }, label: 'Up is clear' },
]
const rightUpDown: PredicateOption[] = [
  { predicate: { sensor: 'clear', dir: 'right' }, label: 'Right is clear' },
  { predicate: { sensor: 'clear', dir: 'up' }, label: 'Up is clear' },
  { predicate: { sensor: 'clear', dir: 'down' }, label: 'Down is clear' },
]
const rightUpLeft: PredicateOption[] = [
  { predicate: { sensor: 'clear', dir: 'right' }, label: 'Right is clear' },
  { predicate: { sensor: 'clear', dir: 'up' }, label: 'Up is clear' },
  { predicate: { sensor: 'clear', dir: 'left' }, label: 'Left is clear' },
]

export const lesson4: Lesson = {
  id: 'lesson-3-while-loops',
  version: 5,
  title: 'While Loops',
  subtitle: 'Keep going until something stops you — no counting needed.',
  sequence: 3,
  skillIds: ['loops', 'planning'],
  steps: [
    {
      id: 'l4-intro',
      type: 'concept',
      title: 'Repeat until blocked',
      body: 'A **while-loop** keeps repeating **as long as a condition is true**.\n\nDrag a **While** block in, pick its condition (like "Right is clear"), then drag a move inside. It moves again and again until a wall or the edge blocks the way — then it stops on its own.\n\nThere are **no Repeat blocks here**, and you only get one of each move card. The corridors are too long to walk by hand — the While block is the only way through. (If a loop could never stop, the run fails — so the condition has to be able to become false.)',
    },
    {
      id: 'l4-q1',
      type: 'sequence',
      goal: 'Run to the wall',
      prompt: 'The corridor is too long to count, and you have a single Right card. Reach the treasure at the far wall.',
      map: { rows: 1, cols: 7, start: { row: 0, col: 0 }, goal: { row: 0, col: 6 } },
      availableCommands: ['right'],
      blocks: ['while'],
      predicateOptions: rightOnly,
      cardLimits: { right: 1 },
      successRule: 'reachGoal',
      initialProgram: [emptyWhile('right')],
      solution: [whileClear('right')],
      feedback: {
        correct: 'One while-loop ran all the way to the edge — no counting at all.',
        hints: [
          'You only have one Right card, so walking tile-by-tile is out — the While has to do the repeating.',
          'Drop your move inside the While so it keeps repeating while the path stays clear.',
        ],
      },
    },
    {
      id: 'l4-q2',
      type: 'sequence',
      goal: 'Run, then climb',
      prompt: 'Race across the floor and climb the wall to the treasure — both distances are unknown, so there is nothing to count.',
      map: { rows: 6, cols: 6, start: { row: 5, col: 0 }, goal: { row: 0, col: 5 } },
      availableCommands: ['right', 'up'],
      blocks: ['while'],
      predicateOptions: rightUp,
      cardLimits: { right: 1, up: 1 },
      successRule: 'reachGoal',
      initialProgram: [emptyWhile('right'), emptyWhile('up')],
      solution: [whileClear('right'), whileClear('up')],
      feedback: {
        correct: 'Across to the wall, then up to the wall — two loops, zero counting.',
        hints: [
          'Two unknown distances means two While loops — one for the run across, one for the climb.',
          'Give each While the move that matches its direction, and let each loop stop itself at the wall.',
        ],
      },
    },
    {
      id: 'l4-q3',
      type: 'sequence',
      goal: 'Serpentine slide',
      prompt: 'The floor is slippery ice — once you start sliding you do not stop until a wall or edge catches you. The treasure sits straight above your start, but the ice winds there in an S. Find your way up.',
      map: {
        rows: 3,
        cols: 6,
        start: { row: 2, col: 0 },
        goal: { row: 0, col: 0 },
        obstacles: [{ row: 2, col: 5 }],
        ice: [
          { row: 2, col: 1 },
          { row: 2, col: 2 },
          { row: 2, col: 3 },
          { row: 2, col: 4 },
          { row: 1, col: 1 },
          { row: 1, col: 2 },
          { row: 1, col: 3 },
        ],
      },
      availableCommands: ['right', 'up', 'left'],
      blocks: ['while'],
      predicateOptions: rightUpLeft,
      cardLimits: { right: 1, left: 1, up: 2 },
      successRule: 'reachGoal',
      initialProgram: [emptyWhile('right'), emptyWhile('left')],
      solution: [whileClear('right'), 'up', whileClear('left'), 'up'],
      feedback: {
        correct: 'Slide right, step up, slide back left, step up — an S-shaped run, no counting anywhere.',
        hints: [
          'A While loop slides you until something blocks it; a single move steps you off the ice to switch lanes.',
          'Picture the S: a long slide one way, a step up to the next lane, the long slide back, and a final step up.',
        ],
      },
    },
    {
      id: 'l4-q4',
      type: 'sequence',
      goal: 'Key, door, then run',
      prompt: 'A locked door blocks the corridor. Grab the key hiding just off the path, then make your way through to the treasure.',
      map: {
        rows: 2,
        cols: 6,
        start: { row: 1, col: 0 },
        goal: { row: 1, col: 5 },
        obstacles: [
          { row: 0, col: 1 },
          { row: 0, col: 2 },
          { row: 0, col: 3 },
          { row: 0, col: 4 },
          { row: 0, col: 5 },
        ],
        keys: [{ row: 0, col: 0 }],
        doors: [{ row: 1, col: 3 }],
      },
      availableCommands: ['up', 'down', 'right'],
      blocks: ['while'],
      predicateOptions: rightUpDown,
      cardLimits: { right: 1, up: 1, down: 1 },
      successRule: 'reachGoal',
      initialProgram: [emptyWhile('right')],
      solution: ['up', 'down', whileClear('right')],
      feedback: {
        correct: 'Key grabbed, then one While block ran straight through the door — slick.',
        hints: [
          'The key sits just off the corridor — a quick step off the path and back grabs it before you set off.',
          'Once you are holding the key the locked door reads as clear, so a single While can run straight through.',
        ],
      },
    },
    {
      id: 'l4-q5',
      type: 'sequence',
      goal: 'The grand delivery',
      prompt: 'Run to the gem, carry it up to its flag, drop it, then run on to the treasure. Build the While blocks yourself this time — and choose each one\'s condition.',
      map: {
        rows: 4,
        cols: 5,
        start: { row: 3, col: 0 },
        goal: { row: 0, col: 4 },
        obstacles: [{ row: 3, col: 4 }],
        tasks: [{ from: { row: 3, col: 3 }, to: { row: 0, col: 3 }, label: 'the gem' }],
      },
      availableCommands: ['right', 'up'],
      availableActions: ['pickup', 'drop'],
      blocks: ['while'],
      predicateOptions: rightUp,
      cardLimits: { right: 2, up: 1 },
      successRule: 'reachGoal',
      solution: [whileClear('right'), 'pickup', whileClear('up'), 'drop', whileClear('right')],
      feedback: {
        correct: 'Three while-loops, one cargo run, no counting anywhere — you have mastered while!',
        hints: [
          'Each leg runs until a wall stops it, so a separate While carries you to the gem, up to the flag, and on to the treasure.',
          'Slot a Pick up where the gem leg ends and a Drop where the climb ends, and match each While\'s condition to its direction.',
        ],
      },
    },
  ],
}
