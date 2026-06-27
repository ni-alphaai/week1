# Implementation Plan — AI Toggle + Learning-Science Review

**Companion to:** `2026-06-27-ai-toggle-and-learning-science-review.md` (spec),
ADR-0002, ADR-0003, `CONTEXT.md`.
**Approach:** tests-first. Each step writes the failing test, then the code to pass
it. Run the relevant `vitest` file after each step; run the full suite + `tsc` at
the end of each wave. Land each wave as its own commit.

**Build order rationale:** Wave 1 (AI Preference) ships the accessors Waves 2–3 call
into. Wave 2 (Replay) is small and isolated. Wave 3 (Review Session) is the largest
and depends on Wave 1's resolvers.

---

## Wave 1 — AI Preference under the env ceiling (ADR-0003)

Goal: a runtime parent toggle that ANDs with the build-time `VITE_AI_*` Capability;
every existing AI path falls back to authored behaviour when off.

### 1.1 `src/lib/aiPreference.ts` (tests-first)
- **Test** `src/lib/aiPreference.test.ts`: defaults ON when unset; `setAiOn(false)`
  persists to localStorage and `isAiOn()` returns false; `subscribeAi` fires on
  change and returns an unsubscribe; reads existing localStorage value on init.
  Mirror the shape of `src/lib/sound.ts` tests if present.
- **Impl:** pub/sub + localStorage module modeled on `src/lib/sound.ts`. Key
  `brillant.ai`. Exports `isAiOn()`, `setAiOn(v)`, `toggleAi()`, `subscribeAi(fn)`.

### 1.2 Capability vs Preference resolvers in `src/ai/config.ts`
- **Test** extend `src/ai/config.test.ts` (create if absent): with env Capability on
  + Preference off, `aiExplainOn()/aiGenerationOn()/aiAdaptiveOn()` all return false;
  with Capability off, they return false regardless of Preference (ceiling holds);
  with both on, true.
- **Impl:** keep the existing `aiEnabled`/`aiExplainEnabled`/… consts as the
  **Capability**. Add resolver functions `aiExplainOn()`, `aiGenerationOn()`,
  `aiAdaptiveOn()`, `aiAnyOn()` = `Capability && isAiOn()`. (Functions, not consts —
  they must re-evaluate at call time.)

### 1.3 Convert the ~26 call sites to runtime checks
Replace constant reads with resolver calls / a `useAiEnabled()` hook. Group:
- **Non-React guards** (call resolvers): `ai/explain.ts:58`, `ai/explainBeat.ts:38`,
  `ai/generation.ts:1177`, `adaptivity/difficulty.ts:50`.
- **React render gates** (use `useAiEnabled()` so they re-render on toggle):
  `LessonPage.tsx` (252, 278, 345, 590, 751), `PracticePage.tsx` (172, 174, 361),
  `ReviewPage.tsx` (193, 266 — but see Wave 3, this branch is being replaced),
  `HomePage.tsx:221`, `ParentPage.tsx:129`, `BeatPuzzle.tsx:300`.
- **Hook** `useAiEnabled()`: small wrapper over `subscribeAi` (mirror SoundToggle's
  `useMuted`); returns effective `aiAnyOn()` and re-subscribes.
- **Tests:** the existing `*.off.test.ts` files mock flags as consts — update them to
  drive the resolver path (mock `aiPreference` + config) so "off" is exercised via
  the new runtime route. Confirm `generation.off`, `explain.off` still pass.

### 1.4 `AiToggle` component + Parent page
- **Test** (light, RTL): renders nothing when no AI Capability; renders a switch
  reflecting `isAiOn()` when Capability present; clicking flips `isAiOn()`.
- **Impl:** `src/components/AiToggle.tsx` mirroring `SoundToggle.tsx` (aria-pressed,
  label). Render in `ParentPage.tsx` near the AI activity section; guard on
  Capability.

**Wave 1 done when:** toggling in `/parent` makes Rico/explain, generation, adaptive
difficulty fall back to authored content live; full suite + `tsc` green.

---

## Wave 2 — Replay (lesson "Review" restarts, keeps completion)

Goal: "Review" on a completed lesson starts at step 0 with blank editors, without
un-finishing the course.

### 2.1 Replay entry from CoursePage
- **Test** extend `lessonPageResume.test.ts` (or new `lessonReplay.test.ts`): with a
  fully-completed lesson and the replay intent present, `stepIndex` resolves to 0 and
  `savedPrograms` are NOT loaded; `lessonProgress` (completedStepIds, status,
  completedAt) is unchanged after entry.
- **Impl:**
  - `CoursePage.tsx`: completed-lesson "Review" link carries a replay intent —
    `/lesson/:id?replay=1` (or router state). Remove the now-redundant restart-icon
    + its `handleRestart`/`restartLesson` call.
  - `LessonPage.tsx` resume effect (~155–172): if replay intent, `setStepIndex(0)`
    and mark a session-only `replaying` flag so saved programs aren't hydrated for
    this visit; do **not** mutate `lessonProgress`. Non-replay re-entry keeps the
    existing "all complete → reward screen" branch.

**Wave 2 done when:** complete a lesson, tap "Review" → step 0, blank editors, course
still "finished", checkmark intact, home CTA still "Review the course".

---

## Wave 3 — Learning-science Review Session (ADR-0002)

Goal: authored-first, Leitner-scheduled, box-scaffolded, interleaved review with a
mastery recap and a soft gate — working with AI on or off.

### 3.1 Leitner scheduler `src/adaptivity/leitner.ts`
- **Test** `src/adaptivity/leitner.test.ts` (fake `now`): box intervals
  (1/2/4/7/14d); `isDue(box, lastReviewedAt, now)` true once interval elapsed;
  `promote(box)` caps at 5; wrong → `reset()` to box 1; never-reviewed skill is Due.
- **Impl:** pure functions over `(box, lastReviewedAt, now)`. No I/O.

### 3.2 ReviewState shape + recording
- **Test** extend `storage/progress` tests: `recordReview(correct)` promotes the
  skill's box on correct and resets to 1 on wrong, and stamps lastReviewedAt;
  existing mastery stats still update.
- **Impl:** extend `ReviewState` (storage/types.ts) with per-skill `{ box,
  lastReviewedAt }` (migrate/replace the old `lastReviewedAt` map + dueQueue usage).
  Update `recordReview` in `storage/progress.ts` to call `promote`/`reset`.

### 3.3 Due selection (interleaved, capped)
- **Test:** rewrite `dueSkills` tests — select skills whose box interval elapsed,
  cap ~5, interleaved ordering (no same-skill adjacency; trivially holds at one item
  per skill but assert the cap + ordering helper).
- **Impl:** rewrite `dueSkills` (`adaptivity/mastery.ts`) + `refreshDueQueue`
  (`storage/progress.ts`) off Leitner instead of decayed-rate.

### 3.4 Authored-first item source
- **Test** `src/content/reviewItems.test.ts`: for each skill, returns its authored
  `SequenceStep`/`ConditionalStep`; skills with no authored puzzle return null
  (caller skips or, with AI, generates). With `aiGenerationOn()` true, the item is
  upgraded to a generated variant at the box-derived difficulty; with it false, the
  authored puzzle is served with a blank editor.
- **Impl:** skill→authored-puzzle lookup over `content/` lessons. Box→difficulty map
  (box 1–2 → level 3, box 4–5 → level 5). Reuse existing generation/variant prefetch.

### 3.5 ReviewPage UI: scaffolding fade + recap
- **Test** (RTL, light): box 1 item shows hints up-front + "Try a smaller version";
  box 4 item hides up-front hints (explain only after a wrong run); the end-of-session
  recap lists each skill's box change + tier.
- **Impl:** `ReviewPage.tsx` — derive support level from the item's box; replace the
  "AI off → unavailable" branch (~266) with the authored-first path so review renders
  regardless of AI; add the mastery-recap end screen.

### 3.6 Soft mastery gate
- **Test** `adaptivity/mastery` (or a `softGate` helper): predicate returns "nudge"
  while a lesson's skills are below Skilled (≥80% over ≥3 attempts), clears at/above.
- **Impl:** align the predicate to Skilled (≥3 attempts). Surface the nudge + Review
  CTA on the lesson completion screen (`LessonPage.tsx` ~533–601) and mute the
  next-lesson affordance; reflect on the CoursePage card.

**Wave 3 done when:** the manual checks in the spec's Verification section pass with
AI both on and off; full suite + `tsc` green.

---

## Cross-cutting / final
- Run `npm run test` + `tsc --noEmit` (or project equivalents) after each wave.
- Confirm `CONTEXT.md` terms match the code names that ship; adjust glossary if a
  name changes during implementation.
- Open question to resolve in 3.4: skills with no authored puzzle (e.g. `planning`)
  — confirm "skip when AI off" is acceptable, or author a minimal puzzle for them.
