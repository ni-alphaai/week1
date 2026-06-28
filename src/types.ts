// Domain types for the Programming Logic course.
// Lesson content is authored against these types and validated by the content registry.

export type Command = 'up' | 'down' | 'left' | 'right'

// Beat actions: emitted once per beat in the "Dodge the Beat" rhythm puzzles.
export type BeatAction = 'dash' | 'shield' | 'super' | 'hold'

// Action cards do something other than a plain move: carry an item
// (pickup/drop), drive a binary search (toMiddle/discardLower/discardUpper), or
// react on a beat (dash/shield/super/hold).
export type Action =
  | 'pickup'
  | 'drop'
  | 'toMiddle'
  | 'discardLower'
  | 'discardUpper'
  | BeatAction

const BEAT_ACTIONS: readonly BeatAction[] = ['dash', 'shield', 'super', 'hold']

export function isBeatAction(step: Step): step is BeatAction {
  return (BEAT_ACTIONS as readonly string[]).includes(step)
}

// A single executable step in a program: a move or an action.
export type Step = Command | Action

export function isAction(step: Step): step is Action {
  return (
    step === 'pickup' ||
    step === 'drop' ||
    step === 'toMiddle' ||
    step === 'discardLower' ||
    step === 'discardUpper' ||
    isBeatAction(step)
  )
}

export interface Position {
  row: number
  col: number
}

export interface BridgeConfig {
  row: number
  col: number
  open: boolean
}

// Two linked teleport pads — stepping on one whisks the explorer to the other.
export interface Teleport {
  a: Position
  b: Position
}

// A gate (movable wall): blocks movement while `open` is false.
export interface Gate {
  id: string
  at: Position
  open: boolean
}

// A floor switch — stepping on it changes a gate. `toggle` flips, `open` only opens.
export interface Plate {
  at: Position
  gateId: string
  mode: 'toggle' | 'open'
}

// A fetch-and-carry job: pick the item up at `from`, drop it at `to`.
// Tasks must be completed in order (task 1, then task 2, …).
export interface Task {
  from: Position
  to: Position
  label?: string
}

// A tile that bumps the run counter when the explorer lands on it.
export interface CounterTile {
  at: Position
  /** Added to the counter when the explorer lands here. Defaults to 1. */
  bonus?: number
}

export interface MapConfig {
  rows: number
  cols: number
  start: Position
  goal: Position
  obstacles?: Position[]
  bridge?: BridgeConfig
  /** Package drop-off stops — must be visited in order before the goal counts. */
  checkpoints?: Position[]
  /** Fetch-and-carry jobs — pick up at `from`, drop at `to`, in order. */
  tasks?: Task[]
  /** Paired teleport pads. */
  teleports?: Teleport[]
  /** Movable walls that open/close. */
  gates?: Gate[]
  /** Floor switches that change a gate when stepped on. */
  plates?: Plate[]
  /** Slippery tiles — the explorer keeps sliding until something stops it. */
  ice?: Position[]
  /** Keys lying on the floor — pick one up by stepping on it. */
  keys?: Position[]
  /** Locked doors — impassable unless the explorer is carrying a key. */
  doors?: Position[]
  /** Tiles that add to the run counter when stepped on. */
  counterTiles?: CounterTile[]
  /** Tiles showing a number — read by the value-comparison sensors. */
  numberTiles?: NumberTile[]
  /** The hidden number the explorer must land on (drives target* sensors). */
  targetValue?: number
  /**
   * Binary-search mode. When true, the run tracks a shrinking column window
   * [lo, hi] over the sorted `numberTiles` row that the explicit search-op
   * cards drive: `toMiddle` leaps to the middle of the window, `discardLower`
   * raises `lo` past the current tile, `discardUpper` lowers `hi`. It also makes
   * the board record the window per tile so discarded halves can dim out.
   */
  binarySearch?: boolean
}

// A tile displaying a number, used by "find the number" search puzzles.
export interface NumberTile {
  at: Position
  value: number
}

// reachGoal: any legal path that lands on the goal wins.
// shortestPath: must also use the minimum number of moves.
export type SuccessRule = 'reachGoal' | 'shortestPath'

// A runtime condition the explorer can sense at its current tile.
// `blocked`/`clear` test the neighbouring tile in a direction (edge or rock);
// `atGem` is true while standing on an uncollected pickup; `bridgeOpen` is static.
export type Predicate =
  | { sensor: 'blocked'; dir: Command }
  | { sensor: 'clear'; dir: Command }
  | { sensor: 'atGem' }
  | { sensor: 'bridgeOpen' }
  | { sensor: 'counterEven' }
  | { sensor: 'counterOdd' }
  | { sensor: 'counterMod'; divisor: number; remainder: number }
  | { sensor: 'targetFound' }
  | { sensor: 'targetNotFound' }
  | { sensor: 'targetHigher' }
  | { sensor: 'targetLower' }

// An if/else card: evaluated at runtime against the explorer's current tile.
// Bodies may themselves contain loops/conditionals (Scratch-style nesting).
export interface Conditional {
  kind: 'conditional'
  predicate: Predicate
  then: Instruction[]
  else: Instruction[]
  label: string
}

// A for-loop: run `body` exactly `count` times.
export interface Loop {
  kind: 'loop'
  count: number
  body: Instruction[]
  label: string
}

// A while-loop: run `body` repeatedly as long as `predicate` is true.
export interface While {
  kind: 'while'
  predicate: Predicate
  body: Instruction[]
  label: string
}

export type Instruction = Step | Conditional | Loop | While

// Which composable container blocks a puzzle offers in its palette.
export type BlockKind = 'loop' | 'while' | 'if'

// A condition the learner can pick for a while/if block, with a kid-friendly label.
export interface PredicateOption {
  predicate: Predicate
  label: string
}

// How many times each card may be placed in one program. A move/action/block
// not listed here is unlimited. Scarce move cards force learners to reach for a
// loop or while block instead of laying down a long row of plain moves.
export type CardLimits = Partial<Record<Command | Action | BlockKind, number>>

export interface StepFeedback {
  correct: string
  /** Escalating hints after failed attempts — nudge, never the full answer. */
  hints: string[]
}

export interface ConceptStep {
  id: string
  type: 'concept'
  title: string
  body: string
}

export interface SequenceStep {
  id: string
  type: 'sequence'
  /** Short kid-friendly goal shown prominently. */
  goal: string
  prompt: string
  map: MapConfig
  availableCommands: Command[]
  /** Pickup/drop cards offered for fetch-and-carry puzzles. */
  availableActions?: Action[]
  /** Composable container blocks offered (Repeat / While / If). */
  blocks?: BlockKind[]
  /** Condition choices for while/if blocks. */
  predicateOptions?: PredicateOption[]
  /** Allowed count range for for-loops. */
  loopRange?: { min: number; max: number }
  /** Per-card placement limits (omitted cards are unlimited). */
  cardLimits?: CardLimits
  successRule: SuccessRule
  optimal?: number
  feedback: StepFeedback
  /** A verified solution, replayed by the "ghost" hint. */
  solution: Instruction[]
  /** Optional scaffold pre-filled into the editor when a learner first opens the step. */
  initialProgram?: Instruction[]
  /**
   * When true, the `initialProgram` is pre-filled as fully editable cards (not
   * locked scaffold) — used by "fix the bug" debugging puzzles.
   */
  editableInitial?: boolean
  /** True for puzzles produced by verified AI generation (P1). */
  aiGenerated?: boolean
  /** Optional difficulty hint (e.g. the solver's optimal move count) for adaptive selection. */
  difficulty?: number
}

export interface ConditionalStep {
  id: string
  type: 'conditional'
  goal: string
  prompt: string
  map: MapConfig
  availableCommands: Command[]
  availableActions?: Action[]
  blocks?: BlockKind[]
  predicateOptions?: PredicateOption[]
  loopRange?: { min: number; max: number }
  /** Per-card placement limits (omitted cards are unlimited). */
  cardLimits?: CardLimits
  feedback: StepFeedback
  /** A verified solution, replayed by the "ghost" hint. */
  solution: Instruction[]
  /** Optional scaffold pre-filled into the editor when a learner first opens the step. */
  initialProgram?: Instruction[]
  /**
   * When true, the `initialProgram` is pre-filled as fully editable cards (not
   * locked scaffold) — used by "fix the bug" debugging puzzles.
   */
  editableInitial?: boolean
  /**
   * Whether the checker rejects solutions that contain no if/else block.
   * Defaults to true for conditional steps; set false in mixed-tool lessons
   * where an if is allowed but not mandatory.
   */
  requiresConditional?: boolean
}

// A rule mapping a runtime predicate (evaluated with the beat count) to the
// action the learner must emit on that beat. Rules are first-match wins.
export interface BeatRule {
  predicate: Predicate
  action: BeatAction
}

// "Dodge the Beat": the count ticks 0..count-1 and the learner programs the
// action emitted on each beat (nested Ifs + a loop). The required action per
// beat comes from `rules` (first match) or `defaultAction` otherwise.
export interface BeatStep {
  id: string
  type: 'beat'
  goal: string
  prompt: string
  /** How many beats the run lasts (counts 0..count-1). */
  count: number
  /** Required-action rules, first-match wins. The "subject logic" verified against. */
  rules: BeatRule[]
  /** Action required when no rule matches. */
  defaultAction: BeatAction
  /** Action cards offered in the palette. */
  availableActions: BeatAction[]
  /** Composable container blocks offered (Repeat / If). */
  blocks?: BlockKind[]
  /** Condition choices for while/if blocks (e.g. divides-by-3, divides-by-5). */
  predicateOptions?: PredicateOption[]
  /** Allowed count range for for-loops. */
  loopRange?: { min: number; max: number }
  /** Per-card placement limits. */
  cardLimits?: CardLimits
  feedback: StepFeedback
  /** A verified solution program (emits the expected action on every beat). */
  solution: Instruction[]
  initialProgram?: Instruction[]
  editableInitial?: boolean
  /** Display label + accent color per action, for the lane and cards. */
  actionMeta?: Partial<Record<BeatAction, { label: string; color?: string }>>
}

export type LessonStep = ConceptStep | SequenceStep | ConditionalStep | BeatStep

// Rarity tier for badges (achievement and lesson-award alike).
export type BadgeRarity = 'common' | 'uncommon' | 'rare'

// An achievement awarded when a lesson is completed for the first time.
export interface Badge {
  id: string
  title: string
  blurb: string
  rarity?: BadgeRarity
}

export interface Lesson {
  id: string
  version: number
  title: string
  subtitle: string
  sequence: number
  skillIds: string[]
  steps: LessonStep[]
  /** Awarded the first time this lesson is completed (e.g. capstone badge). */
  award?: Badge
}

export interface Course {
  id: string
  title: string
  description: string
  lessonOrder: string[]
}

export function isSequenceStep(step: LessonStep): step is SequenceStep {
  return step.type === 'sequence'
}

export function isConditionalStep(step: LessonStep): step is ConditionalStep {
  return step.type === 'conditional'
}

export function isBeatStep(step: LessonStep): step is BeatStep {
  return step.type === 'beat'
}
