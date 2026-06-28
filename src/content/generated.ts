// Wraps a verified, AI-generated puzzle into a playable SequenceStep so the
// practice player can run it through the same engine and components as authored
// content. Navigation puzzles are plain-move only; loop puzzles carry their own
// blocks, predicate options, loop range, card limits and nested solution, all of
// which are passed straight through to the step.

import type { GeneratedPuzzle, GeneratedConcept, GenConcept, PuzzleTemplate } from '../ai/generation'
import type { ConditionalStep, Lesson, MapConfig, SequenceStep, StepFeedback } from '../types'
import type { Action, Command } from '../types'
import { isSequenceStep } from '../types'
import { runInstructions } from '../engine/map'
import type { DifficultyDirection } from '../adaptivity/difficulty'
import { bandForDirection, targetLevelForDirection } from '../adaptivity/difficulty'

// Which AI concept a lesson's endless-practice puzzles should teach, keyed by
// lesson id. Lessons with no matching generator (e.g. the challenge bank) map to
// null, signalling the caller to abstain to authored practice instead.
const CONCEPT_BY_LESSON: Record<string, GenConcept> = {
  'lesson-1-sequencing-cargo': 'navigation',
  'lesson-2-for-loops': 'loops',
  'lesson-3-while-loops': 'while',
  'lesson-4-if-else': 'conditionals',
  'lesson-5-final-challenge': 'mixed',
}

export function conceptForLesson(lesson: Lesson): GenConcept | null {
  return CONCEPT_BY_LESSON[lesson.id] ?? null
}

const NAV_COMMANDS: Command[] = ['up', 'down', 'left', 'right']

// Authored fallbacks used whenever the AI omitted (or failed to supply) the
// kid-facing narrative, so a generated step always reads sensibly.
const FALLBACK_GOAL = 'Guide the explorer to the treasure!'
const FALLBACK_PROMPT =
  'A fresh puzzle, just for you. Drag the cards so the explorer reaches the treasure.'
const FALLBACK_FEEDBACK: StepFeedback = {
  correct: 'You did it! Want another one?',
  hints: [
    'Look at where the treasure is compared to the explorer.',
    'Move one step at a time toward the treasure.',
    'Watch out for the edges and the rocks.',
  ],
}

let counter = 0

// Session-scoped history of puzzles already generated for a lesson. Shared
// across LessonPage prefetch and PracticePage so chained prefetches and the
// model prompt both see the same anti-repetition context.
const sessionGenerated = new Map<string, GeneratedPuzzle[]>()

export function recordPracticePuzzle(lessonId: string, puzzle: GeneratedPuzzle): void {
  const list = sessionGenerated.get(lessonId) ?? []
  sessionGenerated.set(lessonId, [...list, puzzle].slice(-8))
}

function priorGeneratedExemplars(lessonId: string): object[] {
  return (sessionGenerated.get(lessonId) ?? []).map(puzzleToExemplar)
}

export function clearPracticeSession(lessonId: string): void {
  sessionGenerated.delete(lessonId)
}

// Convert a generated puzzle into the exemplar JSON shape the model reads.
function puzzleToExemplar(puzzle: GeneratedPuzzle): object {
  const exemplar: Record<string, unknown> = {
    map: puzzle.map,
    availableCommands: puzzle.availableCommands,
    solution: puzzle.solution,
  }
  if (puzzle.blocks !== undefined) exemplar.blocks = puzzle.blocks
  if (puzzle.predicateOptions !== undefined) exemplar.predicateOptions = puzzle.predicateOptions
  if (puzzle.loopRange !== undefined) exemplar.loopRange = puzzle.loopRange
  if (puzzle.cardLimits !== undefined) exemplar.cardLimits = puzzle.cardLimits
  if (puzzle.availableActions !== undefined) exemplar.availableActions = puzzle.availableActions
  if (puzzle.prompt !== undefined) exemplar.prompt = puzzle.prompt
  if (puzzle.goal !== undefined) exemplar.goal = puzzle.goal
  if (puzzle.feedback?.hints !== undefined) exemplar.hints = puzzle.feedback.hints
  return exemplar
}

export function mapMechanicsFromStep(map: MapConfig, actions: Action[] | undefined): string[] {
  const found: string[] = []
  if (map.teleports?.length) found.push('teleports')
  if (map.tasks?.length) found.push('tasks')
  if (map.checkpoints?.length) found.push('checkpoints')
  if (map.ice?.length) found.push('ice')
  if (map.gates?.length || map.plates?.length) found.push('gates')
  if (map.keys?.length || map.doors?.length) found.push('keys-and-doors')
  if (map.bridge) found.push('bridge')
  if (actions?.includes('pickup') || actions?.includes('drop')) found.push('pickup-drop')
  return found
}

// Describe special mechanics present in a lesson's authored puzzles so the
// generator weaves them in — not just plain empty-grid mazes.
function mechanicsGuideForLesson(lesson: Lesson): string[] {
  const seen = new Set<string>()
  for (const step of lesson.steps) {
    if (!isSequenceStep(step)) continue
    for (const m of mapMechanicsFromStep(step.map, step.availableActions)) seen.add(m)
    if ((step.blocks?.length ?? 0) >= 2) seen.add('multi-loop')
    if (step.solution.some((inst) => typeof inst === 'object' && inst.kind === 'loop' && inst.body.length > 1)) {
      seen.add('multi-move-loop-body')
    }
  }

  const lines: string[] = []
  if (seen.has('teleports')) {
    lines.push(
      'Teleport pads: set map.teleports to [{a:{row,col}, b:{row,col}}]. Stepping on either pad instantly jumps to the other — count steps on both sides.',
    )
  }
  if (seen.has('tasks') || seen.has('pickup-drop')) {
    lines.push(
      'Fetch-and-carry: set map.tasks to [{from:{row,col}, to:{row,col}, label:"..."}] in order. Include availableActions ["pickup","drop"] and weave pickup/drop action strings into the solution between move legs.',
    )
  }
  if (seen.has('checkpoints')) {
    lines.push('Checkpoints: map.checkpoints lists positions that must be visited in order before the goal counts.')
  }
  if (seen.has('ice')) {
    lines.push('Ice tiles: map.ice — the explorer slides until hitting a wall or rock.')
  }
  if (seen.has('gates')) {
    lines.push('Gates & plates: map.gates and map.plates — floor switches open or toggle movable walls.')
  }
  if (seen.has('keys-and-doors')) {
    lines.push('Keys & doors: map.keys and map.doors — pick up keys by stepping on them to pass locked tiles.')
  }
  if (seen.has('bridge')) {
    lines.push('Bridge: map.bridge marks a gap that may be open or closed; use bridgeOpen sensor in while/if puzzles when relevant.')
  }
  if (seen.has('multi-loop')) {
    lines.push(
      'Multiple Repeat blocks: the solution may use TWO OR MORE separate loop instructions for different legs (e.g. march across, then climb).',
    )
  }
  if (seen.has('multi-move-loop-body')) {
    lines.push('Multi-move loop body: a single Repeat whose body is several moves (e.g. ["up","right"]) that repeats as a unit.')
  }
  return lines
}

// Collect a lesson's authored sequence puzzles in the exemplar JSON shape the
// generator expects, so generated practice matches the lesson's real quality and
// style. Only `sequence` steps carry a playable map/solution; concept and other
// step types are skipped. Undefined fields are omitted rather than written as
// explicit `undefined`, keeping the prompt JSON compact.
function authoredExemplarsForLesson(lesson: Lesson): object[] {
  const exemplars: object[] = []
  for (const step of lesson.steps) {
    if (!isSequenceStep(step)) continue
    const exemplar: Record<string, unknown> = {
      map: step.map,
      availableCommands: step.availableCommands,
      solution: step.solution,
    }
    if (step.blocks !== undefined) exemplar.blocks = step.blocks
    if (step.predicateOptions !== undefined) exemplar.predicateOptions = step.predicateOptions
    if (step.loopRange !== undefined) exemplar.loopRange = step.loopRange
    if (step.cardLimits !== undefined) exemplar.cardLimits = step.cardLimits
    if (step.availableActions !== undefined) exemplar.availableActions = step.availableActions
    if (step.prompt !== undefined) exemplar.prompt = step.prompt
    if (step.goal !== undefined) exemplar.goal = step.goal
    if (step.feedback?.hints !== undefined) exemplar.hints = step.feedback.hints
    exemplars.push(exemplar)
  }
  return exemplars
}

// Build the generation template for a lesson's endless practice, generalizing
// what PracticePage constructs by hand. Returns null when the lesson has no
// generator concept, signalling the caller to fall back to authored practice.
export function buildPracticeTemplate(
  lesson: Lesson,
  opts: { direction: DifficultyDirection; priorGenerated?: object[]; avoid?: string[] },
): PuzzleTemplate | null {
  const concept = conceptForLesson(lesson)
  if (concept === null) return null
  const sessionPrior = priorGeneratedExemplars(lesson.id)
  const mergedPrior = [...sessionPrior, ...(opts.priorGenerated ?? [])].slice(-8)
  return {
    rows: 6,
    cols: 6,
    availableCommands: ['up', 'down', 'left', 'right'],
    band: bandForDirection(opts.direction),
    targetLevel: targetLevelForDirection(opts.direction),
    successRule: 'reachGoal',
    theme: lesson.title,
    concept,
    avoid: opts.avoid ?? [],
    authoredExemplars: authoredExemplarsForLesson(lesson),
    priorGenerated: mergedPrior,
    mechanicsGuide: mechanicsGuideForLesson(lesson),
  }
}

// A level-3 (easier) practice template for the same concept the lesson teaches,
// for the "Try a smaller version" scaffold. Returns null when the lesson has no
// generator concept (caller falls back to the ghost hint). buildPracticeTemplate
// already maps 'easier' to targetLevel 3 + the easier band, so this is a thin
// wrapper.
export function smallerVariantTemplate(lesson: Lesson): PuzzleTemplate | null {
  const template = buildPracticeTemplate(lesson, { direction: 'easier' })
  if (!template) return null
  // The remediation variant is a one-off easy puzzle, not part of the endless
  // practice stream, so anti-repetition is irrelevant here. Crucially, drop the
  // session "already generated" history: it fills up once the "Keep practicing"
  // prefetch fires (past the lesson's midpoint — exactly the state a resuming
  // learner returns to), and a non-empty priorGenerated tells the model to make
  // the puzzle structurally different from all of them, which over-constrains an
  // intentionally-easy puzzle into abstaining. Stripping it makes the variant
  // generate identically whether starting fresh or resuming.
  return { ...template, priorGenerated: [] }
}

export function authoredStepToPuzzle(
  step: SequenceStep | ConditionalStep,
  lesson: Lesson,
  moves: number,
): GeneratedPuzzle {
  const lessonConcept = conceptForLesson(lesson)
  const concept: GeneratedConcept =
    lessonConcept && lessonConcept !== 'mixed' ? lessonConcept : 'navigation'
  return {
    map: step.map,
    availableCommands: step.availableCommands,
    availableActions: step.availableActions,
    blocks: step.blocks,
    predicateOptions: step.predicateOptions,
    loopRange: step.loopRange,
    cardLimits: step.cardLimits,
    solution: step.solution,
    feedback: step.feedback,
    optimal: moves,
    difficulty: moves,
    concept,
    aiGenerated: true,
  }
}

export function authoredPracticeStep(
  step: SequenceStep | ConditionalStep,
  lesson: Lesson,
): SequenceStep | null {
  const run = runInstructions(step.map, step.solution)
  if (run.status !== 'success') return null
  return toPracticeStep(authoredStepToPuzzle(step, lesson, run.path.length - 1), lesson)
}

// A deterministic, AI-free "smaller version": the lesson's own simplest authored
// play step, converted to the GeneratedPuzzle shape. Prefers mechanic-bearing steps
// so the smaller version keeps the lesson's mechanics; falls back to fewest-move
// overall when no mechanic-bearing step is runnable.
// Sequence steps only — toPracticeStep forces a reachGoal sequence, which would
// silently drop a conditional step's requiresConditional rule and let a flat path
// pass; restricting here mirrors authoredPracticeFloor's kind:'sequence'.
// Returns null only when the lesson has no runnable authored sequence step.
export function deriveSmallerVariantPuzzle(lesson: Lesson): GeneratedPuzzle | null {
  type Candidate = { step: SequenceStep; moves: number; hasMechanic: boolean }
  const runnable: Candidate[] = []
  for (const step of lesson.steps) {
    if (!isSequenceStep(step)) continue
    const run = runInstructions(step.map, step.solution)
    if (run.status !== 'success') continue
    runnable.push({
      step,
      moves: run.path.length - 1,
      hasMechanic: mapMechanicsFromStep(step.map, step.availableActions).length > 0,
    })
  }
  if (runnable.length === 0) return null
  const mechanicBearing = runnable.filter((c) => c.hasMechanic)
  const pool = mechanicBearing.length > 0 ? mechanicBearing : runnable
  const best = pool.reduce((a, b) => (b.moves < a.moves ? b : a))
  return authoredStepToPuzzle(best.step, lesson, best.moves)
}

export function toPracticeStep(puzzle: GeneratedPuzzle, lesson: Lesson): SequenceStep {
  counter += 1
  const step: SequenceStep = {
    id: `practice-${lesson.id}-${Date.now().toString(36)}-${counter}`,
    type: 'sequence',
    goal: puzzle.goal ?? FALLBACK_GOAL,
    prompt: puzzle.prompt ?? FALLBACK_PROMPT,
    map: puzzle.map,
    availableCommands: puzzle.availableCommands ?? NAV_COMMANDS,
    availableActions: puzzle.availableActions,
    blocks: puzzle.blocks,
    predicateOptions: puzzle.predicateOptions,
    loopRange: puzzle.loopRange,
    cardLimits: puzzle.cardLimits,
    successRule: 'reachGoal',
    optimal: puzzle.optimal,
    feedback: puzzle.feedback ?? FALLBACK_FEEDBACK,
    // The solver-verified solution powers the "Watch Rico" demo and the leak guard.
    solution: puzzle.solution,
    aiGenerated: true,
    difficulty: puzzle.difficulty ?? puzzle.optimal,
  }
  return step
}
