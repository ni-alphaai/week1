import type { Step } from '../types'

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
}

export interface SkillStat {
  attempts: number
  correct: number
  struggles: number
}

export interface StepStat {
  incorrect: number
  solved: boolean
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
  }
}
