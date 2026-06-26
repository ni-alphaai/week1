# Batch 1 — Data Foundation (practice → mastery + telemetry)

Date: 2026-06-26
Status: Draft (awaiting review)
Features: #2 Persist practice → mastery, #13 Telemetry dashboarding

## Problem

Practice performance is session-only. `PracticePage.tsx` tracks attempts/correct
in a `sessionRef` and drives round-to-round adaptivity from it, but **never calls
`recordResult`**, so practice outcomes never reach `skillStats` / `stepStats`. A
kid who grinds 50 practice puzzles shows zero mastery growth on the Parent
dashboard, and adaptivity across *sessions* can't see practice history.

Meanwhile `src/ai/telemetry.ts` exists but only holds in-memory explain counters
that are never surfaced anywhere — and they reset on reload, so a parent
loading a fresh session sees nothing.

## Goals

1. Persist practice outcomes into the same `skillStats`/`stepStats` store lessons
   use, tagged so practice and lesson contributions are distinguishable.
2. Persist a small cumulative AI-usage summary so the Parent dashboard can show
   how often AI served vs. fell back vs. abstained, and so we can tune prompts.
3. Do not destabilize lesson completion, streaks, or the portfolio.

## Non-goals

- Changing the authored lesson flow or `recordSequenceResult` semantics.
- Per-event network analytics. Telemetry stays local + persisted (no PII).
- Redesigning the Parent dashboard layout (Batch 4 owns the deep-dive).

## Design

### Shared schema (lays groundwork for Batches 3 and 4)

`src/storage/types.ts`:

- Add `source: 'lesson' | 'practice'` to `SkillStat` and `StepStat`. Default
  existing records to `'lesson'` via a migration on load (see below).
- Add `practiceAttempts` / `practiceCorrect` to `SkillStat` as denormalized
  counters, so mastery can be computed either lesson-only or blended without
  re-scanning every step. Keep `attempts`/`correct` as the totals (lesson +
  practice) so existing `masteryScore` keeps working unchanged.
- Add `AiUsage` to `LearnerState`:
  `interface AiUsage { explainRequested, explainServed, explainFallback, explainLeakBlocked, genServed, genAbstained }` — all numbers.

`emptyLearnerState` seeds `aiUsage` with zeros and omits `source` (treated as
`'lesson'` by default).

### #2 Persist practice → mastery

New pure function in `src/storage/progress.ts`:

```ts
export function recordPracticeResult(
  state: LearnerState,
  lesson: Lesson,
  stepId: string,
  correct: boolean,
): LearnerState
```

Unlike `recordSequenceResult`, it:
- Updates `skillStats` for `lesson.skillIds` (attempts/correct + the new
  `practice*` counters + `source: 'practice'` on the touched stat).
- Records a `stepStats` entry keyed by `stepId` (synthetic `practice-…` ids are
  fine and never collide with real step ids), `source: 'practice'`.
- Does **not** call `markStepCompleteInPlace` (practice must never complete a
  lesson or push a portfolio artifact — those belong to authored steps).
- Does **not** call `updateStreakInPlace` (see Open decision below).

`LearnerContext` exposes it as `recordPracticeResult(lesson, stepId, correct)`.
`PracticePage.handleRun`'s end timer calls it (replacing the current
`sessionRef.current.attempts/correct` bump — keep `sessionRef` for in-session
adaptivity, but also persist). The synthetic `step.id` from `toPracticeStep` is
already unique per puzzle, so step stats don't collide across practice rounds.

Migration: a `migrate(state)` helper in `progress.ts` that fills missing
`source` fields with `'lesson'` and missing `aiUsage` with zeros, called once
inside `LearnerContext` after `loadState`. Keeps existing learners working.

### #13 Telemetry wiring + parent observability

- Extend `src/ai/telemetry.ts` with a `GenEvent` type
  (`'requested' | 'served' | 'abstained' | 'fallback'`) and `recordGen(event)`.
- `src/ai/explain.ts` already calls `recordExplain` at the right points — keep.
- `src/ai/generation.ts` calls `recordGen('requested')` before each attempt and
  `recordGen('served'` / `'abstained'` at the `generatePuzzle` exit.
- `LearnerContext` adds a `recordAi(event)` action that folds the in-memory
  counter into `state.aiUsage` via `mutate` (debounced — see below). Both
  `explain.ts` and `generation.ts` call the context-bound recorder instead of the
  bare in-memory one when inside the app. To avoid a hard dep from `ai/*` on
  React context, keep `telemetry.ts` as the in-memory sink and have a
  `useAiTelemetrySync()` effect in `LearnerContext` flush counters into
  `aiUsage` on a 5s interval + on `signOut`/page-hide. This keeps the AI layer
  context-free while still persisting.

`src/pages/ParentPage.tsx` gets a compact "AI activity" card (only rendered when
`aiEnabled`): explain served vs. fallback vs. leak-blocked, generation served
vs. abstained, with a one-line plain-English read ("Rico explained 12 mistakes,
fell back to written hints 3 times"). Numbers come from `state.aiUsage`.

## Alternatives considered

- **Call `recordResult` directly from PracticePage.** Rejected: it would push
  synthetic step ids into `completedStepIds` and risk false lesson completion /
  portfolio pollution. A dedicated `recordPracticeResult` is cleaner.
- **Network analytics.** Rejected for this batch: no PII, no infra, keeps the
  app local-first. Can be added later behind a flag.
- **Separate practice skill stats namespace.** Rejected: denormalized
  `practice*` counters on the existing `SkillStat` give the same distinguish-
  ability with one map, and let `masteryScore` keep working unchanged.

## Testing

- `progress.test.ts`: `recordPracticeResult` updates `skillStats` and
  `stepStats` with `source: 'practice'`, never completes a lesson, never adds a
  portfolio artifact, never touches streaks.
- `progress.test.ts`: `migrate` fills `source` and `aiUsage` on old states.
- `mastery.test.ts`: blended vs. lesson-only mastery read correctly with the new
  counters.
- `practicePage.test.tsx`: a correct run calls `recordPracticeResult` once.
- `LearnerContext` test (if present): `aiUsage` accumulates after flush.

## Open decisions (flag for reviewer)

1. **Should a correct practice puzzle extend the day streak?** Current proposal:
   **no** — streaks are a lesson-completion habit signal; counting practice would
   let a kid inflate a streak without finishing lessons. Easy to flip later.
2. **AI-usage flush cadence.** Proposed 5s + on hide/signOut. Acceptable loss
   of the last <5s of counters vs. a write per event.

## Files touched

- `src/storage/types.ts` — `source` on `SkillStat`/`StepStat`, `AiUsage`, `emptyLearnerState`.
- `src/storage/progress.ts` — `recordPracticeResult`, `migrate`.
- `src/context/LearnerContext.tsx` — expose `recordPracticeResult`, `migrate` on load, `useAiTelemetrySync`.
- `src/pages/PracticePage.tsx` — call `recordPracticeResult` on run end.
- `src/ai/telemetry.ts` — `GenEvent`, `recordGen`.
- `src/ai/generation.ts` — emit `recordGen` events.
- `src/pages/ParentPage.tsx` — AI activity card (gated on `aiEnabled`).
- Tests: `progress.test.ts`, `mastery.test.ts`, `practicePage.test.tsx`.
