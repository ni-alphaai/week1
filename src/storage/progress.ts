import type { Course, Lesson, Step } from '../types'
import type { LearnerState, SkillStat, StepStat } from './types'
import { listLessons } from '../content/registry'
import { promote, reset } from '../adaptivity/leitner'

// Per-session cap on time-on-task accumulated from a single openedAt stamp, so
// a tab left open overnight can't inflate a step's timeSpentMs unbounded.
const MAX_STEP_MS = 10 * 60 * 1000

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function emptySkillStat(): SkillStat {
  return {
    attempts: 0,
    correct: 0,
    struggles: 0,
    source: 'lesson',
    practiceAttempts: 0,
    practiceCorrect: 0,
    lastCorrectAt: null,
  }
}

function emptyStepStat(): StepStat {
  return { incorrect: 0, solved: false, source: 'lesson', timeSpentMs: 0 }
}

// Migration-only views of the stats with every new field optional, so the
// "fill missing fields" passes typecheck under strict mode (the runtime objects
// from old persisted states may legitimately lack the newer fields).
type LegacySkillStat = {
  attempts: number
  correct: number
  struggles: number
  source?: 'lesson' | 'practice'
  practiceAttempts?: number
  practiceCorrect?: number
  lastCorrectAt?: number | null
}
type LegacyStepStat = {
  incorrect: number
  solved: boolean
  source?: 'lesson' | 'practice'
  timeSpentMs?: number
}
type LegacyLessonProgress = {
  openedAt?: number | null
}
type LegacyLearnerState = {
  badgeAcquiredAt?: Record<string, number>
}

function localDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function todayString(): string {
  return localDateString(new Date())
}

function yesterdayString(): string {
  const date = new Date()
  date.setDate(date.getDate() - 1)
  return localDateString(date)
}

function ensureLessonInPlace(state: LearnerState, lesson: Lesson): void {
  if (state.lessonProgress[lesson.id]) return
  state.lessonProgress[lesson.id] = {
    lessonId: lesson.id,
    lessonVersion: lesson.version,
    status: 'in_progress',
    currentStepId: lesson.steps[0]?.id ?? '',
    completedStepIds: [],
    startedAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
    savedPrograms: {},
    openedAt: Date.now(),
  }
}

function markStepCompleteInPlace(state: LearnerState, lesson: Lesson, stepId: string): void {
  const progress = state.lessonProgress[lesson.id]
  if (!progress.completedStepIds.includes(stepId)) {
    progress.completedStepIds.push(stepId)
  }
  const allDone = lesson.steps.every((step) => progress.completedStepIds.includes(step.id))
  if (allDone && progress.status !== 'completed') {
    progress.status = 'completed'
    progress.completedAt = Date.now()
    if (!state.completedLessonIds.includes(lesson.id)) {
      state.completedLessonIds.push(lesson.id)
    }
    if (lesson.award && !state.badges.includes(lesson.award.id)) {
      state.badges.push(lesson.award.id)
      state.badgeAcquiredAt ??= {}
      state.badgeAcquiredAt[lesson.award.id] = progress.completedAt ?? Date.now()
    }
  }
}

function updateStreakInPlace(state: LearnerState): void {
  const today = todayString()
  if (state.streak.lastCompletedDate === today) return
  state.streak.current = state.streak.lastCompletedDate === yesterdayString() ? state.streak.current + 1 : 1
  state.streak.longest = Math.max(state.streak.longest, state.streak.current)
  state.streak.lastCompletedDate = today
}

export function ensureLesson(state: LearnerState, lesson: Lesson): LearnerState {
  const next = clone(state)
  ensureLessonInPlace(next, lesson)
  return next
}

export function setCurrentStep(state: LearnerState, lessonId: string, stepId: string): LearnerState {
  if (!state.lessonProgress[lessonId]) return state
  const next = clone(state)
  next.lessonProgress[lessonId].currentStepId = stepId
  // Start the timer for the newly-active step.
  next.lessonProgress[lessonId].openedAt = Date.now()
  next.lessonProgress[lessonId].updatedAt = Date.now()
  return next
}

export function saveProgram(
  state: LearnerState,
  lessonId: string,
  stepId: string,
  program: unknown,
): LearnerState {
  if (!state.lessonProgress[lessonId]) return state
  const next = clone(state)
  next.lessonProgress[lessonId].savedPrograms[stepId] = program
  next.lessonProgress[lessonId].updatedAt = Date.now()
  return next
}

export function completeConcept(state: LearnerState, lesson: Lesson, stepId: string): LearnerState {
  const next = clone(state)
  ensureLessonInPlace(next, lesson)
  markStepCompleteInPlace(next, lesson, stepId)
  next.lessonProgress[lesson.id].updatedAt = Date.now()
  return next
}

export function recordSequenceResult(
  state: LearnerState,
  lesson: Lesson,
  stepId: string,
  correct: boolean,
  commands: Step[],
): LearnerState {
  const next = clone(state)
  ensureLessonInPlace(next, lesson)
  const progress = next.lessonProgress[lesson.id]
  const now = Date.now()
  const elapsed = progress.openedAt != null ? Math.min(Math.max(now - progress.openedAt, 0), MAX_STEP_MS) : 0

  for (const skillId of lesson.skillIds) {
    const stat: SkillStat = next.skillStats[skillId] ?? emptySkillStat()
    stat.attempts += 1
    if (correct) {
      stat.correct += 1
      stat.lastCorrectAt = now
    }
    next.skillStats[skillId] = stat
  }

  const stepStat: StepStat = next.stepStats[stepId] ?? emptyStepStat()
  stepStat.source = 'lesson'
  stepStat.timeSpentMs += elapsed

  if (correct) {
    if (!stepStat.solved) {
      stepStat.solved = true
      next.portfolio.unshift({
        id: `art_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        stepId,
        commands,
        createdAt: now,
      })
    }
    next.stepStats[stepId] = stepStat
    // Stop the timer once the step is solved.
    progress.openedAt = null
    markStepCompleteInPlace(next, lesson, stepId)
    updateStreakInPlace(next)
  } else {
    stepStat.incorrect += 1
    // Struggle signal: 2+ incorrect attempts on the same question (counted once).
    if (stepStat.incorrect === 2) {
      for (const skillId of lesson.skillIds) {
        const stat: SkillStat = next.skillStats[skillId] ?? emptySkillStat()
        stat.struggles += 1
        next.skillStats[skillId] = stat
      }
    }
    next.stepStats[stepId] = stepStat
  }

  progress.updatedAt = now
  return next
}

export function restartLesson(state: LearnerState, lesson: Lesson): LearnerState {
  const next = clone(state)
  next.lessonProgress[lesson.id] = {
    lessonId: lesson.id,
    lessonVersion: lesson.version,
    status: 'in_progress',
    currentStepId: lesson.steps[0]?.id ?? '',
    completedStepIds: [],
    startedAt: Date.now(),
    updatedAt: Date.now(),
    completedAt: null,
    savedPrograms: {},
    openedAt: Date.now(),
  }
  return next
}

export function lessonHasProgress(state: LearnerState, lessonId: string): boolean {
  const progress = state.lessonProgress[lessonId]
  if (!progress) return false
  return progress.completedStepIds.length > 0 || Object.keys(progress.savedPrograms).length > 0
}

// ----- Selectors -----

export function courseCompletionPercent(state: LearnerState, course: Course): number {
  const total = course.lessonOrder.length
  if (total === 0) return 0
  const done = course.lessonOrder.filter((id) => state.completedLessonIds.includes(id)).length
  return Math.round((done / total) * 100)
}

export function nextRecommendedLessonId(state: LearnerState, course: Course): string {
  const firstUnfinished = course.lessonOrder.find((id) => !state.completedLessonIds.includes(id))
  return firstUnfinished ?? course.lessonOrder[course.lessonOrder.length - 1]
}

export function masteryScore(stat: SkillStat | undefined): number {
  if (!stat || stat.attempts === 0) return 0
  return Math.round((stat.correct / stat.attempts) * 100)
}

export type MasteryTier = 'Novice' | 'Apprentice' | 'Skilled' | 'Master'

// Maps accuracy into a named tier, gated by a minimum number of attempts so a
// single lucky answer can't read as "Master".
export function masteryTier(stat: SkillStat | undefined): MasteryTier {
  if (!stat || stat.attempts < 2) return 'Novice'
  const score = masteryScore(stat)
  if (score >= 90 && stat.attempts >= 4) return 'Master'
  if (score >= 80 && stat.attempts >= 3) return 'Skilled'
  if (score >= 60) return 'Apprentice'
  return 'Novice'
}

export function resumeStepId(lesson: Lesson, completedStepIds: string[]): string {
  const firstUnfinished = lesson.steps.find((step) => !completedStepIds.includes(step.id))
  return firstUnfinished?.id ?? lesson.steps[lesson.steps.length - 1]?.id ?? ''
}

// ----- Migration -----

// Fills missing fields on old persisted states so the rest of the app can
// assume the full schema. Deep-clones first so the input is never mutated.
export function migrate(state: LearnerState): LearnerState {
  const next = clone(state)
  for (const stat of Object.values(next.skillStats)) {
    const s = stat as LegacySkillStat
    if (s.source === undefined) s.source = 'lesson'
    if (s.practiceAttempts === undefined) s.practiceAttempts = 0
    if (s.practiceCorrect === undefined) s.practiceCorrect = 0
    if (s.lastCorrectAt === undefined) s.lastCorrectAt = null
  }
  for (const stat of Object.values(next.stepStats)) {
    const s = stat as LegacyStepStat
    if (s.source === undefined) s.source = 'lesson'
    if (s.timeSpentMs === undefined) s.timeSpentMs = 0
  }
  for (const prog of Object.values(next.lessonProgress)) {
    const p = prog as LegacyLessonProgress
    if (p.openedAt === undefined) p.openedAt = null
  }
  if (!next.review) {
    next.review = { lastReviewedAt: {}, lastDueDate: null, dueQueue: [], boxes: {} }
  }
  if (!next.review.boxes) {
    next.review.boxes = {}
  }
  if (!next.aiUsage) {
    next.aiUsage = {
      explainRequested: 0,
      explainServed: 0,
      explainFallback: 0,
      explainLeakBlocked: 0,
      genServed: 0,
      genAbstained: 0,
    }
  }
  if (!(next as LegacyLearnerState).badgeAcquiredAt) {
    next.badgeAcquiredAt = {}
  }
  return next
}

// ----- Practice & review -----

// Like recordSequenceResult, but for endless-practice puzzles: it updates skill
// and step stats (with source 'practice' on the step) but NEVER completes a
// lesson, pushes a portfolio artifact, or extends the streak.
export function recordPracticeResult(
  state: LearnerState,
  lesson: Lesson,
  stepId: string,
  correct: boolean,
  now = Date.now(),
): LearnerState {
  const next = clone(state)
  ensureLessonInPlace(next, lesson)
  const progress = next.lessonProgress[lesson.id]
  const elapsed = progress.openedAt != null ? Math.min(Math.max(now - progress.openedAt, 0), MAX_STEP_MS) : 0

  for (const skillId of lesson.skillIds) {
    const stat: SkillStat = next.skillStats[skillId] ?? emptySkillStat()
    stat.attempts += 1
    stat.practiceAttempts += 1
    if (correct) {
      stat.correct += 1
      stat.practiceCorrect += 1
      stat.lastCorrectAt = now
    }
    // The shared skill stat keeps source 'lesson'; only the step stat is 'practice'.
    next.skillStats[skillId] = stat
  }

  const stepStat: StepStat = next.stepStats[stepId] ?? emptyStepStat()
  stepStat.source = 'practice'
  stepStat.timeSpentMs += elapsed

  if (correct) {
    stepStat.solved = true
    progress.openedAt = null
  } else {
    stepStat.incorrect += 1
    if (stepStat.incorrect === 2) {
      for (const skillId of lesson.skillIds) {
        const stat: SkillStat = next.skillStats[skillId] ?? emptySkillStat()
        stat.struggles += 1
        next.skillStats[skillId] = stat
      }
    }
  }
  next.stepStats[stepId] = stepStat
  progress.updatedAt = now
  return next
}

// A spaced-review attempt: same stats as practice, plus a last-reviewed stamp
// on the skill so the due queue can defer it, and a Leitner box move.
export function recordReview(
  state: LearnerState,
  lesson: Lesson,
  skillId: string,
  stepId: string,
  correct: boolean,
  now = Date.now(),
): LearnerState {
  const next = recordPracticeResult(state, lesson, stepId, correct, now)
  next.review = next.review ?? { lastReviewedAt: {}, lastDueDate: null, dueQueue: [], boxes: {} }
  next.review.lastReviewedAt = { ...next.review.lastReviewedAt, [skillId]: now }
  const prevBox = next.review.boxes[skillId]?.box ?? 1
  next.review.boxes = {
    ...next.review.boxes,
    [skillId]: { box: correct ? promote(prevBox) : reset(), lastReviewedAt: now },
  }
  return next
}

// ----- Timers & due queue -----

// Flushes accumulated time-on-task for every step whose timer is running, then
// resets openedAt to `now` so timing stays live. Used on page-hide / sign-out.
export function tickTimers(state: LearnerState, now = Date.now()): LearnerState {
  const next = clone(state)
  for (const prog of Object.values(next.lessonProgress)) {
    if (prog.openedAt == null) continue
    const elapsed = Math.min(Math.max(now - prog.openedAt, 0), MAX_STEP_MS)
    const stepStat: StepStat = next.stepStats[prog.currentStepId] ?? emptyStepStat()
    stepStat.timeSpentMs += elapsed
    next.stepStats[prog.currentStepId] = stepStat
    prog.openedAt = now
  }
  return next
}

// ----- Struggle selectors -----

export interface StuckStep {
  lessonId: string
  lessonTitle: string
  stepId: string
  incorrect: number
  timeSpentMs: number
}

// Authored steps the learner has failed twice or more and not yet solved.
export function stuckSteps(state: LearnerState): StuckStep[] {
  const out: StuckStep[] = []
  for (const lesson of listLessons()) {
    for (const step of lesson.steps) {
      const stat = state.stepStats[step.id]
      if (stat && stat.incorrect >= 2 && !stat.solved) {
        out.push({
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          stepId: step.id,
          incorrect: stat.incorrect,
          timeSpentMs: stat.timeSpentMs ?? 0,
        })
      }
    }
  }
  out.sort((a, b) => b.incorrect - a.incorrect || b.timeSpentMs - a.timeSpentMs)
  return out
}

// Per-skill struggle roll-up: skills with recorded struggles or that back an
// unsolved stuck step.
export function skillStruggles(
  state: LearnerState,
): { skillId: string; struggles: number; incorrectSteps: number }[] {
  const incorrectBySkill = new Map<string, number>()
  for (const lesson of listLessons()) {
    for (const step of lesson.steps) {
      const stat = state.stepStats[step.id]
      if (stat && stat.incorrect >= 2 && !stat.solved) {
        for (const skillId of lesson.skillIds) {
          incorrectBySkill.set(skillId, (incorrectBySkill.get(skillId) ?? 0) + 1)
        }
      }
    }
  }
  const out: { skillId: string; struggles: number; incorrectSteps: number }[] = []
  for (const [skillId, stat] of Object.entries(state.skillStats)) {
    const incorrectSteps = incorrectBySkill.get(skillId) ?? 0
    if (stat.struggles > 0 || incorrectSteps > 0) {
      out.push({ skillId, struggles: stat.struggles, incorrectSteps })
    }
  }
  return out
}
