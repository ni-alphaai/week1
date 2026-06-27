# Leitner Review + Replay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **First action on execution:** copy this file to `docs/superpowers/plans/2026-06-27-leitner-review-and-replay.md` and work from there (this `/plans/` copy is the plan-mode scratch original). The companion spec is `docs/superpowers/specs/2026-06-27-ai-toggle-and-learning-science-review.md`; the older `*-PLAN.md` beside it is superseded by this document for the remaining work.

**Goal:** Ship the two unbuilt pieces of the spec — a non-destructive lesson **Replay** and a learning-science **Review Session** (Leitner-scheduled, authored-first, box-scaffolded, AI-optional) — plus one small Wave 1 cleanup (hide the AI toggle when there is no AI Capability).

**Architecture:** Wave 1 (AI Preference) already shipped: `src/lib/aiPreference.ts` + `src/lib/useAiEnabled.ts` + the `aiExplainOn()/aiGenerationOn()/aiAdaptiveOn()/aiAnyOn()` resolvers in `src/ai/config.ts` (Capability `&&` Preference). This plan adds: (W0) gate `<AiToggle>` on Capability; (W2) a session-only `?replay=1` intent that forces `stepIndex = 0` with blank editors without mutating `lessonProgress`; (W3) a pure Leitner scheduler (`src/adaptivity/leitner.ts`), per-skill box state on `ReviewState`, an authored-first item source (`src/content/reviewItems.ts`), a rewritten box-driven `ReviewPage`, and a Skilled-tier Soft Gate.

**Tech Stack:** React + TypeScript, react-router-dom, Vitest + React Testing Library, localStorage persistence, Vite (`VITE_AI_*` env Capability), Gemini generation behind `aiGenerationOn()`.

## Global Constraints

- **Tests-first (TDD).** Every code step is preceded by a failing test. Run the file's tests after each step; run the full suite + `tsc --noEmit` (`npm run test` / `npx tsc --noEmit`) at the end of each wave. One commit per wave.
- **Anchor on symbols, not line numbers.** Line numbers in this plan are hints only — they drift. Locate code by symbol name (`restartLesson`, `dueSkills`, `recordReview`, the resume effect's `allComplete` branch) and read the surrounding code before editing.
- **AI is a ceiling, never a dependency for core flows.** Capability (`aiEnabled` const) `&&` Preference (`isAiOn()`). Review and Replay MUST work end-to-end with AI off. Only *variant difficulty* may degrade when AI is off.
- **Replay is session-only.** Never call `restartLesson()` for Replay — it wipes `completedStepIds`, sets `status='in_progress'`, nulls `completedAt`, and clears `savedPrograms`. Completion must survive a Replay untouched.
- **Skilled tier = ≥80% success over ≥3 attempts.** The Soft Gate and the recap use this single definition. (Today `masteryTier` floors at ≥2 attempts; W3 aligns it to ≥3 — expect to update existing `masteryTier` tests + any ParentPage tier assertions.)
- **`recordReview` scope (the non-obvious call):** a Review Item targets ONE skill. On record, **only that targeted skill's box moves** (promote on correct / reset to box 1 on wrong). The existing per-lesson mastery stats (`recordPracticeResult` over all `lesson.skillIds`) continue to update for all skills as they do today. Box state is per-skill and only the item's skill changes box.
- Follow existing module idioms: pub/sub localStorage modules mirror `src/lib/sound.ts`; pure scheduling functions take `now` as an argument (no `Date.now()` inside) so tests can use a fixed clock.

---

## Wave 0 — AiToggle Capability guard (Wave 1 cleanup)

Spec C: "Hidden entirely when there is no AI Capability." Today `<AiToggle>` renders unconditionally in `ParentPage.tsx`.

### Task 0: Gate AiToggle on AI Capability

**Files:**
- Modify: `src/components/AiToggle.tsx` (component returns null without Capability) — or gate at the call site in `src/pages/ParentPage.tsx` (~L165). Prefer gating **inside `AiToggle`** so the rule lives with the control.
- Test: `src/components/AiToggle.test.tsx` (create if absent; otherwise extend).

**Interfaces:**
- Consumes: `aiEnabled` (the Capability const) from `src/ai/config.ts`; `isAiOn`/`toggleAi`/`subscribeAi` from `src/lib/aiPreference.ts` (already wired).
- Produces: `<AiToggle>` renders `null` when `aiEnabled === false`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/AiToggle.test.tsx
import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'

describe('AiToggle Capability gate', () => {
  it('renders nothing when there is no AI Capability', () => {
    vi.doMock('../ai/config', () => ({ aiEnabled: false }))
    return import('./AiToggle').then(({ default: AiToggle }) => {
      const { container } = render(<AiToggle />)
      expect(container).toBeEmptyDOMElement()
    })
  })

  it('renders the switch when AI Capability is present', () => {
    vi.doMock('../ai/config', () => ({ aiEnabled: true }))
    return import('./AiToggle').then(({ default: AiToggle }) => {
      render(<AiToggle />)
      expect(screen.getByRole('button')).toBeInTheDocument()
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/components/AiToggle.test.tsx` → FAIL (toggle renders even with Capability off).

- [ ] **Step 3: Add the guard** at the top of `AiToggle`'s render:

```tsx
import { aiEnabled } from '../ai/config'
// ...inside the component, before any other return:
if (!aiEnabled) return null
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/components/AiToggle.test.tsx` → PASS.

- [ ] **Step 5: Commit** — `git commit -am "fix(ai): hide AiToggle when no AI Capability"`

---

## Wave 2 — Replay (lesson "Review" restarts, keeps completion)

Goal: "Review" on a completed lesson starts at step 0 with blank editors, course stays finished.

### Task 1: Replay intent end-to-end

**Files:**
- Modify: `src/pages/CoursePage.tsx` — the completed-lesson action `<Link>` (label logic ~L89, link ~L131–138); remove the redundant restart icon button (~L140–150) and its `handleRestart` (~L35–43, which calls `restartLesson`).
- Modify: `src/pages/LessonPage.tsx` — resume effect (the `allComplete` branch that does `setStepIndex(lesson.steps.length)`); the `savedPrograms` restore effect (must be skipped on replay).
- Test: `src/pages/lessonReplay.test.tsx` (new). Reuse the `completedLessonState()` helper pattern from `src/pages/lessonPageResume.test.tsx`.

**Interfaces:**
- Consumes: `useSearchParams` from `react-router-dom`; existing `lessonProgress` reads on `LessonPage`.
- Produces: visiting `/lesson/:id?replay=1` → `stepIndex` starts at 0, `savedPrograms` NOT hydrated, `lessonProgress` (completedStepIds/status/completedAt) unchanged.

- [ ] **Step 1: Write the failing test** — completed lesson + replay intent starts at step 0 with blank editors and preserves completion.

```tsx
// src/pages/lessonReplay.test.tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect, beforeEach } from 'vitest'
import LessonPage from './LessonPage'
import { loadState, saveState } from '../storage/progress' // match actual exports
import { completedLessonState } from './lessonPageResume.test' // or copy the helper inline

beforeEach(() => {
  localStorage.clear()
  saveState(completedLessonState('lesson1')) // fully complete, with savedPrograms set
})

it('replay intent starts at step 0 with blank editors and keeps completion', () => {
  render(
    <MemoryRouter initialEntries={['/lesson/lesson1?replay=1']}>
      <Routes><Route path="/lesson/:lessonId" element={<LessonPage />} /></Routes>
    </MemoryRouter>,
  )
  // Concept slide / step 0 is shown (not the reward screen)
  expect(screen.queryByText(/you finished/i)).not.toBeInTheDocument()
  // Completion is untouched in storage
  const after = loadState()
  expect(after.lessons['lesson1'].status).toBe('completed')
  expect(after.lessons['lesson1'].completedStepIds.length).toBeGreaterThan(0)
})
```

> Execution note: confirm the real store accessor names (`loadState`/`saveState` or equivalent) and the reward-screen copy string before finalizing the assertions.

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/pages/lessonReplay.test.tsx` → FAIL (lands on reward screen; `stepIndex` = steps.length).

- [ ] **Step 3: Read the replay intent in `LessonPage`.**

```tsx
import { useSearchParams } from 'react-router-dom'
// ...
const [searchParams] = useSearchParams()
const isReplay = searchParams.get('replay') === '1'
```

- [ ] **Step 4: Honor replay in the resume effect.** In the effect that currently does `if (allComplete) setStepIndex(lesson.steps.length)`, branch first:

```tsx
if (isReplay) {
  setStepIndex(0)
  return // do not jump to reward screen, do not mutate lessonProgress
}
if (allComplete) {
  setStepIndex(lesson.steps.length)
}
```

- [ ] **Step 5: Skip `savedPrograms` hydration on replay.** In the saved-programs restore effect, bail when replaying so editors stay blank:

```tsx
if (isReplay) return // blank editors for a fresh retrieval pass
// ...existing restore of savedPrograms...
```

- [ ] **Step 6: Run test to verify it passes** — `npx vitest run src/pages/lessonReplay.test.tsx` → PASS.

- [ ] **Step 7: Point CoursePage's completed action at replay and remove the restart icon.** In `CoursePage.tsx`, when `isComplete`, the "Review" `<Link>` targets `` `/lesson/${id}?replay=1` ``. Delete the restart icon button and its `handleRestart` (the only `restartLesson` caller in the UI). Leave `restartLesson` in `storage/progress.ts` (still covered by its own tests; a true hard-wipe may be wanted later).

- [ ] **Step 8: Run the page suite + tsc** — `npx vitest run src/pages` and `npx tsc --noEmit` → green.

- [ ] **Step 9: Commit** — `git commit -am "feat(lesson): Replay keeps completion, starts at step 0 blank"`

---

## Wave 3 — Learning-science Review Session

Goal: authored-first, Leitner-scheduled, box-scaffolded, interleaved review with a mastery recap and a Soft Gate — working with AI on or off.

### Task 2: Pure Leitner scheduler

**Files:**
- Create: `src/adaptivity/leitner.ts`
- Test: `src/adaptivity/leitner.test.ts`

**Interfaces:**
- Produces:
  - `BOX_INTERVALS_DAYS: readonly [1, 2, 4, 7, 14]` (box 1→index 0 … box 5→index 4)
  - `type Box = 1 | 2 | 3 | 4 | 5`
  - `promote(box: Box): Box` — +1, capped at 5
  - `reset(): Box` — returns `1`
  - `intervalDays(box: Box): number`
  - `isDue(box: Box, lastReviewedAt: number | null, now: number): boolean` — never-reviewed (`null`) ⇒ true; else `now - lastReviewedAt >= intervalDays(box) * DAY_MS`
  - `supportLevel(box: Box): 'supported' | 'neutral' | 'faded'` — boxes 1–2 supported, box 3 neutral, boxes 4–5 faded (drives scaffolding fade)
  - `difficultyForBox(box: Box): number` — boxes 1–2 ⇒ 3, box 3 ⇒ 4, boxes 4–5 ⇒ 5 (AI variant level)

- [ ] **Step 1: Write the failing test**

```ts
// src/adaptivity/leitner.test.ts
import { describe, it, expect } from 'vitest'
import { promote, reset, isDue, intervalDays, supportLevel, difficultyForBox } from './leitner'

const DAY = 24 * 60 * 60 * 1000

describe('leitner', () => {
  it('promote caps at box 5', () => {
    expect(promote(1)).toBe(2)
    expect(promote(5)).toBe(5)
  })
  it('reset returns box 1', () => { expect(reset()).toBe(1) })
  it('intervals grow 1/2/4/7/14', () => {
    expect([1, 2, 3, 4, 5].map(b => intervalDays(b as any))).toEqual([1, 2, 4, 7, 14])
  })
  it('never-reviewed skill is due', () => { expect(isDue(1, null, 1000)).toBe(true) })
  it('due once the box interval elapses', () => {
    const now = 100 * DAY
    expect(isDue(2, now - 2 * DAY, now)).toBe(true)   // exactly elapsed
    expect(isDue(2, now - 1 * DAY, now)).toBe(false)  // not yet
  })
  it('support and difficulty fade with box', () => {
    expect(supportLevel(1)).toBe('supported')
    expect(supportLevel(5)).toBe('faded')
    expect(difficultyForBox(1)).toBe(3)
    expect(difficultyForBox(5)).toBe(5)
  })
})
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/adaptivity/leitner.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/adaptivity/leitner.ts`**

```ts
export type Box = 1 | 2 | 3 | 4 | 5
export const BOX_INTERVALS_DAYS = [1, 2, 4, 7, 14] as const
const DAY_MS = 24 * 60 * 60 * 1000

export function intervalDays(box: Box): number { return BOX_INTERVALS_DAYS[box - 1] }
export function promote(box: Box): Box { return (box >= 5 ? 5 : box + 1) as Box }
export function reset(): Box { return 1 }

export function isDue(box: Box, lastReviewedAt: number | null, now: number): boolean {
  if (lastReviewedAt == null) return true
  return now - lastReviewedAt >= intervalDays(box) * DAY_MS
}

export function supportLevel(box: Box): 'supported' | 'neutral' | 'faded' {
  if (box <= 2) return 'supported'
  if (box === 3) return 'neutral'
  return 'faded'
}

export function difficultyForBox(box: Box): number {
  if (box <= 2) return 3
  if (box === 3) return 4
  return 5
}
```

- [ ] **Step 4: Run test to verify it passes** → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(review): pure Leitner scheduler"`

### Task 3: Per-skill box state + recording

**Files:**
- Modify: `src/storage/types.ts` — extend `ReviewState`; add box to the migration default.
- Modify: `src/storage/progress.ts` — `recordReview` (promote/reset the targeted skill's box), `migrate()` (seed box state, drop the old lesson-granular `dueQueue` shape gracefully), `emptyLearnerState`.
- Test: extend `src/storage/progress.test.ts` (or the file that tests `recordReview`).

**Interfaces:**
- Consumes: `promote`, `reset`, `Box` from `src/adaptivity/leitner.ts`.
- Produces:
  - `ReviewState.boxes: Record<string /* skillId */, { box: Box; lastReviewedAt: number }>`
  - `recordReview(skillId: string, correct: boolean, now: number): void` — updates `boxes[skillId]` (promote if correct, reset to 1 if wrong; stamp `lastReviewedAt = now`); still calls the existing mastery-stat update over all `lesson.skillIds`.

> Migration: `migrate()` must (a) add `boxes: {}` when absent, and (b) tolerate the legacy `dueQueue: string[]` of lesson ids — leave it or drop it, but never throw. Add a new `SCHEMA_VERSION` bump + a migration branch mirroring the existing `migrate()` style.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { loadState, recordReview } from '../storage/progress'

const NOW = 1_000_000_000_000

beforeEach(() => localStorage.clear())

describe('recordReview box movement', () => {
  it('correct promotes the targeted skill box and stamps lastReviewedAt', () => {
    recordReview('loops', true, NOW)            // first review: starts box 1 -> promote to 2
    const s = loadState().review.boxes['loops']
    expect(s.box).toBe(2)
    expect(s.lastReviewedAt).toBe(NOW)
  })
  it('wrong resets the targeted skill to box 1', () => {
    recordReview('loops', true, NOW)            // box 2
    recordReview('loops', true, NOW)            // box 3
    recordReview('loops', false, NOW)           // wrong -> box 1
    expect(loadState().review.boxes['loops'].box).toBe(1)
  })
  it('only the targeted skill box moves', () => {
    recordReview('loops', true, NOW)
    expect(loadState().review.boxes['conditionals']).toBeUndefined()
  })
})
```

> Execution note: match the real state accessor (`loadState()` or the project's equivalent) and the `review` sub-object path before finalizing.

- [ ] **Step 2: Run test to verify it fails** → FAIL (`boxes` undefined / `recordReview` ignores box).

- [ ] **Step 3: Extend the type** in `src/storage/types.ts`:

```ts
import type { Box } from '../adaptivity/leitner'

export interface ReviewState {
  lastReviewedAt: Record<string, number>   // keep for back-compat / stats if still read
  lastDueDate: string | null
  dueQueue: string[]                        // now holds skill ids (see Task 4)
  boxes: Record<string, { box: Box; lastReviewedAt: number }>  // NEW
}
```

Seed `boxes: {}` in `emptyLearnerState`.

- [ ] **Step 4: Update `recordReview`** in `src/storage/progress.ts`:

```ts
import { promote, reset } from '../adaptivity/leitner'

export function recordReview(skillId: string, correct: boolean, now: number): void {
  const state = loadState()
  const prev = state.review.boxes[skillId]?.box ?? 1
  state.review.boxes[skillId] = { box: correct ? promote(prev) : reset(), lastReviewedAt: now }
  state.review.lastReviewedAt[skillId] = now
  saveState(state)
  // existing mastery-stat update over the skill's lesson(s) stays as-is
}
```

> Keep the current `recordReview`'s existing stat side-effects (delegating to `recordPracticeResult`); only ADD the box update. If the current signature is `recordReview(skillId)` with no `correct`/`now`, widen it and update its one caller in `ReviewPage` (Task 6).
>
> **Thread `correct` into the stats, not just the box (behavior change).** Today `recordReview` "only stamps `lastReviewedAt`" — it does NOT feed a correct/wrong outcome into the mastery stats. The Skilled tier (≥3 attempts) is only *reachable* through review if each review outcome counts as an attempt. So the widened `recordReview` must pass `correct` to `recordPracticeResult` (record a real attempt) in addition to moving the box. Add a test asserting that after N correct reviews the skill's `attempts` rises by N (not merely that `lastReviewedAt` changed).

- [ ] **Step 5: Add the `migrate()` branch** (bump `SCHEMA_VERSION`, default `boxes: {}`, tolerate legacy `dueQueue`).

- [ ] **Step 6: Run tests to verify they pass** → PASS. Run the full storage suite to confirm migration didn't break existing state tests.
- [ ] **Step 7: Commit** — `git commit -am "feat(review): per-skill Leitner box state + recording"`

### Task 4: Due selection off Leitner (interleaved, capped)

**Files:**
- Modify: `src/adaptivity/mastery.ts` — rewrite `dueSkills` to select by box interval (replace the decay/recency/threshold logic: `DECAY_HALF_LIFE_DAYS`, `DUE_RATE_THRESHOLD`, `DUE_RECENCY_DAYS`, `decayedSuccessRate`).
- Modify: `src/storage/progress.ts` — `refreshDueQueue` writes skill ids (not lesson ids).
- Test: rewrite the `dueSkills` tests in `src/adaptivity/mastery.test.ts`.

**Interfaces:**
- Consumes: `isDue`, `Box` from `leitner`; the learner's **met skills** (skills with recorded attempts — likely `state.skills` keys / `SkillStat` entries, or skills of lessons with attempts > 0; verify at execution); the `ReviewState.boxes` map for the per-skill box+lastReviewedAt.
- Produces: `dueSkills(state, now, cap = 5): string[]` — of the learner's **met skills**, those whose box is `isDue`, soonest-due first, capped at `cap`.

> **CRITICAL — bootstrapping (do not skip):** `boxes` starts empty (`migrate()` defaults `{}`) and is only written by `recordReview`. If `dueSkills` iterates `Object.keys(boxes)`, a fresh learner who has completed lessons but never reviewed has `boxes === {}` → nothing due → "All caught up" forever, and the feature is dead on arrival (the hand-seeded unit tests would still pass). **Fix:** `dueSkills` must iterate the *met skills* and look up each skill's box defaulting to box 1 / never-reviewed (`isDue` already treats `lastReviewedAt == null` as due). This dissolves the chicken-and-egg with no extra write path. Step 1 below has the bootstrapping test — keep it.

> Interleaving: with one item per skill there is no same-skill adjacency to avoid, but keep the ordering deterministic (sort by `lastReviewedAt` ascending, never-reviewed first) so the session order is stable and testable. Note this in a code comment so a future multi-item-per-skill change knows where interleaving would live.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { dueSkills } from './mastery'

const DAY = 24 * 60 * 60 * 1000
const NOW = 100 * DAY

function stateWith(boxes: Record<string, { box: any; lastReviewedAt: number }>) {
  return { review: { boxes, lastReviewedAt: {}, lastDueDate: null, dueQueue: [] }, lessons: {}, skills: {} } as any
}

describe('dueSkills (Leitner)', () => {
  it('selects only skills whose box interval elapsed', () => {
    const s = stateWith({
      loops: { box: 1, lastReviewedAt: NOW - 2 * DAY },        // due (interval 1)
      conditionals: { box: 5, lastReviewedAt: NOW - 1 * DAY }, // not due (interval 14)
    })
    expect(dueSkills(s, NOW)).toEqual(['loops'])
  })
  it('never-reviewed skill is due and caps at 5', () => {
    const boxes: any = {}
    for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) boxes[k] = { box: 1, lastReviewedAt: 0 }
    expect(dueSkills(s_fromBoxes(boxes), NOW).length).toBe(5)
  })
})
function s_fromBoxes(boxes: any) { return stateWith(boxes) }
```

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Rewrite `dueSkills`**

```ts
import { isDue } from './leitner'

export function dueSkills(state: LearnerState, now: number, cap = 5): string[] {
  const boxes = state.review.boxes ?? {}
  return Object.entries(boxes)
    .filter(([, v]) => isDue(v.box, v.lastReviewedAt ?? null, now))
    .sort((a, b) => (a[1].lastReviewedAt ?? 0) - (b[1].lastReviewedAt ?? 0)) // soonest-due first
    .slice(0, cap)
    .map(([skillId]) => skillId)
}
```

> If skills the learner has met but never reviewed must seed a box-1 entry, do that seeding in `refreshDueQueue` (or when a lesson completes) so `boxes` is populated for every met skill. Confirm where "met skill" is known (lesson completion in `storage/progress.ts`) and seed there.

- [ ] **Step 4: Update `refreshDueQueue`** to store skill ids; delete the now-dead decay constants/`decayedSuccessRate` (or leave `decayedSuccessRate` if other call sites use it — grep first).

> **Avoid two sources of truth for "what's due."** `ReviewPage` (Task 6) builds its session directly from `dueSkills(state, now)`, so `dueQueue` becomes vestigial. Either (a) **drop `dueQueue`** and any `refreshDueQueue` call (preferred — `dueSkills` is now cheap and pure), or (b) if you keep it as a persisted cache, name its single reader and have `ReviewPage` read from it via one accessor — never let the page and the stored queue compute "due" independently, or they will drift. Decide this here, not in Task 6.

- [ ] **Step 5: Run tests to verify they pass** → PASS.
- [ ] **Step 6: Commit** — `git commit -am "feat(review): Leitner-based due selection"`

### Task 5: Authored-first item source

**Files:**
- Create: `src/content/reviewItems.ts`
- Test: `src/content/reviewItems.test.ts`

**Interfaces:**
- Consumes: lesson registry (`src/content/registry.ts`) + lesson `steps` (`SequenceStep`/`ConditionalStep` from `src/types.ts`); skill→lesson mapping; `difficultyForBox` from `leitner`; existing variant/generation helpers (e.g. `deriveSmallerVariantPuzzle` in `src/content/generated.ts`, and the prefetch path in `src/ai/reviewPrefetch.ts`); `aiGenerationOn()` from `src/ai/config.ts`.
- Produces:
  - `authoredItemForSkill(skillId: string): SequenceStep | ConditionalStep | null` — the authored puzzle step for a skill (first lesson tagged with that skill that has a matching step). Pure, no AI.
  - `reviewItemForSkill(skillId, box, opts?): ReviewItem` where `ReviewItem = { skillId; box; puzzle: SequenceStep | ConditionalStep; source: 'authored' | 'generated'; blankEditor: true }`. Authored by default; when `aiGenerationOn()`, callers may upgrade to a generated variant at `difficultyForBox(box)` (generation stays in the page/prefetch layer — this module's default return is always authored so it works AI-off).

> Skill→lesson map (from registry exploration — every skill has at least one authored puzzle, none orphaned): `sequencing`→lesson1, `loops`→lesson3, `conditionals`→lesson2, `planning`→lesson1 (planning is tagged on sequencing/while lessons; pick the first lesson whose steps include a solvable authored puzzle). Verify against `registry.ts` at execution time.

- [ ] **Step 1: Write the failing test**

```ts
// src/content/reviewItems.test.ts
import { describe, it, expect } from 'vitest'
import { authoredItemForSkill, reviewItemForSkill } from './reviewItems'

describe('authored-first review items', () => {
  it('returns an authored puzzle for every known skill (none orphaned)', () => {
    for (const skill of ['sequencing', 'loops', 'conditionals', 'planning']) {
      expect(authoredItemForSkill(skill)).not.toBeNull()
    }
  })
  it('reviewItemForSkill serves the authored puzzle with a blank editor by default', () => {
    const item = reviewItemForSkill('loops', 1)
    expect(item.source).toBe('authored')
    expect(item.blankEditor).toBe(true)
    expect(item.puzzle).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails** → FAIL (module not found).

- [ ] **Step 3: Implement `reviewItems.ts`** — look up the lesson(s) for the skill via the registry, pick the first authored `SequenceStep`/`ConditionalStep`, return it. Model the lesson/step filtering on `deriveSmallerVariantPuzzle` in `generated.ts`. Keep it AI-free; expose `source`/`box`/`blankEditor` on the returned item.

- [ ] **Step 4: Run test to verify it passes** → PASS.
- [ ] **Step 5: Commit** — `git commit -am "feat(review): authored-first item source"`

### Task 6: ReviewPage — box-driven fade, AI-optional, mastery recap

**Files:**
- Modify: `src/pages/ReviewPage.tsx` — replace the `if (!aiGenerationOn())` "unavailable" branch (~L268) and the short-circuit (~L195) with the authored-first path; record BOTH solve and fail outcomes via `recordReview(skillId, correct, now)`; drive hints/variant/explain from the item's `supportLevel(box)`; add the end-of-session mastery recap (the "All caught up" screen ~L303–325 becomes the recap slot).
- Modify (if needed): `src/ai/reviewPrefetch.ts` — `requestReviewPuzzle` difficulty derives from `difficultyForBox(box)` instead of `lessonSuccessRate`→`nextDifficultyDirection`; only invoked when `aiGenerationOn()`.
- Test: `src/pages/reviewPage.test.tsx` (extend/replace) — AI-off renders an authored item end-to-end; a wrong run records a box reset; recap lists per-skill box change + tier.

**Interfaces:**
- Consumes: `dueSkills`, `reviewItemForSkill`, `supportLevel`, `difficultyForBox`, `recordReview`, `aiGenerationOn`, `masteryTier`.
- Produces: a Review Session that runs with AI off; records correct AND incorrect outcomes (box demotion needs the wrong signal — today only the solve path records).

- [ ] **Step 1: Write the failing test** — with AI off, the Review page renders an authored retrieval item (not an "unavailable" message), and submitting a wrong run calls `recordReview(skill, false, ...)` (assert box reset in storage afterward).

```tsx
// src/pages/reviewPage.test.tsx (sketch — adapt to the page's actual interactions)
it('renders an authored review item with AI off and records a wrong outcome', async () => {
  // arrange: AI Preference off, one due skill seeded in boxes at box 3
  // act: render ReviewPage, perform a failing run
  // assert: no "review unavailable" text; loadState().review.boxes[skill].box === 1
})
```

- [ ] **Step 2: Run test to verify it fails** → FAIL (AI-off shows unavailable; failures not recorded).

- [ ] **Step 3: Relax the AI gate.** Replace the `!aiGenerationOn()` unavailable branch with: always build the session from `dueSkills` + `reviewItemForSkill` (authored); when `aiGenerationOn()`, upgrade the item to a generated variant at `difficultyForBox(box)` via the prefetch path.

- [ ] **Step 4: Record both outcomes.** Wherever the page currently records only solves, call `recordReview(item.skillId, solved, now)` on BOTH the solved and failed terminal states. Use the same skill the item targets.

- [ ] **Step 5: Box-driven scaffolding.** From `supportLevel(item.box)`: `supported` → show hints up-front + "Try a smaller version" affordance; `neutral` → hints on request; `faded` → no up-front hints, explain only after a wrong run.

- [ ] **Step 6: Mastery recap.** On session end, render per-skill: box change (before→after) and updated `masteryTier`, e.g. "loops box 2→3 ↑ Skilled".

- [ ] **Step 7: Run tests + tsc** → PASS / green.
- [ ] **Step 8: Commit** — `git commit -am "feat(review): box-driven, AI-optional Review Session with recap"`

### Task 7: Soft Gate at lesson end

**Files:**
- Modify: `src/adaptivity/mastery.ts` — align `masteryTier` Skilled floor to ≥3 attempts (currently ≥2); add `belowSkilled(state, lessonId): boolean` (true while any of the lesson's skills are below Skilled).
- Modify: `src/pages/LessonPage.tsx` — on the reward/completion screen (~L533–601), when `belowSkilled` show the nudge + a "Review" CTA (link to the Review Session) and de-emphasize (not remove) the next-lesson affordance.
- Modify (optional): `src/pages/CoursePage.tsx` — reflect the same nudge state on the lesson card.
- Test: `src/adaptivity/mastery.test.ts` (Soft Gate predicate at the tier boundary) + a light RTL assertion on `LessonPage` that the nudge appears below Skilled and clears at/above.

**Interfaces:**
- Consumes: `masteryTier`, `masteryScore`, lesson `skillIds`.
- Produces: `belowSkilled(state, lessonId): boolean`; Soft-Gate UI on lesson completion. Never blocks the next lesson.

- [ ] **Step 1: Write the failing test** — predicate is true at 80%/2 attempts (below the ≥3 floor) and at <80%, false at ≥80%/≥3 attempts.

```ts
import { describe, it, expect } from 'vitest'
import { belowSkilled } from './mastery'
// build a state where 'lesson1' skills have 80% over 2 attempts -> still below Skilled
it('soft gate nudges below Skilled (needs >=3 attempts)', () => {
  expect(belowSkilled(stateAt(80, 2), 'lesson1')).toBe(true)
  expect(belowSkilled(stateAt(80, 3), 'lesson1')).toBe(false)
  expect(belowSkilled(stateAt(60, 5), 'lesson1')).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails** → FAIL.

- [ ] **Step 3: Align `masteryTier`** so Skilled requires `score >= 80 && attempts >= 3`; implement `belowSkilled` over `lesson.skillIds`. Update existing `masteryTier` tests and any ParentPage tier assertions that assumed the ≥2 floor.

- [ ] **Step 4: Wire the nudge** into `LessonPage`'s completion screen: when `belowSkilled`, render the nudge + Review CTA, keep the next-lesson control present but visually de-emphasized.

- [ ] **Step 5: Run tests + tsc** → PASS / green.
- [ ] **Step 6: Commit** — `git commit -am "feat(review): Skilled-tier Soft Gate at lesson end"`

---

## Verification (end-to-end)

Run `npm run test` + `npx tsc --noEmit` — all green.

- **Replay:** complete a lesson, tap "Review" → starts at step 0, blank editors; course still "finished", checkmark intact, home CTA still "Review the course". (Wave 2)
- **AI off (flip the Parent toggle):** AiToggle visible only with a Capability build; with AI off, Rico/explain, generation, adaptive difficulty fall back to authored; a Review Session still runs end-to-end from authored puzzles; recap shows box movement. (W0 + W3)
- **AI on:** review serves generated variants at the box-derived difficulty; box-driven fade visible across boxes; a wrong answer returns the skill to box 1 (Due next day). (W3)
- **Soft Gate:** finish a lesson below Skilled → nudge appears, next lesson still reachable; reach Skilled (≥80% over ≥3 attempts) via review → nudge clears. (W3)

## Self-review notes (resolved here, don't re-litigate)

- **No orphaned skills** — every skill has an authored puzzle, so authored-first review is viable for all skills with AI off. `conceptForLesson` returns null only for lesson-6, which affects AI *variant* generation, not authored items.
- **Box state is net-new** — added to `ReviewState` with a `migrate()` branch; legacy lesson-granular `dueQueue` tolerated, now repurposed to skill ids.
- **Failures must be recorded** — `ReviewPage` records correct AND wrong outcomes; box demotion depends on the wrong signal (today only solves are recorded).
- **`recordReview` scope** — only the targeted skill's box moves; mastery stats still update across `lesson.skillIds`.
- **Skilled threshold** — unified at ≥80% over ≥3 attempts; expect to update existing `masteryTier` tests + ParentPage tier display.
