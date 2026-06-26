# Batch 3 — Adaptive learning (smaller variant + spaced repetition)

Date: 2026-06-26
Status: Draft (awaiting review)
Depends on: Batch 1 (practice → mastery persistence + `recordPracticeResult`)
Features: #4 "Try a smaller version" scaffold, #6 Spaced-repetition review queue

## Problem

- **#4:** When a kid is stuck, the only escalation past text hints is "Watch Rico
  show you" — the solution replayed. That gives away the answer without building
  the kid's own mastery. There's no intermediate "try an easier version of the
  same idea, then come back" step, which is the most effective scaffolding move.
- **#6:** Mastery is computed from raw `attempts/correct` with no notion of
  time. A skill solved perfectly two weeks ago still reads "Master", so the
  dashboard overstates retention and there's no mechanism to revisit decaying
  skills. There is no review queue or "daily mix".

## Goals

1. Offer a verified, *easier* variant of the current lesson's concept when a kid
   exhausts hints, without revealing the original answer; let them return to the
   original step afterward.
2. Add time-aware mastery decay and a daily review queue that resurfaces skills
   slipping out of the success band, using the practice generator already in
   place.

## Non-goals

- Authoring per-step easier variants by hand (the generator already produces
  verified easier puzzles via `targetLevel: 3`).
- A full SR algorithm (SM-2 / FSRS). A simple, transparent half-life decay is
  enough for 5th-grade retention and is easy to reason about.
- Rebuilding the practice player. Review reuses the generation + engine stack.

## Design

### #4 "Try a smaller version" scaffold

Agent A owns the hint-escalation aside in `src/pages/LessonPage.tsx`.

- Trigger: when `canShowGhost` is true (text hints exhausted) **and**
  `aiGenerationEnabled && conceptForLesson(lesson) !== null`, show a third
  button "Try a smaller version" next to "Watch Rico show you". Authored-only
  lessons (no concept) hide it; the ghost remains the fallback there.
- Action: call `buildPracticeTemplate(lesson, { direction: 'easier' })` (already
  exists in `src/content/generated.ts`) and `generatePuzzle(template)`. The
  `easier` direction targets level 3 with the `PRACTICE_BANDS.easier` move band
  (`src/adaptivity/difficulty.ts`). On success, swap the workspace into a
  "smaller version" mode: render the easier puzzle in the same `MapGrid` +
  `CommandSequence` (a temporary `SequenceStep` via `toPracticeStep`), with a
  sticky "Back to your puzzle" bar.
- On solve of the smaller version: show encouraging feedback, then the kid
  returns to the original step (their saved program is untouched — it was
  persisted via `saveProgram`). The smaller solve is recorded with
  `recordPracticeResult` (Batch 1) so it feeds mastery.
- On generation failure (abstain): the button silently falls back to the ghost
  path — never surfaces a "couldn't make a puzzle" error mid-lesson. A toast
  says "No smaller version right now — watch Rico instead."
- Prefetch: kick off the smaller-variant generation when `canShowGhost` first
  becomes true (not on every press), cached in a ref so the button is instant.

No new engine code; reuses `generatePuzzle`, `buildPracticeTemplate`,
`toPracticeStep`, `registerGeneratedPuzzle`, `recordPracticeResult`.

### #6 Spaced-repetition review queue

Agent B owns the review surface; Batch 1's `recordPracticeResult` is the write
path.

**Decay** — `src/adaptivity/mastery.ts`:

```ts
export function decayedSuccessRate(stat: SkillStat, now: number): number
export function dueSkills(state: LearnerState, now: number): string[]
```

- `decayedSuccessRate`: blend raw `correct/attempts` with a time half-life —
  e.g. effective rate = rawRate × 0.5^((daysSinceLastCorrect) / 14). A skill
  solved 14 days ago counts half; 28 days, a quarter. Pure function, no I/O.
- `dueSkills`: skillIds where `decayedSuccessRate < SUCCESS_BAND.low` (0.7) **or**
  not seen in 7 days, ordered by lowest decayed rate. Cap at 3 per day.

**State** — `src/storage/types.ts` (review-specific section, additive):

```ts
interface ReviewState {
  lastReviewedAt: Record<string, number>   // skillId -> ms
  lastDueDate: string | null                // YYYY-MM-DD of last due computation
}
```

Added to `LearnerState.review`; `emptyLearnerState` seeds it. Batch 1's `migrate`
handles old states.

**Queue build** — `src/context/LearnerContext.tsx` adds `refreshReviewQueue()`
that, once per local day, calls `dueSkills`, maps each due skill to a lesson
that teaches it (scan `listLessons()` for `skillIds` containing it and a
non-null `conceptForLesson`), and stashes the lesson ids in
`state.review.dueQueue` (reused field). Runs on `HomePage` mount.

**Review page** — `src/pages/ReviewPage.tsx` (new):

- Reads the due queue; for the top due lesson, builds a practice puzzle via
  `buildPracticeTemplate(lesson, { direction: nextDifficultyDirection(decayedRate) })`
  and renders a `PracticePage`-style workspace (map + editor + run + feedback).
- On solve: `recordPracticeResult(lesson, stepId, correct)` + set
  `review.lastReviewedAt[skillId] = now`. Next puzzle or "All caught up" screen
  when the queue empties.
- No prefetch chaining needed (queue is short); reuse the single-shot
  `requestPuzzle` pattern.

**Entry** — `src/App.tsx` adds `/review`; `src/pages/HomePage.tsx` shows a
"Daily review" card when `review.dueQueue` is non-empty (badge with count).

## Alternatives considered

- **Hand-authored easier variants per step.** Rejected: high authoring cost,
  drift; the verified generator already targets level 3 cleanly.
- **SM-2/FSRS spaced repetition.** Rejected: opaque, over-engineered for the
  age group and data volume. The half-life model is one readable formula.
- **Review using authored steps instead of generated puzzles.** Rejected for
  concept lessons: authored steps are finite and would repeat; the generator
  gives fresh puzzles per review. Navigation lessons (no concept) fall back to
  re-serving an authored step.

## Testing

- `mastery.test.ts`: `decayedSuccessRate` half-life math; `dueSkills` ordering
  and the 7-day / below-band rules; cap at 3.
- `generated.test.ts`: `buildPracticeTemplate` with `direction: 'easier'`
  produces a level-3 template (existing — extend if needed).
- `reviewPage` smoke test: due queue renders a puzzle; solve records practice +
  updates `lastReviewedAt`; empty queue shows the caught-up screen.
- `lessonPage` test: "Try a smaller version" appears only when AI + concept
  present and hints exhausted; abstain falls back to ghost.

## Open decisions (flag for reviewer)

1. **Half-life constant.** Proposed 14 days. Tunable in one place.
2. **Daily review cap.** Proposed 3 skills/day to stay bite-sized for 10-year-
   olds. Confirm.
3. **Smaller-version placement.** Proposed: a sibling button to "Watch Rico",
   shown only after hints exhausted. Alternative: replace the ghost entirely.
   Proposal keeps the ghost for authored-only lessons and kids who want the
   answer shown.

## Files touched

Agent A (#4):
- `src/pages/LessonPage.tsx` — hint-aside "Try a smaller version" button +
  smaller-variant mode in the run workspace (disjoint from Batch 2 Agent A's
  run-workspace edits — coordinate via this spec).
- `src/content/generated.ts` — no change needed (`buildPracticeTemplate` exists);
  possibly a `smallerVariantTemplate(lesson)` convenience wrapper.

Agent B (#6):
- `src/adaptivity/mastery.ts` — `decayedSuccessRate`, `dueSkills`.
- `src/storage/types.ts` — `ReviewState` (additive, separate section).
- `src/storage/progress.ts` — `recordReview` + queue helpers (additive).
- `src/context/LearnerContext.tsx` — `refreshReviewQueue`, `recordReview`.
- `src/pages/ReviewPage.tsx` — new.
- `src/App.tsx` — `/review` route.
- `src/pages/HomePage.tsx` — Daily review card.

Shared with Batch 1: `storage/types.ts` and `LearnerContext.tsx` — Batch 1
lands first and lays the `source`/`aiUsage` schema; Batch 3 Agent B adds the
`review` section without touching Batch 1's fields.
