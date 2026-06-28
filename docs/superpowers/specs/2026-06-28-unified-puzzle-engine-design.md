# Spec 2 — Unified puzzle engine (review difficulty, smaller-version mechanics, tier nudge)

**Date:** 2026-06-28
**Branch:** feat/badge-redesign
**Status:** Approved design, ready for implementation plan

## Problem

Three learner-progression concerns share one root cause — puzzle *selection* is
ad hoc and duplicated across surfaces:

1. **Review difficulty doesn't scale (concern 2).** `reviewItemForSkill(skillId,
   box)` accepts the Leitner box but ignores it: `authoredItemForSkill` always
   returns the *first* lesson puzzle for a skill
   (`src/content/reviewItems.ts:27-37`). Boxes 1–4 only change hint scaffolding,
   never the puzzle, so review feels uniformly easy and never engages special
   mechanics. The difficulty machinery (`difficultyForBox` in
   `src/adaptivity/leitner.ts:20-24`; `scoreFor` in
   `src/engine/difficulty.ts:159-165`) exists but is unused for authored
   selection.
2. **"Try a smaller version" can drop mechanics (concern 3).**
   `deriveSmallerVariantPuzzle` (`src/content/generated.ts:227-263`) picks the
   lesson's *fewest-move* step and copies its map wholesale — it preserves
   mechanics only if the simplest step happens to have them, so a key/door/ice
   puzzle can collapse to a plain maze.
3. **Tier nudge copy is generic (concern 4).** The lesson soft-gate
   (`src/pages/LessonPage.tsx:613-618`) shows "Keep sharpening these skills /
   Review this lesson to reach the Skilled tier" whenever any lesson skill is
   below Skilled. The hide-when-Skilled logic is already correct
   (`belowSkilled`, `src/adaptivity/mastery.ts:100-102`), but the copy never
   shows the learner's *current* tier per skill.

Underlying all three: **Practice and Review duplicate selection logic and
drift.** Practice (`src/pages/PracticePage.tsx`) is AI-only — with AI off it
sets `abstained=true` and serves *nothing* (174-198), violating the app's core
"AI fails closed to authored content" rule. The "Keep practicing" link is itself
gated by `aiGenerationOn()` (`LessonPage.tsx:637`).

## Goal

Introduce one pure puzzle selector that ranks authored puzzles by difficulty and
mechanic engagement, and route both Review and Practice through it. This fixes
concerns 2 and 3, makes Practice work AI-off, and (with a small mastery helper)
fixes concern 4 — without merging the two surfaces.

## Learning-science framing (why keep two surfaces)

Practice serves **acquisition** (blocked, massed, scaffolded, on-demand,
single-skill — correct for getting *to* Skilled); Review serves **retention**
(spaced, interleaved, faded retrieval — correct for *maintaining* a Skilled
skill). Both phases are real; the redundancy is in the *code*, not the
pedagogy. So we unify the engine and keep two thin entry points with different
defaults.

## Content feasibility (validated against the 32 authored puzzles)

Every authored sequence/conditional step carries a pre-verified
`solution`, so `scoreFor(map, solution, cardLimits)` scores it synchronously at
load — no BFS. Per-skill availability:

| Skill | Puzzles | Difficulty | Mechanic-bearing? |
|---|---|---|---|
| planning | 26 | 3.0–5.0 | rich |
| loops | 20 | 3.0–5.0 | good |
| conditionals | 15 | 3.5–5.0 | obstacle-skewed |
| sequencing | 11 | **3.0–4.25 (no 5)** | present |

**Accepted limitations** (per the "select existing content" decision, not
authoring new puzzles):
- **sequencing has no difficulty-5 puzzle.** At box 4/5 the selector returns the
  hardest available (~4.25); AI hardening can push further when AI is on.
- **Rare mechanics (ice/teleport/keys/gates) appear in 1–3 puzzles each** — too
  sparse to *require a named mechanic* per box. Obstacles (20) and tasks (6) are
  abundant, so the selector biases toward "engages **any** special mechanic,"
  not a specific one.

## Architecture

### Unit 1 — `src/content/puzzleSelector.ts` (new, pure; no AI, no three)

The shared selector. Builds a memoized index over all authored sequence/
conditional steps: for each, its owning lesson's `skillIds`, its difficulty
(`scoreFor(step.map, step.solution, step.cardLimits)`), and its mechanics
(`mapMechanicsFromStep(step.map, step.availableActions)` — promoted from
`generated.ts`; see Unit 3).

```ts
export type SelectedPuzzle = {
  step: SequenceStep | ConditionalStep
  lessonId: string
  difficulty: number      // 1..5, from scoreFor
  mechanics: string[]      // from mapMechanicsFromStep
}

export type SelectOpts = {
  skillId: string
  targetDifficulty: number       // 1..5
  preferMechanics?: boolean       // bias toward steps with ≥1 mechanic
  exclude?: ReadonlySet<string>   // step ids already used this session
}

export function selectPuzzle(opts: SelectOpts): SelectedPuzzle | null
```

**Ranking:** among the skill's steps not in `exclude`, score each by
`|difficulty - targetDifficulty|`; when `preferMechanics`, subtract a fixed
bonus (e.g. `MECHANIC_BONUS = 0.75`) from that distance for steps with ≥1
mechanic, so a mechanic-bearing puzzle within ~0.75 of the target outranks a
plain puzzle exactly on target. Lowest adjusted distance wins; deterministic
tie-break by raw distance then step id. `targetDifficulty` is not clamped —
out-of-range targets naturally resolve to the closest available puzzle (handles
sequencing@5). Returns null only if the skill has no authored steps (a content
gap, surfaced loudly by callers as today).

### Unit 2 — Review wiring (`reviewItems.ts`, consumed by `ReviewPage.tsx`)

`reviewItemForSkill(skillId, box)` (`reviewItems.ts:48-63`) now selects by box:

```ts
const selected = selectPuzzle({
  skillId,
  targetDifficulty: difficultyForBox(box),  // 3 / 4 / 5 for boxes ≤2 / 3 / ≥4
  preferMechanics: box >= 3,                 // engage mechanics from box 3 up
})
```

`authoredItemForSkill` is retained as `selectPuzzle`'s fallback contract (throw
when a skill has no authored puzzle). The returned `ReviewItem` keeps its shape
(`skillId, box, puzzle, source:'authored', blankEditor:true`). Scaffolding fade
(`supportLevel(box)`) and cross-skill interleaving in `ReviewPage` are
unchanged. AI hardening stays a page-layer upgrade.

### Unit 3 — Smaller-version keeps the mechanic (`generated.ts`)

- Promote `mapMechanicsFromStep` (`generated.ts:84-95`) to an exported helper so
  Unit 1 reuses it (single source of mechanic detection).
- Rewrite `deriveSmallerVariantPuzzle` (`generated.ts:227-263`): among the
  lesson's runnable play steps, if **any** step engages a special mechanic,
  pick the fewest-move step *from the mechanic-bearing subset*; otherwise fall
  back to fewest-move overall (current behavior). The rest (concept mapping,
  GeneratedPuzzle shaping, `aiGenerated:true`) is unchanged. This guarantees a
  mechanic-bearing lesson yields a mechanic-bearing smaller version.
- The AI path (`smallerVariantTemplate` → `buildPracticeTemplate(lesson,
  {direction:'easier'})`) already carries `mechanicsGuideForLesson`, so AI
  variants are already nudged to keep mechanics; no change needed there.

### Unit 4 — Practice base via the selector (`PracticePage.tsx`, `LessonPage.tsx`)

- In `PracticePage`, replace the AI-off "abstain-and-serve-nothing" path
  (174-198) with an authored base from `selectPuzzle`. Skill = the lesson's
  first skill (`lesson.skillIds[0]`). Target difficulty is mapped from the
  existing session `DifficultyDirection` (`currentDirection()`, driven by
  `sessionRef` success ratio): `easier → 3`, `neutral → 4`, `harder → 5` (the
  same 3/4/5 bands `difficultyForBox` uses). Recent step ids feed `exclude` for
  variety. The result is shaped via `toPracticeStep`. Single-skill, full
  support, smaller-version still available. When AI is on, generation remains
  the enhancement on top (unchanged); the selector is the authored floor.
- Un-gate the "Keep practicing" link (`LessonPage.tsx:637`) — drop the
  `aiGenerationOn()` condition so Practice is offered regardless of AI state
  (it now has an authored floor).

### Unit 5 — Tier nudge shows current tier (`mastery.ts`, `LessonPage.tsx`)

- Add to `mastery.ts`:
  ```ts
  export type SkillTier = { skillId: string; label: string; tier: MasteryTier }
  export function belowSkilledTiers(state: LearnerState, lessonId: string): SkillTier[]
  ```
  Returns each below-Skilled skill (reusing `belowSkilledSkills`) with its
  current `masteryTier(...)` and a human label. **Extract** the existing private
  `SKILL_LABELS` map (`src/pages/ParentPage.tsx:22`) to a shared module (e.g.
  `src/content/skillLabels.ts`, falling back to the raw id) and consume it from
  both `belowSkilledTiers` and `ParentPage` so there is one label source. Empty
  when none are below Skilled.
- In `LessonPage`, replace the static second line (616) with a per-skill list,
  e.g. "Loops: Apprentice · Conditionals: Novice — reach Skilled to move on."
  The nudge still renders only when the list is non-empty (`showSoftGate`
  unchanged), so it stays hidden once all the lesson's skills are Skilled+. The
  "Review skills" CTA (621, → `/review/lesson/:id`) is unchanged.

## Data flow

```
authored lessons ──(scoreFor + mapMechanicsFromStep, memoized)──▶ puzzleSelector index
                                                                        │
              ┌───────────────────────────────────────────────────────┼───────────────┐
              ▼                                                         ▼               ▼
   Review: difficultyForBox(box) + preferMechanics(box≥3)   Practice: adaptive band   smaller-version
   → interleaved, faded                                     + preferMechanics, blocked  (mechanic-bearing subset)
```

## Testing

The selector and helpers are pure → unit-tested directly:

- **`puzzleSelector.test.ts`:** picks the closest-difficulty puzzle for a skill;
  `preferMechanics` promotes a mechanic-bearing puzzle within the bonus window
  over a plain on-target one; `exclude` removes seen steps and changes the pick;
  out-of-range `targetDifficulty` (e.g. 5 for sequencing) returns the hardest
  available; returns null for an unknown skill.
- **`reviewItems.test.ts`:** `reviewItemForSkill` returns *different* puzzles for
  low vs high box where the skill has range; high-box selection prefers a
  mechanic-bearing puzzle; still throws for a skill with no authored puzzle.
- **`generated.test.ts`:** `deriveSmallerVariantPuzzle` returns a
  mechanic-bearing step for a mechanic-bearing lesson, and still returns the
  fewest-move step for a plain lesson.
- **`mastery.test.ts`:** `belowSkilledTiers` lists each below-Skilled skill with
  its tier and label; returns `[]` when all are Skilled+.
- Practice/LessonPage wiring: existing component tests stay green; add a test
  that Practice renders an authored puzzle with AI off (no longer abstains) and
  that "Keep practicing" renders with AI off.

## Out of scope

- Authoring new puzzles (we accept the sequencing@5 limitation).
- Merging the Practice and Review surfaces (engine unified; surfaces stay).
- AI generation/hardening behavior (unchanged; selector is the authored floor).
- Badge rendering (Spec 1).
