// Module-level, per-lesson cache for the "Try a smaller version" remediation
// puzzle.
//
// It is warmed in the background as soon as the learner reaches a play step.
// Because the cache lives at module scope (not in a component ref) it survives
// LessonPage's per-step remounts and is reused across every step of the lesson —
// the variant is a lesson-level easier puzzle, not a per-step one.
//
// Reliability + speed are the whole point here, because earlier the affordance
// would silently vanish whenever AI generation was slow or abstained. So every
// warm has TWO sources:
//   - a deterministic authored fallback (the lesson's simplest verified step),
//     available synchronously — this makes the variant ready *instantly*, and
//   - a background AI generation that, if/when it lands a fresh puzzle, upgrades
//     what we serve so repeated use stays varied.
//
// `ready` drives UI readiness (resolves immediately to the fallback). `consume`
// returns the best puzzle available at click time (the AI upgrade if it arrived,
// otherwise the fallback). The promise never rejects.

import type { Lesson } from '../types'
import type { GeneratedPuzzle } from './generation'
import { generatePuzzle, SMALLER_VARIANT_OPTS } from './generation'
import { smallerVariantTemplate, deriveSmallerVariantPuzzle } from '../content/generated'

interface VariantEntry {
  // Resolves as soon as a usable puzzle exists. The authored fallback is
  // available synchronously, so this is effectively immediate — the UI never
  // waits on the slow AI round-trip to mark the affordance ready.
  ready: Promise<GeneratedPuzzle | null>
  // The puzzle to actually serve on click: starts as the authored fallback and
  // is upgraded in place to the AI puzzle if/when generation lands a fresh one.
  best: GeneratedPuzzle | null
}

const cache = new Map<string, VariantEntry>()

// Start (once) the easier-variant warm for a lesson and cache it. Returns the
// readiness promise, or null when the lesson has no generator concept.
export function warmSmallerVariant(lesson: Lesson): Promise<GeneratedPuzzle | null> | null {
  const existing = cache.get(lesson.id)
  if (existing) return existing.ready

  const template = smallerVariantTemplate(lesson)
  if (!template) return null

  const fallback = deriveSmallerVariantPuzzle(lesson)
  const entry: VariantEntry = { ready: Promise.resolve(fallback), best: fallback }
  cache.set(lesson.id, entry)

  // Upgrade to a fresh AI puzzle in the background; failures keep the fallback.
  void generatePuzzle(template, SMALLER_VARIANT_OPTS)
    .catch(() => null)
    .then((aiPuzzle) => {
      // Ignore if this entry was superseded by a clear/re-warm in the meantime.
      if (cache.get(lesson.id) !== entry) return
      if (aiPuzzle) entry.best = aiPuzzle
    })

  return entry.ready
}

// The readiness promise for a lesson, or null if none has been warmed yet.
export function peekSmallerVariant(lessonId: string): Promise<GeneratedPuzzle | null> | null {
  return cache.get(lessonId)?.ready ?? null
}

// The puzzle to open on click: the freshest available (AI upgrade if it landed,
// else the authored fallback). Synchronous — the button is only clickable once
// `ready` has resolved, so a warmed entry always exists by then.
export function consumeSmallerVariant(lessonId: string): GeneratedPuzzle | null {
  return cache.get(lessonId)?.best ?? null
}

// Drop the cached variant so the next warm regenerates a fresh one — used after
// the learner consumes one (to vary the next), and after an abstain (to retry).
export function clearSmallerVariant(lessonId: string): void {
  cache.delete(lessonId)
}
