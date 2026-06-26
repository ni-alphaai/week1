// Verified AI problem generation. The LLM proposes a puzzle from a template;
// the deterministic engine is the sole authority on whether it is acceptable.
//
// Two concepts are supported:
//   - 'navigation' (default): plain-move mazes. The model proposes only a map;
//     the solver computes the verified solution and true optimal. Unchanged from
//     the Phase 1 MVP so existing content keeps working.
//   - 'loops': concept-teaching loop puzzles. The model proposes the WHOLE puzzle
//     including its own nested solution program, offered blocks, predicate
//     options, and card limits that should force a Repeat. The engine replays the
//     solution, confirms it is legal under the offered cards/limits, proves a flat
//     move-only program would not fit (so a loop is genuinely required), and
//     checks difficulty. Only verified puzzles are returned; on repeated failure
//     it abstains (null) and the caller uses the authored bank.

import type {
  Action,
  BlockKind,
  CardLimits,
  Command,
  Instruction,
  MapConfig,
  Position,
  Predicate,
  PredicateOption,
  StepFeedback,
  Task,
  Teleport,
} from '../types'
import { OPENAI_MODEL, OPENAI_STRONG_MODEL, aiGenerationEnabled } from './config'
import { generateText } from './aiClient'
import { validatePuzzle, validateConceptPuzzle } from '../engine/verify'
import type { Concept, DifficultyBand, DifficultyTarget, LoopPuzzleCandidate } from '../engine/verify'
import { scoreFor } from '../engine/difficulty'

// The concept a template may request. 'mixed' picks one of the block concepts
// at random when generating. Exported so the frontend can type its templates.
export type GenConcept = 'navigation' | 'loops' | 'while' | 'conditionals' | 'mixed'

// The concept stamped on a generated puzzle (always a concrete one — 'mixed'
// has been resolved by generation time).
export type GeneratedConcept = 'navigation' | 'loops' | 'while' | 'conditionals'

export interface PuzzleTemplate {
  rows: number
  cols: number
  availableCommands: Command[]
  /**
   * Target internal difficulty level (3 | 4 | 5). Selects the per-concept
   * complexity profile generation aims for and gates on. Internal only — never
   * shown to the learner.
   */
  targetLevel: number
  /**
   * Optional legacy move-count band. Concept generation now derives its band
   * from the complexity profile; navigation may fall back to this but prefers
   * `profile.moveBand`.
   */
  band?: DifficultyBand
  successRule: 'reachGoal' | 'shortestPath'
  /** Optional flavor for the prompt; never affects verification. */
  theme?: string
  /** Which concept the puzzle should teach. Defaults to 'navigation'. */
  concept?: GenConcept
  /**
   * Compact signatures of recently generated puzzles the model should NOT
   * reproduce, so consecutive practice puzzles do not look identical. Advisory
   * only — never affects verification.
   */
  avoid?: string[]
  /**
   * Real authored puzzles from this lesson, already in the exemplar JSON shape
   * (the same shape as the hardcoded LOOP_EXEMPLAR etc.: {map, availableCommands,
   * blocks, predicateOptions, loopRange, cardLimits, solution, prompt, goal,
   * hints}). Appended to the prompt as additional high-quality worked examples
   * so generated puzzles match the lesson's quality and style. Advisory,
   * prompt-only input — must NEVER affect verification.
   */
  authoredExemplars?: object[]
  /**
   * Full previously-generated puzzles from this session (their complete JSON,
   * e.g. {map, availableCommands, blocks, cardLimits, solution, ...}) that the
   * model must NOT reproduce. Listed in the prompt so the model produces
   * something structurally different. Advisory, prompt-only input — must NEVER
   * affect verification.
   */
  priorGenerated?: object[]
  /**
   * Lesson-specific mechanic instructions (teleports, fetch-and-carry, etc.)
   * derived from authored content. Prompt-only — never affects verification.
   */
  mechanicsGuide?: string[]
}

export interface GeneratedPuzzle {
  map: MapConfig
  availableCommands: Command[]
  availableActions?: Action[]
  blocks?: BlockKind[]
  predicateOptions?: PredicateOption[]
  loopRange?: { min: number; max: number }
  cardLimits?: CardLimits
  solution: Instruction[]
  prompt?: string
  goal?: string
  feedback?: StepFeedback
  optimal: number
  /** Internal structural difficulty score (1..5). Never shown to the learner. */
  difficulty: number
  concept: GeneratedConcept
  aiGenerated: true
}

// ---------------------------------------------------------------------------
// Per-concept complexity profiles. Generation aims a puzzle at a target level
// (3 | 4 | 5) and gates on its internal difficulty score and these structural
// minimums. Level 4 is the default "match authored content" target; level 3 is
// slightly easier and level 5 slightly harder.

export interface ComplexityProfile {
  /** Minimum grid size (applied to both dimensions). */
  minGridSpan: number
  /** Suggested rock count range for the prompt. */
  obstacles: { min: number; max: number }
  /** Executed move-count band the verified solution must land in. */
  moveBand: { minMoves: number; maxMoves: number }
  /** Suggested minimum block count (>=2 loops, two while legs, etc.). */
  minBlocks: number
  /** Require a block nested at least two deep (a loop-with-if). */
  requireNesting: boolean
  /** Require a conditional with a real (non-empty) else branch. */
  requireBranch: boolean
  /** Target card-tightness (placements used / allotted); 0 means no pressure. */
  cardTightness: number
}

type ProfileConcept = GeneratedConcept

const LEVEL_3: Record<ProfileConcept, ComplexityProfile> = {
  navigation: { minGridSpan: 5, obstacles: { min: 1, max: 2 }, moveBand: { minMoves: 5, maxMoves: 8 }, minBlocks: 0, requireNesting: false, requireBranch: false, cardTightness: 0 },
  loops: { minGridSpan: 5, obstacles: { min: 0, max: 1 }, moveBand: { minMoves: 5, maxMoves: 9 }, minBlocks: 1, requireNesting: false, requireBranch: false, cardTightness: 0.8 },
  while: { minGridSpan: 5, obstacles: { min: 0, max: 1 }, moveBand: { minMoves: 6, maxMoves: 12 }, minBlocks: 1, requireNesting: false, requireBranch: false, cardTightness: 0.8 },
  conditionals: { minGridSpan: 5, obstacles: { min: 1, max: 2 }, moveBand: { minMoves: 6, maxMoves: 11 }, minBlocks: 1, requireNesting: false, requireBranch: true, cardTightness: 0.8 },
}

const LEVEL_4: Record<ProfileConcept, ComplexityProfile> = {
  navigation: { minGridSpan: 6, obstacles: { min: 3, max: 4 }, moveBand: { minMoves: 7, maxMoves: 9 }, minBlocks: 0, requireNesting: false, requireBranch: false, cardTightness: 0 },
  loops: { minGridSpan: 5, obstacles: { min: 0, max: 1 }, moveBand: { minMoves: 7, maxMoves: 10 }, minBlocks: 1, requireNesting: false, requireBranch: false, cardTightness: 0.8 },
  while: { minGridSpan: 5, obstacles: { min: 0, max: 2 }, moveBand: { minMoves: 8, maxMoves: 14 }, minBlocks: 1, requireNesting: false, requireBranch: false, cardTightness: 0.8 },
  conditionals: { minGridSpan: 5, obstacles: { min: 1, max: 2 }, moveBand: { minMoves: 7, maxMoves: 12 }, minBlocks: 1, requireNesting: false, requireBranch: true, cardTightness: 0.8 },
}

const LEVEL_5: Record<ProfileConcept, ComplexityProfile> = {
  navigation: { minGridSpan: 7, obstacles: { min: 3, max: 5 }, moveBand: { minMoves: 9, maxMoves: 13 }, minBlocks: 0, requireNesting: false, requireBranch: false, cardTightness: 0 },
  loops: { minGridSpan: 6, obstacles: { min: 1, max: 3 }, moveBand: { minMoves: 8, maxMoves: 16 }, minBlocks: 1, requireNesting: false, requireBranch: false, cardTightness: 0.8 },
  while: { minGridSpan: 6, obstacles: { min: 0, max: 3 }, moveBand: { minMoves: 10, maxMoves: 18 }, minBlocks: 1, requireNesting: false, requireBranch: false, cardTightness: 0.8 },
  conditionals: { minGridSpan: 6, obstacles: { min: 1, max: 3 }, moveBand: { minMoves: 9, maxMoves: 16 }, minBlocks: 2, requireNesting: false, requireBranch: true, cardTightness: 0.8 },
}

const PROFILES: Record<3 | 4 | 5, Record<ProfileConcept, ComplexityProfile>> = {
  3: LEVEL_3,
  4: LEVEL_4,
  5: LEVEL_5,
}

// Resolve a complexity profile for a concept at a target level. `mixed` defaults
// to the loop-with-if (conditionals) shape and prefers nesting. targetLevel is
// clamped to the supported 3..5 range.
export function profileFor(concept: GenConcept, targetLevel: number): ComplexityProfile {
  const level: 3 | 4 | 5 = targetLevel <= 3 ? 3 : targetLevel >= 5 ? 5 : 4
  if (concept === 'mixed') {
    return { ...PROFILES[level].conditionals, requireNesting: true }
  }
  return PROFILES[level][concept]
}

// Build the verifier difficulty gate from a profile + target level. We gate on
// the internal score (the primary lever) plus the unambiguous structural
// minimums; block counts and obstacle counts are folded into the score itself.
function difficultyTargetFrom(profile: ComplexityProfile, targetLevel: number): DifficultyTarget {
  return {
    targetLevel,
    minGridSpan: profile.minGridSpan,
    requireNesting: profile.requireNesting || undefined,
    requireBranch: profile.requireBranch || undefined,
  }
}

// Enlarge a template's grid to the profile's minimum span (never shrink it).
function fitGrid(template: PuzzleTemplate, profile: ComplexityProfile): PuzzleTemplate {
  return {
    ...template,
    rows: Math.max(template.rows, profile.minGridSpan),
    cols: Math.max(template.cols, profile.minGridSpan),
  }
}

// Structural prompt lines derived from a profile, instructing the model to hit
// the level-4-style complexity (block count, nesting, branching, tight cards).
function profilePromptLines(profile: ComplexityProfile): string[] {
  const lines: string[] = [
    `Use a grid at least ${profile.minGridSpan} by ${profile.minGridSpan}.`,
    `Place between ${profile.obstacles.min} and ${profile.obstacles.max} rocks.`,
  ]
  if (profile.requireNesting) {
    lines.push('Your solution MUST nest an If rule inside a Repeat (a loop-with-if).')
  }
  if (profile.requireBranch) {
    lines.push('Your solution MUST use an If rule with a real else branch (then and else send the explorer different ways).')
  }
  if (profile.minBlocks >= 2) {
    lines.push('Your solution MUST be structurally rich: use at least two loops/while legs, OR a single loop whose body is several moves long.')
  }
  if (profile.cardTightness >= 0.8) {
    lines.push('Keep card limits TIGHT so each move card is used at most once or twice — scarcity is what forces the block.')
  }
  return lines
}

// Attempt ladder: the first CHEAP_ATTEMPTS use the fast mini model; the rest
// escalate to gpt-5.4. After MAX_ATTEMPTS failures the generator abstains.
const MAX_ATTEMPTS = 4
const CHEAP_ATTEMPTS = 2
const CHEAP_TIMEOUT_MS = 30000
const STRONG_TIMEOUT_MS = 60000

interface AttemptModel {
  model: string
  timeoutMs?: number
}

function modelForAttempt(attempt: number): AttemptModel {
  return attempt < CHEAP_ATTEMPTS
    ? { model: OPENAI_MODEL, timeoutMs: CHEAP_TIMEOUT_MS }
    : { model: OPENAI_STRONG_MODEL, timeoutMs: STRONG_TIMEOUT_MS }
}

// Run `fn` up to MAX_ATTEMPTS times, escalating the model per the ladder, and
// return the first truthy (verified) result, or null after exhausting attempts.
async function runAttempts<T>(
  fn: (opts: AttemptModel) => Promise<T | null>,
): Promise<T | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = await fn(modelForAttempt(attempt))
    if (result) return result
  }
  return null
}

// ---------------------------------------------------------------------------
// Shared JSON helpers

function extractJson(raw: string): string | null {
  const match = raw.match(/\{[\s\S]*\}/)
  return match ? match[0] : null
}

const COMMANDS: readonly Command[] = ['up', 'down', 'left', 'right']
function isCommand(value: unknown): value is Command {
  return typeof value === 'string' && (COMMANDS as readonly string[]).includes(value)
}

// Anti-repetition prompt lines: when the template carries recent puzzle
// signatures, ask the model to vary its layout away from them. Advisory only.
function avoidLines(t: PuzzleTemplate): string[] {
  if (!t.avoid || t.avoid.length === 0) return []
  return [
    'Do NOT reproduce any of these recent puzzles — vary the start, goal, and obstacle layout:',
    ...t.avoid.map((sig) => `  ${sig}`),
  ]
}

// Real authored puzzles from the lesson, in the exemplar JSON shape, used as
// extra high-quality worked examples. Advisory prompt-only — never verified.
function authoredExemplarLines(t: PuzzleTemplate): string[] {
  if (!t.authoredExemplars || t.authoredExemplars.length === 0) return []
  return [
    'Here are real puzzles from this lesson to match in quality and style:',
    ...t.authoredExemplars.map((ex) => JSON.stringify(ex)),
  ]
}

// Full previously-generated puzzles the model must not reproduce. Advisory
// prompt-only — never affects verification.
function priorGeneratedLines(t: PuzzleTemplate): string[] {
  if (!t.priorGenerated || t.priorGenerated.length === 0) return []
  return [
    'You have ALREADY generated these puzzles this session. Produce something STRUCTURALLY DIFFERENT from ALL of them (different layout, different mechanics mix, different solution shape):',
    ...t.priorGenerated.map((p) => JSON.stringify(p)),
  ]
}

function mechanicsPromptLines(t: PuzzleTemplate): string[] {
  if (!t.mechanicsGuide || t.mechanicsGuide.length === 0) return []
  return [
    'MECHANICS FROM THIS LESSON — use the same building blocks as the authored examples (not just empty grids with rocks):',
    ...t.mechanicsGuide.map((line) => `  • ${line}`),
    'When several mechanics appear in the lesson, rotate between them across puzzles. Match the JSON shape in the real-lesson examples below.',
  ]
}

function isPositionIn(value: unknown, rows: number, cols: number): value is Position {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return (
    Number.isInteger(p.row) &&
    Number.isInteger(p.col) &&
    (p.row as number) >= 0 &&
    (p.row as number) < rows &&
    (p.col as number) >= 0 &&
    (p.col as number) < cols
  )
}

// ---------------------------------------------------------------------------
// Navigation concept (plain-move mazes) — Phase 1 behavior, preserved.

const NAV_SYSTEM = [
  'You design tiny grid puzzles for a kids coding game.',
  'The explorer starts at "start" and must reach "goal" using up/down/left/right moves.',
  '"obstacles" are impassable rocks.',
  'When no obstacle blocks the way, the shortest path length equals',
  '|goalRow - startRow| + |goalCol - startCol| (the Manhattan distance).',
  'Respond with ONLY a JSON object, no prose, of the form:',
  '{"start":{"row":R,"col":C},"goal":{"row":R,"col":C},"obstacles":[{"row":R,"col":C}]}',
  'All coordinates must be inside the grid. start and goal must differ and must not be obstacles.',
].join('\n')

function buildNavPrompt(t: PuzzleTemplate, profile: ComplexityProfile): string {
  const band = profile.moveBand
  return [
    `Grid: ${t.rows} rows by ${t.cols} columns (rows 0..${t.rows - 1}, cols 0..${t.cols - 1}).`,
    'Put start at row 0, col 0.',
    `Choose the goal so that goalRow + goalCol is between ${band.minMoves} and ${band.maxMoves}; that sum is the move count and it must stay within the grid.`,
    `Allowed moves: ${t.availableCommands.join(', ')}.`,
    `Add ${profile.obstacles.min} to ${profile.obstacles.max} obstacles that are NOT on any shortest path and do not raise the shortest path above ${band.maxMoves} moves.`,
    t.theme ? `Theme: ${t.theme}.` : '',
    ...authoredExemplarLines(t),
    ...mechanicsPromptLines(t),
    ...avoidLines(t),
    ...priorGeneratedLines(t),
    'Output only the JSON.',
  ]
    .filter(Boolean)
    .join('\n')
}

function parseNavMap(raw: string, t: PuzzleTemplate): MapConfig | null {
  const json = extractJson(raw)
  if (!json) return null
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const start = d.start ?? { row: 0, col: 0 }
  if (!isPositionIn(start, t.rows, t.cols) || !isPositionIn(d.goal, t.rows, t.cols)) return null
  const obstacles = Array.isArray(d.obstacles)
    ? d.obstacles.filter((o): o is Position => isPositionIn(o, t.rows, t.cols))
    : []
  return {
    rows: t.rows,
    cols: t.cols,
    start: start as Position,
    goal: d.goal as Position,
    obstacles,
  }
}

async function generateNavigation(template: PuzzleTemplate): Promise<GeneratedPuzzle | null> {
  const profile = profileFor('navigation', template.targetLevel)
  const t = fitGrid(template, profile)
  const band = profile.moveBand
  return runAttempts(async ({ model, timeoutMs }) => {
    const raw = await generateText({ system: NAV_SYSTEM, prompt: buildNavPrompt(t, profile), model, timeoutMs })
    if (!raw) return null
    const map = parseNavMap(raw, t)
    if (!map) return null
    const v = validatePuzzle(map, {
      availableCommands: t.availableCommands,
      band,
      minMoves: band.minMoves,
      difficulty: difficultyTargetFrom(profile, template.targetLevel),
    })
    if (v.ok && v.solution && v.optimalMoves !== null) {
      return {
        map,
        availableCommands: t.availableCommands,
        solution: v.solution,
        optimal: v.optimalMoves,
        difficulty: scoreFor(map, v.solution),
        concept: 'navigation' as const,
        aiGenerated: true as const,
      }
    }
    return null
  })
}

// ---------------------------------------------------------------------------
// Loop concept — the model proposes the whole puzzle + its nested solution.

// A worked example derived from lesson 3's "Loop a staircase" (l3-q3): a square
// grid where the explorer must climb a zig-zag staircase to the treasure. With
// only one Up and one Right card, a flat row cannot reach the goal, so a single
// Repeat with a two-move body ("up, right") is required. This shape matches the
// forced square grid generation uses, and its verified solution lands at the
// level-4 difficulty target on its own (8 executed moves, tight cards).
const LOOP_EXEMPLAR = {
  map: {
    rows: 5,
    cols: 5,
    start: { row: 4, col: 0 },
    goal: { row: 0, col: 4 },
    obstacles: [],
  },
  availableCommands: ['up', 'right'],
  blocks: ['loop'],
  predicateOptions: [],
  loopRange: { min: 1, max: 8 },
  cardLimits: { up: 1, right: 1, loop: 1 },
  solution: [
    {
      kind: 'loop',
      count: 4,
      label: 'Repeat 4× → climb one step',
      body: ['up', 'right'],
    },
  ],
  prompt:
    'A staircase zig-zags up to the treasure, and you have just one Up and one Right card — far too few to walk it by hand. Find the repeating step and let it climb.',
  goal: 'Loop a staircase',
  hints: [
    'Trace the path: up one, right one, again and again — that pair is your repeating step.',
    'Put "Up" then "Right" inside one Repeat block and count how many stairs there are.',
  ],
}

// A second loop exemplar with a SINGLE-move body — modeled on lesson 3's
// "March down the hall": one Right card and a long straight corridor, so the
// only way across is to Repeat that single move. Shows the simplest loop shape
// (one move, many times) alongside the two-move staircase above.
const LOOP_EXEMPLAR_2 = {
  map: { rows: 1, cols: 6, start: { row: 0, col: 0 }, goal: { row: 0, col: 5 }, obstacles: [] },
  availableCommands: ['right'],
  blocks: ['loop'],
  predicateOptions: [],
  loopRange: { min: 1, max: 6 },
  cardLimits: { right: 1, loop: 1 },
  solution: [{ kind: 'loop', count: 5, label: 'Repeat 5×', body: ['right'] }],
  prompt:
    'The treasure sits far down a straight hall, but you hold a single Right card — repeat it to march the whole way.',
  goal: 'March down the hall',
  hints: [
    'One move, many times: wrap your single Right card in a Repeat.',
    'Count the tiles between you and the treasure to pick the repeat number.',
  ],
}

// A corridor/wall puzzle solved by two While loops that each run until a wall
// or edge stops them — modeled on lesson 4's "Run, then climb" (l4-q2). With
// one Right and one Up card, a flat row cannot reach the goal, so a While is
// required; the 'clear' predicates let each loop sense its wall and stop.
const WHILE_EXEMPLAR = {
  map: {
    rows: 6,
    cols: 6,
    start: { row: 5, col: 0 },
    goal: { row: 0, col: 5 },
    obstacles: [],
  },
  availableCommands: ['right', 'up'],
  blocks: ['while'],
  predicateOptions: [
    { predicate: { sensor: 'clear', dir: 'right' }, label: 'Right is clear' },
    { predicate: { sensor: 'clear', dir: 'up' }, label: 'Up is clear' },
  ],
  loopRange: { min: 1, max: 1 },
  cardLimits: { right: 1, up: 1, while: 2 },
  solution: [
    { kind: 'while', predicate: { sensor: 'clear', dir: 'right' }, body: ['right'], label: 'Right is clear' },
    { kind: 'while', predicate: { sensor: 'clear', dir: 'up' }, body: ['up'], label: 'Up is clear' },
  ],
  prompt:
    'Race across the floor and climb the wall to the treasure — both distances are unknown, so there is nothing to count.',
  goal: 'Run, then climb',
  hints: [
    'Two unknown distances means two While loops — one for the run across, one for the climb.',
    'Give each While the move that matches its direction, and let each loop stop itself at the wall.',
  ],
}

// A second while exemplar with a SINGLE While — a straight dash to the far wall
// over an unknown distance. Shows the minimal "run until you can't" shape next
// to the two-loop run-then-climb above.
const WHILE_EXEMPLAR_2 = {
  map: { rows: 6, cols: 6, start: { row: 5, col: 0 }, goal: { row: 5, col: 5 }, obstacles: [] },
  availableCommands: ['right'],
  blocks: ['while'],
  predicateOptions: [{ predicate: { sensor: 'clear', dir: 'right' }, label: 'Right is clear' }],
  loopRange: { min: 1, max: 1 },
  cardLimits: { right: 1, while: 1 },
  solution: [
    { kind: 'while', predicate: { sensor: 'clear', dir: 'right' }, body: ['right'], label: 'Right is clear' },
  ],
  prompt:
    'Dash to the far wall — the distance is unknown, so there is nothing to count. Keep stepping while the way ahead is clear.',
  goal: 'Run to the wall',
  hints: [
    'An unknown distance calls for a While, not a count.',
    'Let the loop keep stepping right until the wall is no longer clear.',
  ],
}

// A gauntlet corridor solved with an If/else "hop the wall" rule — modeled on
// lesson 2's "Through the gauntlet" (l2-q1). The If senses a rock on the right
// and climbs over it, else just steps ahead; a Repeat runs the rule the whole
// way. Card limits are tight enough that sensing-and-branching is the natural
// solution (forcing is NOT proven for conditionals, so this is a soft guide).
const CONDITIONALS_EXEMPLAR = {
  map: {
    rows: 2,
    cols: 8,
    start: { row: 1, col: 0 },
    goal: { row: 1, col: 7 },
    obstacles: [
      { row: 1, col: 2 },
      { row: 1, col: 5 },
    ],
  },
  availableCommands: ['right', 'up', 'down'],
  blocks: ['loop', 'if'],
  predicateOptions: [{ predicate: { sensor: 'blocked', dir: 'right' }, label: 'wall on the right' }],
  loopRange: { min: 1, max: 9 },
  cardLimits: { right: 3, up: 1, down: 1, loop: 1, if: 1 },
  solution: [
    {
      kind: 'loop',
      count: 5,
      label: 'Repeat 5×',
      body: [
        {
          kind: 'conditional',
          predicate: { sensor: 'blocked', dir: 'right' },
          then: ['up', 'right', 'right', 'down'],
          else: ['right'],
          label: 'wall on the right',
        },
      ],
    },
  ],
  prompt:
    'Rocks block the corridor — and next time they could sit anywhere. Teach one rule that handles a rock wherever it appears, and reach the treasure.',
  goal: 'Through the gauntlet',
  hints: [
    'When a wall is on the right, climb over it; when the way is clear, just step ahead.',
    'Count how many times the If block has to run to carry you from start to goal — that is your Repeat number.',
  ],
}

// A second conditional exemplar with a single rock and a shorter then-branch —
// modeled on the same "hop the wall" idea at a smaller scale. Shows the If/else
// rule reacting to one obstacle so the model sees the pattern at two sizes.
const CONDITIONALS_EXEMPLAR_2 = {
  map: {
    rows: 2,
    cols: 6,
    start: { row: 1, col: 0 },
    goal: { row: 1, col: 5 },
    obstacles: [{ row: 1, col: 3 }],
  },
  availableCommands: ['right', 'up', 'down'],
  blocks: ['loop', 'if'],
  predicateOptions: [{ predicate: { sensor: 'blocked', dir: 'right' }, label: 'wall on the right' }],
  loopRange: { min: 1, max: 6 },
  cardLimits: { right: 2, up: 1, down: 1, loop: 1, if: 1 },
  solution: [
    {
      kind: 'loop',
      count: 4,
      label: 'Repeat 4×',
      body: [
        {
          kind: 'conditional',
          predicate: { sensor: 'blocked', dir: 'right' },
          then: ['up', 'right', 'down'],
          else: ['right'],
          label: 'wall on the right',
        },
      ],
    },
  ],
  prompt:
    'A lone rock sits in the hall — but it could move next time. Teach one rule that climbs a wall when it meets one and steps ahead when the way is clear.',
  goal: 'Hop the rock',
  hints: [
    'If the way right is blocked, climb over it; otherwise just step right.',
    'Wrap the rule in a Repeat so it carries you the whole corridor.',
  ],
}

// Shared system-prompt builder. Every concept offers the same JSON shape and
// the same Instruction grammar; only the taught block, the required-block note,
// and the critical design rules differ.
function conceptSystem(opts: {
  teaches: string
  skill: string
  mustInclude: string
  designRules: string[]
}): string {
  return [
    `You design tiny grid puzzles for a kids coding game that teach ${opts.teaches}.`,
    opts.skill,
    'The explorer starts at "start" and must reach "goal" using up/down/left/right moves.',
    '"obstacles" are impassable rocks. Coordinates are 0-based {row, col}.',
    '',
    'You must output ONLY a single JSON object (no prose, no markdown fences) with these fields:',
    '  "map": {"start":{row,col}, "goal":{row,col}, "obstacles":[{row,col}, ...],',
    '           optional: "teleports":[{a:{row,col},b:{row,col}}], "tasks":[{from:{row,col},to:{row,col},label:"..."}],',
    '           "checkpoints", "ice", "gates", "plates", "keys", "doors" — only when used in the lesson examples}',
    '  "availableCommands": subset of ["up","down","left","right"]',
    '  "availableActions": optional subset of ["pickup","drop"] when the puzzle uses fetch-and-carry tasks',
    `  "blocks": list of offered blocks; ${opts.mustInclude}`,
    '  "predicateOptions": [{"predicate":{"sensor":"blocked"|"clear","dir":"up"|"down"|"left"|"right"}, "label":"..."}]',
    '  "loopRange": {"min":N, "max":N}  (allowed Repeat counts)',
    '  "cardLimits": object mapping cards to a max placement count, e.g. {"right":3,"up":1,"down":1,"loop":1,"if":1}',
    '  "solution": a JSON array of Instructions that SOLVES the map. An Instruction is one of:',
    '     - a plain move string: "up" | "down" | "left" | "right"',
    '     - a loop: {"kind":"loop","count":N,"body":[Instruction,...],"label":"..."}',
    '     - a while: {"kind":"while","predicate":{...},"body":[Instruction,...],"label":"..."}',
    '     - a conditional: {"kind":"conditional","predicate":{...},"then":[Instruction,...],"else":[Instruction,...],"label":"..."}',
    '  "prompt": one or two kid-friendly sentences framing the challenge (no spoilers, never list the moves)',
    '  "goal": a short title for the puzzle',
    '  "hints": array of 1-2 nudge strings (never reveal the move sequence)',
    '',
    'CRITICAL design rules:',
    ...opts.designRules.map((rule, i) => `  ${i + 1}. ${rule}`),
    '  The solution may only use cards/blocks/predicates you offered, and must respect the cardLimits (count PLACEMENTS, not executions: a move inside a loop body counts once).',
  ].join('\n')
}

function buildConceptPrompt(
  t: PuzzleTemplate,
  exemplars: object[],
  what: string,
  profile: ComplexityProfile,
): string {
  const band = profile.moveBand
  const exemplarHeader =
    exemplars.length === 1
      ? 'Here is a worked example of the EXACT JSON shape and the quality to match:'
      : `Here are ${exemplars.length} worked examples of the EXACT JSON shape and the quality to match:`
  return [
    `Grid: ${t.rows} rows by ${t.cols} columns (rows 0..${t.rows - 1}, cols 0..${t.cols - 1}).`,
    `Design ${what} whose verified solution executes between ${band.minMoves} and ${band.maxMoves} moves in total.`,
    `Allowed moves to choose from: ${t.availableCommands.join(', ')}.`,
    ...profilePromptLines(profile),
    t.theme ? `Theme: ${t.theme}.` : '',
    exemplarHeader,
    ...exemplars.map((ex) => JSON.stringify(ex)),
    ...authoredExemplarLines(t),
    ...mechanicsPromptLines(t),
    ...avoidLines(t),
    ...priorGeneratedLines(t),
    'Now produce a NEW, different puzzle of the same shape that is at least as structurally rich as the examples. Output only the JSON.',
  ]
    .filter(Boolean)
    .join('\n')
}

// A ConceptSpec packages everything generateConcept needs to drive one block
// concept: which block the solution must contain, the system prompt, the worked
// exemplar, a prompt builder, and the success-feedback line.
interface ConceptSpec {
  concept: Concept
  requiredBlock: BlockKind
  system: string
  exemplars: object[]
  buildPrompt: (t: PuzzleTemplate, profile: ComplexityProfile) => string
  correct: string
}

const loopsSpec: ConceptSpec = {
  concept: 'loops',
  requiredBlock: 'loop',
  system: conceptSystem({
    teaches: 'FOR-LOOPS (the "Repeat" block)',
    skill:
      'A FOR-LOOP repeats a fixed body a set number of times; it shines when the same move pattern recurs a known count, replacing a long flat program with one compact Repeat.',
    mustInclude: 'MUST include "loop" and may include "if"',
    designRules: [
      'The card limits MUST be so tight that NO flat row of plain moves can reach the goal — a Repeat must be required.',
      'The "solution" MUST genuinely reach the goal and MUST use a "loop".',
      'Match the LESSON MECHANICS in the authored examples — teleports, fetch-and-carry, multi-leg loops, etc. — not only plain corridors.',
      'Rotate mechanics: if the lesson has teleports AND cargo runs, alternate between them across generated puzzles.',
    ],
  }),
  exemplars: [LOOP_EXEMPLAR, LOOP_EXEMPLAR_2],
  buildPrompt: (t, profile) => buildConceptPrompt(t, [LOOP_EXEMPLAR, LOOP_EXEMPLAR_2], 'a loop puzzle', profile),
  correct: 'You did it! Your loop ran the cards over and over to reach the treasure.',
}

const whileSpec: ConceptSpec = {
  concept: 'while',
  requiredBlock: 'while',
  system: conceptSystem({
    teaches: 'WHILE-LOOPS (the "While" block that repeats until its condition becomes false)',
    skill:
      'A WHILE-LOOP repeats while a condition holds and stops the instant it fails; it shines when a distance is unknown and cannot be counted ahead of time.',
    mustInclude: 'MUST include "while"',
    designRules: [
      'The card limits MUST be so tight that NO flat row of plain moves can reach the goal — a While must be required.',
      'The "solution" MUST genuinely reach the goal and MUST use a "while".',
      'Use "clear"/"blocked" predicates so the While senses a wall or edge and STOPS on its own; the condition must be able to become false, or the run fails.',
    ],
  }),
  exemplars: [WHILE_EXEMPLAR, WHILE_EXEMPLAR_2],
  buildPrompt: (t, profile) =>
    buildConceptPrompt(t, [WHILE_EXEMPLAR, WHILE_EXEMPLAR_2], 'a while-loop puzzle', profile),
  correct: 'Nice — your While block kept running until a wall stopped it, no counting at all.',
}

const conditionalsSpec: ConceptSpec = {
  concept: 'conditionals',
  requiredBlock: 'if',
  system: conceptSystem({
    teaches: 'IF/ELSE branching (the "If" block that senses the world and picks a path)',
    skill:
      'An IF/ELSE senses the world and chooses between two paths; it shines when the same rule must react differently depending on what the explorer detects.',
    mustInclude: 'MUST include "if" and may include "loop"',
    designRules: [
      'The "solution" MUST genuinely reach the goal and MUST use an "if" (conditional) whose then/else send the explorer different ways.',
      'Design the map so branching is the natural solution: place rocks so one sensed rule (e.g. "if blocked on the right, climb over; else step ahead") handles every step.',
      'Keep card limits tight enough that laying out a fixed row of moves is impractical, so the explorer must sense and branch.',
    ],
  }),
  exemplars: [CONDITIONALS_EXEMPLAR, CONDITIONALS_EXEMPLAR_2],
  buildPrompt: (t, profile) =>
    buildConceptPrompt(t, [CONDITIONALS_EXEMPLAR, CONDITIONALS_EXEMPLAR_2], 'an if/else puzzle', profile),
  correct: 'Great — your If block sensed the world and chose the right path every step.',
}

const CONCEPT_SPECS: Record<Concept, ConceptSpec> = {
  loops: loopsSpec,
  while: whileSpec,
  conditionals: conditionalsSpec,
}

const SENSOR_DIRS = new Set(['blocked', 'clear'])
const SENSOR_BARE = new Set([
  'atGem',
  'bridgeOpen',
  'counterEven',
  'counterOdd',
  'targetFound',
  'targetNotFound',
  'targetHigher',
  'targetLower',
])

function parsePredicate(value: unknown): Predicate | null {
  if (!value || typeof value !== 'object') return null
  const p = value as Record<string, unknown>
  const sensor = p.sensor
  if (typeof sensor !== 'string') return null
  if (SENSOR_DIRS.has(sensor)) {
    if (!isCommand(p.dir)) return null
    return { sensor: sensor as 'blocked' | 'clear', dir: p.dir }
  }
  if (sensor === 'counterMod') {
    if (!Number.isInteger(p.divisor) || !Number.isInteger(p.remainder)) return null
    return { sensor: 'counterMod', divisor: p.divisor as number, remainder: p.remainder as number }
  }
  if (SENSOR_BARE.has(sensor)) {
    return { sensor } as Predicate
  }
  return null
}

const ACTIONS: readonly Action[] = [
  'pickup',
  'drop',
  'toMiddle',
  'discardLower',
  'discardUpper',
  'dash',
  'shield',
  'super',
  'hold',
]
function isActionString(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value)
}

// Parse one nested Instruction. Returns null if anything is malformed, so a
// single bad node rejects the whole proposal (the caller then retries).
function parseInstruction(value: unknown): Instruction | null {
  if (typeof value === 'string') {
    if (isCommand(value) || isActionString(value)) return value
    return null
  }
  if (!value || typeof value !== 'object') return null
  const node = value as Record<string, unknown>
  const kind = node.kind

  if (kind === 'loop') {
    if (!Number.isInteger(node.count) || (node.count as number) < 1) return null
    const body = parseInstructionList(node.body)
    if (!body) return null
    const label = typeof node.label === 'string' ? node.label : `Repeat ${node.count as number}×`
    return { kind: 'loop', count: node.count as number, body, label }
  }
  if (kind === 'conditional') {
    const predicate = parsePredicate(node.predicate)
    if (!predicate) return null
    const thenB = parseInstructionList(node.then)
    const elseB = parseInstructionList(node.else ?? [])
    if (!thenB || !elseB) return null
    const label = typeof node.label === 'string' ? node.label : 'condition'
    return { kind: 'conditional', predicate, then: thenB, else: elseB, label }
  }
  if (kind === 'while') {
    const predicate = parsePredicate(node.predicate)
    if (!predicate) return null
    const body = parseInstructionList(node.body)
    if (!body) return null
    const label = typeof node.label === 'string' ? node.label : 'while'
    return { kind: 'while', predicate, body, label }
  }
  return null
}

function parseInstructionList(value: unknown): Instruction[] | null {
  if (!Array.isArray(value)) return null
  const out: Instruction[] = []
  for (const item of value) {
    const inst = parseInstruction(item)
    if (inst === null) return null
    out.push(inst)
  }
  return out
}

interface ParsedLoopPuzzle {
  candidate: LoopPuzzleCandidate
  loopRange: { min: number; max: number }
  prompt?: string
  goal?: string
  hints: string[]
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((s): s is string => typeof s === 'string') : []
}

function parseCardLimits(value: unknown): CardLimits {
  const out: CardLimits = {}
  if (!value || typeof value !== 'object') return out
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (Number.isInteger(raw) && (raw as number) >= 0) {
      out[key as keyof CardLimits] = raw as number
    }
  }
  return out
}

const BLOCK_KINDS: readonly BlockKind[] = ['loop', 'while', 'if']
function isBlockKind(value: unknown): value is BlockKind {
  return typeof value === 'string' && (BLOCK_KINDS as readonly string[]).includes(value)
}

function parseTeleports(value: unknown, rows: number, cols: number): Teleport[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: Teleport[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (isPositionIn(o.a, rows, cols) && isPositionIn(o.b, rows, cols)) {
      out.push({ a: o.a as Position, b: o.b as Position })
    }
  }
  return out.length > 0 ? out : undefined
}

function parseTasks(value: unknown, rows: number, cols: number): Task[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: Task[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (isPositionIn(o.from, rows, cols) && isPositionIn(o.to, rows, cols)) {
      out.push({
        from: o.from as Position,
        to: o.to as Position,
        label: typeof o.label === 'string' ? o.label : undefined,
      })
    }
  }
  return out.length > 0 ? out : undefined
}

function parseConceptPuzzle(
  raw: string,
  t: PuzzleTemplate,
  requiredBlock: BlockKind,
): ParsedLoopPuzzle | null {
  const json = extractJson(raw)
  if (!json) return null
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>

  // Map: grid dimensions come from the template; the model places start/goal/rocks.
  const rawMap = (d.map ?? d) as Record<string, unknown>
  const start = rawMap.start
  const goal = rawMap.goal
  if (!isPositionIn(start, t.rows, t.cols) || !isPositionIn(goal, t.rows, t.cols)) return null
  const obstacles = Array.isArray(rawMap.obstacles)
    ? rawMap.obstacles.filter((o): o is Position => isPositionIn(o, t.rows, t.cols))
    : []
  const teleports = parseTeleports(rawMap.teleports, t.rows, t.cols)
  const tasks = parseTasks(rawMap.tasks, t.rows, t.cols)
  const map: MapConfig = {
    rows: t.rows,
    cols: t.cols,
    start: start as Position,
    goal: goal as Position,
    obstacles,
  }
  if (teleports) map.teleports = teleports
  if (tasks) map.tasks = tasks

  const availableCommands = Array.isArray(d.availableCommands)
    ? (d.availableCommands.filter(isCommand) as Command[])
    : []
  if (availableCommands.length === 0) return null

  const availableActions = Array.isArray(d.availableActions)
    ? (d.availableActions.filter(isActionString) as Action[])
    : undefined

  const blocks = Array.isArray(d.blocks) ? (d.blocks.filter(isBlockKind) as BlockKind[]) : []
  if (!blocks.includes(requiredBlock)) return null

  const predicateOptions: PredicateOption[] = []
  if (Array.isArray(d.predicateOptions)) {
    for (const opt of d.predicateOptions) {
      if (!opt || typeof opt !== 'object') continue
      const o = opt as Record<string, unknown>
      const predicate = parsePredicate(o.predicate)
      if (!predicate) continue
      const label = typeof o.label === 'string' ? o.label : 'condition'
      predicateOptions.push({ predicate, label })
    }
  }

  const loopRange =
    d.loopRange &&
    typeof d.loopRange === 'object' &&
    Number.isInteger((d.loopRange as Record<string, unknown>).min) &&
    Number.isInteger((d.loopRange as Record<string, unknown>).max)
      ? {
          min: (d.loopRange as Record<string, number>).min,
          max: (d.loopRange as Record<string, number>).max,
        }
      : { min: 1, max: 9 }

  const cardLimits = parseCardLimits(d.cardLimits)
  const solution = parseInstructionList(d.solution)
  if (!solution) return null

  const prompt = typeof d.prompt === 'string' ? d.prompt : undefined
  const goalText = typeof d.goal === 'string' ? d.goal : undefined
  const hints = parseStringArray(d.hints)

  return {
    candidate: {
      map,
      availableCommands,
      availableActions: availableActions?.length ? availableActions : undefined,
      blocks,
      predicateOptions,
      cardLimits,
      solution,
    },
    loopRange,
    prompt,
    goal: goalText,
    hints,
  }
}

// Backwards-compatible loop-only parser used by the unit tests.
function parseLoopPuzzle(raw: string, t: PuzzleTemplate): ParsedLoopPuzzle | null {
  return parseConceptPuzzle(raw, t, 'loop')
}

// Generic block-concept generator: the model proposes the whole puzzle plus its
// nested solution; the engine verifies it. Shared by loops, while, and
// conditionals via their ConceptSpec.
async function generateConcept(
  template: PuzzleTemplate,
  spec: ConceptSpec,
  profile: ComplexityProfile,
): Promise<GeneratedPuzzle | null> {
  const t = fitGrid(template, profile)
  // Block concepts gate on a capped numeric score target so a correct-but-simpler
  // FORCED puzzle is not rejected as 'tooEasy'. The pedagogical forcing guarantee
  // ('notForced' in verify.ts) and the profile's structural minimums
  // (minGridSpan / requireNesting / requireBranch) still apply unchanged — only
  // the numeric difficulty score target is capped.
  const gateLevel = Math.min(template.targetLevel, 3)
  return runAttempts(async ({ model, timeoutMs }) => {
    const raw = await generateText({ system: spec.system, prompt: spec.buildPrompt(t, profile), model, timeoutMs })
    if (!raw) return null
    const parsed = parseConceptPuzzle(raw, t, spec.requiredBlock)
    if (!parsed) return null

    const validation = validateConceptPuzzle(parsed.candidate, {
      band: profile.moveBand,
      concept: spec.concept,
      successRule: 'reachGoal',
      difficulty: difficultyTargetFrom(profile, gateLevel),
    })
    if (!validation.ok || validation.optimalMoves === null) return null

    const { candidate } = parsed
    const feedback: StepFeedback | undefined =
      parsed.hints.length > 0 ? { correct: spec.correct, hints: parsed.hints } : undefined

    return {
      map: candidate.map,
      availableCommands: candidate.availableCommands,
      availableActions: candidate.availableActions,
      blocks: candidate.blocks,
      predicateOptions: candidate.predicateOptions,
      loopRange: parsed.loopRange,
      cardLimits: candidate.cardLimits,
      solution: candidate.solution,
      prompt: parsed.prompt,
      goal: parsed.goal,
      feedback,
      optimal: validation.optimalMoves,
      difficulty: scoreFor(candidate.map, candidate.solution, candidate.cardLimits),
      concept: spec.concept,
      aiGenerated: true as const,
    }
  })
}

// Generate a verified puzzle at one specific target level (no fallback).
async function generateAtLevel(
  template: PuzzleTemplate,
  targetLevel: number,
): Promise<GeneratedPuzzle | null> {
  const t: PuzzleTemplate = { ...template, targetLevel }
  const concept = t.concept ?? 'navigation'
  if (concept === 'navigation') return generateNavigation(t)
  // 'mixed' aims for the loop-with-if nested shape, so it uses the conditionals
  // spec (whose exemplar nests an If inside a Repeat) with the nesting-required
  // mixed profile. Concrete concepts use their own spec + profile.
  if (concept === 'mixed') {
    return generateConcept(t, conditionalsSpec, profileFor('mixed', t.targetLevel))
  }
  return generateConcept(t, CONCEPT_SPECS[concept], profileFor(concept, t.targetLevel))
}

export async function generatePuzzle(template: PuzzleTemplate): Promise<GeneratedPuzzle | null> {
  if (!aiGenerationEnabled) return null
  // Graceful degradation: aim for the requested level first, then fall back to
  // level 3 (the easiest verifiable target) before abstaining to authored
  // content — so the learner never sees a hard "couldn't make a puzzle" failure.
  const requested = template.targetLevel
  const concept = template.concept ?? 'navigation'
  // Navigation keeps its simple two-step fallback; block concepts try every
  // level from the requested one down to 3 so a forced-but-simpler puzzle has
  // more chances to verify before abstaining.
  let levels: number[]
  if (concept === 'navigation') {
    levels = requested > 3 ? [requested, 3] : [requested]
  } else {
    levels = []
    for (let level = requested; level >= 3; level--) levels.push(level)
    if (levels.length === 0) levels = [requested]
  }
  for (const level of levels) {
    const puzzle = await generateAtLevel(template, level)
    if (puzzle) return puzzle
  }
  return null
}

// Exported for unit tests of the nested-Instruction JSON parser.
export const __test = { parseLoopPuzzle, parseInstructionList, parsePredicate }
