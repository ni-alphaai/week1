// Background prefetch for the Daily Review.
//
// Review generation is a slow reasoning-model round trip, and the review queue
// holds one lesson per due skill. Generating on entry (and again on every "Next
// review") makes the page feel stuck. We warm one puzzle per due lesson in the
// background — kicked off from the Home dashboard the moment the review card is
// shown, and again for the next lesson while the learner solves the current one
// — so navigating into review (and advancing through it) feels instant.

import type { Lesson } from '../types'
import type { LearnerState } from '../storage/types'
import { generatePuzzle, REVIEW_GEN_OPTS } from './generation'
import type { GeneratedPuzzle } from './generation'
import { getLesson } from '../content/registry'
import { buildPracticeTemplate, conceptForLesson } from '../content/generated'
import { difficultyForBox } from '../adaptivity/leitner'
import type { Box } from '../adaptivity/leitner'

// How many upcoming review puzzles to keep warming in the background so the
// learner gets an instant puzzle on entry and on every "Next review".
const REVIEW_PREFETCH_DEPTH = 3

// Each due lesson appears once in the queue, so a per-lesson cache is enough.
const cache = new Map<string, Promise<GeneratedPuzzle | null>>()

// Derive the difficulty direction from the learner's Leitner box for the skill.
// difficultyForBox returns 3/4/5, matching TARGET_LEVELS (easier=3, same=4, harder=5).
function directionForBox(box: Box): 'easier' | 'same' | 'harder' {
  const level = difficultyForBox(box)
  if (level <= 3) return 'easier'
  if (level === 4) return 'same'
  return 'harder'
}

// Build the verified review puzzle for a lesson at the box-appropriate difficulty,
// using the small, fast review budget. Never throws — resolves to null when the
// lesson has no generator concept or generation abstains.
// Only invoked when aiGenerationOn() is true.
function requestReviewPuzzle(
  lesson: Lesson,
  box: Box,
): Promise<GeneratedPuzzle | null> {
  if (conceptForLesson(lesson) === null) return Promise.resolve(null)
  const direction = directionForBox(box)
  const template = buildPracticeTemplate(lesson, { direction })
  if (!template) return Promise.resolve(null)
  return generatePuzzle(template, REVIEW_GEN_OPTS).catch(() => null)
}

// Start (or reuse) a background generation for `lesson` at `box` difficulty and
// return its promise. Idempotent per lesson, so calling it from both Home and
// the review loop shares one in-flight request.
// Only call when aiGenerationOn() is true.
export function warmReview(lesson: Lesson, state: LearnerState | null, box: Box = 1): Promise<GeneratedPuzzle | null> {
  const existing = cache.get(lesson.id)
  if (existing) return existing
  // Derive box from state if not supplied explicitly.
  const resolvedBox: Box = (() => {
    if (box !== 1) return box
    if (!state) return 1
    // Find the first skill this lesson teaches and read its box.
    for (const skillId of lesson.skillIds) {
      const entry = state.review?.boxes?.[skillId]
      if (entry) return entry.box
    }
    return 1
  })()
  const pending = requestReviewPuzzle(lesson, resolvedBox)
  cache.set(lesson.id, pending)
  return pending
}

// Warm up to `depth` reviewable lessons starting at queue position `from`,
// skipping any that have no generator concept. Used to cache several puzzles up
// front (from Home) and to keep the next few warm as the learner advances.
export function warmReviewAhead(
  queue: string[],
  from: number,
  state: LearnerState | null,
  depth = REVIEW_PREFETCH_DEPTH,
): void {
  let warmed = 0
  for (let i = from; i < queue.length && warmed < depth; i++) {
    const lesson = getLesson(queue[i])
    if (lesson && conceptForLesson(lesson) !== null) {
      void warmReview(lesson, state)
      warmed++
    }
  }
}

// Drop a lesson's cached puzzle so the next visit regenerates a fresh one
// (called after the learner solves that review).
export function clearReview(lessonId?: string): void {
  if (lessonId) cache.delete(lessonId)
  else cache.clear()
}
