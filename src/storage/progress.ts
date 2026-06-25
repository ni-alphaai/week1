import type { Course, Lesson, Step } from '../types'
import type { LearnerState, SkillStat, StepStat } from './types'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
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

  for (const skillId of lesson.skillIds) {
    const stat: SkillStat = next.skillStats[skillId] ?? { attempts: 0, correct: 0, struggles: 0 }
    stat.attempts += 1
    if (correct) stat.correct += 1
    next.skillStats[skillId] = stat
  }

  const stepStat: StepStat = next.stepStats[stepId] ?? { incorrect: 0, solved: false }

  if (correct) {
    if (!stepStat.solved) {
      stepStat.solved = true
      next.portfolio.unshift({
        id: `art_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        stepId,
        commands,
        createdAt: Date.now(),
      })
    }
    next.stepStats[stepId] = stepStat
    markStepCompleteInPlace(next, lesson, stepId)
    updateStreakInPlace(next)
  } else {
    stepStat.incorrect += 1
    // Struggle signal: 2+ incorrect attempts on the same question (counted once).
    if (stepStat.incorrect === 2) {
      for (const skillId of lesson.skillIds) {
        const stat: SkillStat = next.skillStats[skillId] ?? { attempts: 0, correct: 0, struggles: 0 }
        stat.struggles += 1
        next.skillStats[skillId] = stat
      }
    }
    next.stepStats[stepId] = stepStat
  }

  progress.updatedAt = Date.now()
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
  if (score >= 80) return 'Skilled'
  if (score >= 60) return 'Apprentice'
  return 'Novice'
}

export function resumeStepId(lesson: Lesson, completedStepIds: string[]): string {
  const firstUnfinished = lesson.steps.find((step) => !completedStepIds.includes(step.id))
  return firstUnfinished?.id ?? lesson.steps[lesson.steps.length - 1]?.id ?? ''
}
