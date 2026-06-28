import type { Step } from '../types'
import type { Box } from '../adaptivity/leitner'

export interface LearnerProfile {
  id: string
  displayName: string
  createdAt: number
}

export interface LessonProgress {
  lessonId: string
  lessonVersion: number
  status: 'in_progress' | 'completed'
  currentStepId: string
  completedStepIds: string[]
  startedAt: number
  updatedAt: number
  completedAt: number | null
  // Serialized composable program tree (ProgramNode[]) per step id.
  savedPrograms: Record<string, unknown>
  /** ms timestamp the current step became active (for time-on-task accounting). */
  openedAt: number | null
}

export interface SkillStat {
  attempts: number
  correct: number
  struggles: number
  /** Where attempts came from. Defaults to 'lesson' for pre-existing records. */
  source: 'lesson' | 'practice'
  /** Practice-only attempts (excludes lesson attempts). */
  practiceAttempts: number
  /** Practice-only correct (excludes lesson correct). */
  practiceCorrect: number
  /** ms timestamp of the most recent correct answer; null when never correct or unknown. */
  lastCorrectAt: number | null
}

export interface StepStat {
  incorrect: number
  solved: boolean
  source: 'lesson' | 'practice'
  /** Accumulated wall-clock time spent on this step, in ms. */
  timeSpentMs: number
}

export interface ReviewState {
  /** skillId -> ms timestamp of last review. */
  lastReviewedAt: Record<string, number>
  /** YYYY-MM-DD of the last due-queue refresh (local day). */
  lastDueDate: string | null
  /** lesson ids due for review. */
  dueQueue: string[]
  /** Per-skill Leitner box tracking. */
  boxes: Record<string, { box: Box; lastReviewedAt: number }>
}

export interface AiUsage {
  explainRequested: number
  explainServed: number
  explainFallback: number
  explainLeakBlocked: number
  genServed: number
  genAbstained: number
}

export interface StreakState {
  current: number
  longest: number
  lastCompletedDate: string | null
}

export interface PortfolioArtifact {
  id: string
  lessonId: string
  lessonTitle: string
  stepId: string
  commands: Step[]
  createdAt: number
}

export interface LearnerState {
  learnerId: string
  completedLessonIds: string[]
  lessonProgress: Record<string, LessonProgress>
  skillStats: Record<string, SkillStat>
  stepStats: Record<string, StepStat>
  streak: StreakState
  portfolio: PortfolioArtifact[]
  /** Earned achievement ids (e.g. 'algorithm-ace'). */
  badges: string[]
  /** Epoch ms when each badge id was earned; legacy badges may be absent. */
  badgeAcquiredAt: Record<string, number>
  review: ReviewState
  aiUsage: AiUsage
}

export function emptyLearnerState(learnerId: string): LearnerState {
  return {
    learnerId,
    completedLessonIds: [],
    lessonProgress: {},
    skillStats: {},
    stepStats: {},
    streak: { current: 0, longest: 0, lastCompletedDate: null },
    portfolio: [],
    badges: [],
    badgeAcquiredAt: {},
    review: { lastReviewedAt: {}, lastDueDate: null, dueQueue: [], boxes: {} },
    aiUsage: {
      explainRequested: 0,
      explainServed: 0,
      explainFallback: 0,
      explainLeakBlocked: 0,
      genServed: 0,
      genAbstained: 0,
    },
  }
}
