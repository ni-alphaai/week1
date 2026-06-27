// Module-level per-lesson prefetch queue for endless practice puzzles.
//
// Generation is slow (a reasoning-model round trip), so we keep a queue of
// upcoming puzzles warming in the background. The queue survives route changes
// (LessonPage → PracticePage) because React refs unmount with the page.
//
// Generations are chained sequentially per lesson so each new puzzle sees every
// prior one in the session history — parallel prefetches would duplicate style.

import type { GeneratedPuzzle } from './generation'
import { recordPracticePuzzle } from '../content/generated'

/** How many puzzles to keep generating ahead of the one the player is on. */
export const PREFETCH_QUEUE_DEPTH = 3

export interface PrefetchSlot {
  promise: Promise<GeneratedPuzzle | null>
  settled: boolean
}

const queues = new Map<string, PrefetchSlot[]>()
// Serializes generations per lesson so puzzle N+1 sees puzzles 1..N in history.
const chains = new Map<string, Promise<unknown>>()

// Enqueue a generation behind any in-flight chain for this lesson. When it
// resolves, record the puzzle so the next chained request sees it as prior context.
function chainRequest(
  lessonId: string,
  requestFn: () => Promise<GeneratedPuzzle | null>,
): PrefetchSlot {
  const slot: PrefetchSlot = {
    promise: Promise.resolve(null),
    settled: false,
  }
  const prev = chains.get(lessonId) ?? Promise.resolve()
  const run = prev
    .then(() => requestFn())
    .catch(() => null as GeneratedPuzzle | null)
    .then((result) => {
      slot.settled = true
      if (result) recordPracticePuzzle(lessonId, result)
      return result
    })
  chains.set(lessonId, run.then(() => undefined))
  slot.promise = run
  return slot
}

// Fill the prefetch queue up to `depth` slots (default 2). Each slot chains
// after the previous so anti-repetition context stays accurate.
export function ensurePrefetchDepth(
  lessonId: string,
  requestFn: () => Promise<GeneratedPuzzle | null>,
  depth: number = PREFETCH_QUEUE_DEPTH,
): PrefetchSlot[] {
  const queue = queues.get(lessonId) ?? []
  while (queue.length < depth) {
    queue.push(chainRequest(lessonId, requestFn))
  }
  queues.set(lessonId, queue)
  return queue
}

// Remove and return the front of the prefetch queue (null if empty).
export function takePrefetched(lessonId: string): PrefetchSlot | null {
  const queue = queues.get(lessonId) ?? []
  const slot = queue.shift() ?? null
  queues.set(lessonId, queue)
  return slot
}

export function clearPrefetch(lessonId: string): void {
  queues.delete(lessonId)
  chains.delete(lessonId)
}
