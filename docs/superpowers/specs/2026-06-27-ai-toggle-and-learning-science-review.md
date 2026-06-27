# AI Toggle + Learning-Science Review — Design Spec

**Date:** 2026-06-27
**Status:** Designed (grilled). Ready to plan implementation.
**Related:** ADR-0002 (Leitner authored-first review), ADR-0003 (runtime AI
Preference), CONTEXT.md (Reviewing, AI availability sections).

## Context

Three problems prompted this work:

1. **AI is invisible to users.** It's controlled only by build-time `VITE_AI_*`
   env flags. A parent has no easy way to turn AI features on/off.
2. **Daily review doesn't make sense pedagogically.** It's an AI-only feature
   resurfacing skills via an exponential-decay heuristic — no growing intervals, no
   "wrong → sooner," no scaffolding fade, no mastery payoff. It should embody
   learning science: retrieval practice, spaced repetition, interleaving, mastery
   learning, scaffolding/desirable difficulty, and (already present) immediate
   explanatory feedback.
3. **The lesson "Review" button doesn't restart.** On a completed lesson it lands
   on the reward screen ("continues where we left off") instead of letting the
   learner re-do the lesson.

Vocabulary for all of this is in `CONTEXT.md` (Replay, Review Session, Retrieval
Item, Box, Due, Soft Gate, AI Capability, AI Preference).

---

## Decisions (from grilling)

### A. Lesson "Review" → Replay (keeps completion)
- The lesson card's **"Review"** action becomes a **Replay**: full restart from
  step 0, concept slides included, editors blank.
- **Completion is preserved.** Replay must NOT use today's `restartLesson()` (which
  clears `completedStepIds`/sets `in_progress` and would un-finish the course).
  Instead, Replay is a **session-only** intent: navigate into the lesson forcing
  `stepIndex = 0` and not loading `savedPrograms`, while leaving
  `lessonProgress` (completedStepIds, status, completedAt) untouched.
- The separate restart-icon becomes redundant; recommend removing it (Replay covers
  the "redo" need; a true hard-wipe is rarely needed).

### B. Review Session — learning science (see ADR-0002)
- **Item source:** authored-first. Default = the authored lesson puzzle for the due
  skill, editor blank (retrieval, not recognition). Upgrade to a fresh AI variant of
  the same skill when AI is available. **Review never depends on AI.**
- **Scheduling:** Leitner **Box** per skill (1–5), growing intervals (e.g.
  1/2/4/7/14 days). Correct → promote one box. Wrong → drop to box 1 (Due tomorrow).
  Replaces the decay/recency/threshold selection.
- **Mastery learning — Soft Gate:** at lesson end, if any taught skill is below
  **Skilled** (≥80% over ≥3 attempts), show a nudge toward a Review Session; next
  lesson stays reachable but de-emphasized. Never blocks.
- **Scaffolding / desirable difficulty — box-driven fade:** low boxes (1–2) show
  hints up-front, easier variant (AI level 3), offer "Try a smaller version"; high
  boxes (4–5) hide up-front hints, harder variant (AI level 5), explain only after a
  wrong run. Wrong → box 1 → support returns. (With AI off, the *support* fade still
  works on the single authored puzzle; the *difficulty* fade is limited.)
- **Session shape:** up to ~5 due skills, one Retrieval Item each, **interleaved**
  (no two of the same skill back-to-back). Ends with a **mastery recap**: per skill,
  box change and updated tier (e.g. "loops box 2→3 ↑ Skilled"; "while box 1 — try
  again tomorrow").

### C. AI Preference toggle (see ADR-0003)
- **One master switch** on the **Parent page** (`/parent`), flipping all AI at once.
- **Env = ceiling, default ON.** Hidden when no AI Capability; defaults ON when
  there is; parent can switch OFF → all AI paths fall back to authored behaviour.
- Stored device-side in localStorage, mirroring `sound.ts`/`SoundToggle`.

---

## Implementation outline

### C. AI Preference (do this first — review depends on its accessors)
- New `src/lib/aiPreference.ts`: pub/sub + localStorage (key e.g. `brillant.ai`),
  modeled on `src/lib/sound.ts`. Exposes `isAiOn()`, `setAiOn()`, `toggleAi()`,
  `subscribeAi()`, and a `useAiEnabled()` hook.
- Refactor `src/ai/config.ts`: keep env flags as the **Capability**, and add
  resolver functions that AND Capability with Preference — e.g.
  `aiExplainOn()`, `aiGenerationOn()`, `aiAdaptiveOn()`. Effective AI = Capability
  && Preference.
- Convert the ~26 constant reads to runtime checks. Module-constant call sites
  (`if (!aiGenerationEnabled) ...`) → call the resolver; React render-time gates →
  `useAiEnabled()` so they re-render on toggle. Sites listed in exploration: pages
  `LessonPage`, `PracticePage`, `ReviewPage`, `HomePage`, `ParentPage`, components
  `BeatPuzzle`, and `ai/explain.ts`, `ai/explainBeat.ts`, `ai/generation.ts`,
  `adaptivity/difficulty.ts`.
- Add an `AiToggle` component (mirror `SoundToggle`) rendered in `ParentPage.tsx`;
  render only when AI Capability is present.

### A. Replay
- `CoursePage.tsx`: the completed-lesson **"Review"** action navigates with a replay
  intent (e.g. `/lesson/:id?replay=1` or router state). Remove the restart-icon.
- `LessonPage.tsx` resume effect (~lines 155–172): when replay intent is present,
  set `stepIndex = 0` and skip loading `savedPrograms` for this session; do **not**
  mutate `lessonProgress`. Leave the existing "all complete → reward screen" branch
  for the non-replay re-entry.

### B. Review Session
- **State:** extend `ReviewState` (storage/types.ts) with per-skill Box + last
  reviewed (replacing reliance on `lastReviewedAt` + decay). Add a Leitner module
  (e.g. `src/adaptivity/leitner.ts`): box intervals, `isDue(box, lastReviewedAt,
  now)`, `promote(box)`, `reset()`.
- **Selection:** rewrite `dueSkills` / `refreshDueQueue`
  (`adaptivity/mastery.ts`, `storage/progress.ts`) to pick skills whose box interval
  has elapsed, capped ~5, interleaved order.
- **Item source:** add a skill→authored-puzzle lookup over `content/` lessons
  (a skill's authored `SequenceStep`/`ConditionalStep`). When `aiGenerationOn()`,
  request a variant at the box-derived difficulty; otherwise serve the authored
  puzzle with editor blank.
- **Recording:** `recordReview` updates the skill's Box (promote/reset) in addition
  to existing mastery stats; keep mastery tier math in `adaptivity/mastery.ts`,
  align the Soft Gate predicate to Skilled (≥80%, ≥3 attempts).
- **UI:** `ReviewPage.tsx` — drive support level (hints/variant/explain) from the
  item's box; add the end-of-session mastery recap. Replace the "AI off → feature
  unavailable" branch (line ~266) with the authored-first path so review renders
  regardless of AI.
- **Soft Gate UI:** lesson completion screen (`LessonPage.tsx` ~533–601) and the
  CoursePage card — when below Skilled, surface the nudge + Review CTA and mute the
  next-lesson affordance.

---

## Verification

- **Unit:** Leitner module (promote/reset/isDue with fake `now`); authored-first
  item selection with AI on vs off; Soft-Gate predicate at tier boundaries;
  `aiPreference` pub/sub + the Capability&&Preference resolvers (extend the existing
  `generation.off.test.ts` / `explain.off.test.ts` style).
- **Manual (AI off — flip the Parent toggle):** confirm Rico/explain, generation,
  and review variants all fall back to authored content; a Review Session still runs
  end-to-end from authored puzzles; recap shows box movement.
- **Manual (AI on):** review serves generated variants; box-driven difficulty fade
  visible across boxes; wrong answer returns the skill to box 1 next day.
- **Replay:** complete a lesson, tap "Review" → starts at step 0 with blank editors;
  course stays "finished", checkmark intact, home CTA still "Review the course".
- **Soft Gate:** finish a lesson below Skilled → nudge appears, next lesson still
  reachable; reach Skilled via review → nudge clears.
