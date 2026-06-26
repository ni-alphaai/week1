# Batch 4 — Parent deep-dive + achievements

Date: 2026-06-26
Status: Draft (awaiting review)
Depends on: Batch 1 (`recordPracticeResult`, `practice*` counters, `source` tag)
Features: #5 Parent struggle-signal deep-dive, #11 Achievement extensions

## Problem

- **#5:** The README promises "struggle signals" and the Parent dashboard
  (`src/pages/ParentPage.tsx`) shows skill bars, a puzzle-outcome donut, streaks,
  and badges — but it never tells a parent *where* the kid is stuck. `stepStats`
  already tracks `incorrect`/`solved` per step, yet no "stuck on" list, no
  time-per-step, and no per-skill struggle breakdown is surfaced. The promise is
  unfulfilled.
- **#11:** Badges today come only from `lesson.award` (capstone / combo) and the
  algorithm-ace from lesson 6. There's no recognition for the behaviours that
  matter most at this age: practising consistently, using a new block type for
  the first time, recovering from struggle, or solving efficiently.

## Goals

1. Give a parent a focused "where they're stuck" view backed by data the app
   already keeps, plus light time-per-step tracking.
2. Add a small, well-defined achievement system with clear triggers, awarded
   inline (toast) and shown on the Parent dashboard.

## Non-goals

- A badge-authoring UI. Badges are code in `src/content/badges.ts`.
- Push notifications / email reports.
- Rebuilding the Parent dashboard layout — extend the existing sections.

## Design

### #5 Parent struggle-signal deep-dive (first)

**Time tracking** — `src/storage/types.ts`:

- Add `timeSpentMs: number` to `StepStat` (accumulated wall-clock on the step
  across sessions). Add `openedAt: number | null` to `LessonProgress` (the
  timestamp the current step became active) — kept in memory + persisted so a
  refresh doesn't lose the timer.

`src/storage/progress.ts`:

- `setCurrentStep` stamps `openedAt`.
- `recordSequenceResult` / `recordPracticeResult` (Batch 1) add
  `now - openedAt` (clamped to a sane max, e.g. 10 min, to avoid counting idle
  background time) to that step's `timeSpentMs` and clear `openedAt` on solve.
- A `tickTimers(state, now)` pure helper closes any open step timer on
  sign-out/page-hide (called from `LearnerContext`).

**Selectors** — `src/storage/progress.ts`:

```ts
export function stuckSteps(state: LearnerState, lesson: Lesson): StuckStep[]
export function skillStruggles(state: LearnerState): { skillId: string; struggles: number; incorrectSteps: number }[]
```

- `stuckSteps`: steps with `incorrect >= 2` and `!solved`, plus their
  `timeSpentMs`, lesson title, and the lesson they belong to (scan
  `listLessons()`).
- `skillStruggles`: per-skill `struggles` (already on `SkillStat`) + count of
  unsolved steps teaching that skill.

**Parent UI** — `src/pages/ParentPage.tsx`:

- New "Where {name} is stuck" card (only when `stuckSteps` non-empty): a list of
  lesson/step titles with "X tries · Y min" and a one-line plain-English read.
  Tapping a row is a no-op for the kid's privacy (parent view is read-only).
- Extend the existing Skills section with a small "extra tries" sparkline per
  skill using `skillStruggles` (the `struggles` count is already shown as text;
  this just makes the deep-dive visible).
- Keep the existing donut/streak/badges/portfolio cards; this is additive.

### #11 Achievement extensions (second; reuses #5's time tracking)

**Definitions** — new `src/content/badges.ts`:

```ts
export interface BadgeDef {
  id: string; title: string; blurb: string
  // Pure predicate over the post-action state + the action context.
  awardOn: (ctx: AwardCtx) => boolean
}
export interface AwardCtx {
  state: LearnerState
  lesson: Lesson
  stepId: string
  correct: boolean
  source: 'lesson' | 'practice'
  program: Instruction[]      // the solved program (for block-use badges)
  optimalSolved: boolean      // solved a shortestPath puzzle at optimal
  priorIncorrect: number      // incorrect count before this solve
  solveMs: number             // time to this solve (from #5 time tracking)
}
export const BADGES: BadgeDef[]
```

Initial set (kept small and concrete):

- `first-loop` — solved a program containing a `loop` block (first time).
- `first-while` — solved one containing a `while`.
- `first-if` — solved one containing a `conditional`.
- `practice-5` / `practice-20` — 5 / 20 practice puzzles solved (Batch 1's
  `practiceCorrect` counter).
- `comeback-kid` — solved a step after `priorIncorrect >= 3`.
- `optimal-solver` — `optimalSolved` true on a `shortestPath` step.
- `speedy` — `solveMs < 30000` on a solved step.

**Award logic** — `src/context/LearnerContext.tsx`:

- After `recordSequenceResult` and `recordPracticeResult`, build `AwardCtx` from
  the prior state + the action, evaluate every `BADGES[].awardOn`, and push any
  newly-earned ids into `state.badges` (dedup). Return the list of newly earned
  badges so the page can toast.
- A new `useBadgeToast()` hook (or a context field `pendingBadges`) surfaces a
  confetti-style toast in `LessonPage` / `PracticePage` / `ReviewPage` when a
  badge is earned mid-session.

**Display** — `src/pages/ParentPage.tsx`:

- Extend the existing `BADGE_LABELS` map with the new ids; the existing badges
  section already renders any id in `state.badges`, so no structural change —
  just richer labels and a "locked" preview row showing badges not yet earned
  (greyed, with the blurb as a goal).

## Alternatives considered

- **Per-step time tracking via a background timer.** Rejected: heavy and
  privacy-iffy. `openedAt` + close-on-solve + close-on-hide is enough and stays
  in the existing persistence layer.
- **Badges as a cloud function.** Rejected: pure predicates over local state;
  no need for server logic or cross-device sync beyond what Batch 1 persists.
- **A big badge tree / unlock paths.** Rejected: 7 concrete badges beat a vague
  taxonomy. Easy to add more later by appending to `BADGES`.

## Testing

- `progress.test.ts`: `timeSpentMs` accumulates and clamps; `openedAt` cleared on
  solve; `tickTimers` closes open timers; `stuckSteps` / `skillStruggles` shape.
- `badges.test.ts`: each `awardOn` fires exactly once at the right threshold and
  never re-fires for the same badge; `first-*` badges require the block present
  in the solved program.
- `LearnerContext` test: a solve that triggers a badge pushes exactly one id and
  surfaces it via `pendingBadges`.
- `ParentPage` test: "Where stuck" card renders when stuck steps exist and is
  absent otherwise; locked badge previews show.

## Open decisions (flag for reviewer)

1. **Idle-time clamp.** Proposed 10 min cap per step-session so leaving a tab
   open doesn't inflate "time spent". Confirm.
2. **Badge toast frequency.** Proposed: one toast per earned badge, queued if
   several fire at once. No setting to disable in this batch.
3. **Locked-badge previews on Parent.** Proposed: show greyed un-earned badges
   as goals. Some parents prefer not to preview; easy to gate behind a flag.

## Files touched

#5 (first):
- `src/storage/types.ts` — `timeSpentMs` on `StepStat`, `openedAt` on `LessonProgress`.
- `src/storage/progress.ts` — timer stamp/close, `tickTimers`, `stuckSteps`, `skillStruggles`.
- `src/context/LearnerContext.tsx` — call `tickTimers` on hide/signOut.
- `src/pages/ParentPage.tsx` — "Where stuck" card + skills deep-dive.

#11 (second; reuses #5):
- `src/content/badges.ts` — new: `BadgeDef`, `AwardCtx`, `BADGES`.
- `src/context/LearnerContext.tsx` — award evaluation after record*, `pendingBadges`.
- `src/components/BadgeToast.tsx` — new toast (or extend `Confetti` usage).
- `src/pages/LessonPage.tsx`, `src/pages/PracticePage.tsx`, `src/pages/ReviewPage.tsx` — toast host.
- `src/pages/ParentPage.tsx` — richer `BADGE_LABELS` + locked previews.

Sequencing note: #5 lands before #11 because #11's `speedy` badge needs #5's
`solveMs`, and both reshape `ParentPage.tsx` + `LearnerContext.tsx` — doing them
in one agent (sequenced) avoids merge conflicts.
