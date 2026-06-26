# Batch 2 — Run-time UX (loop safety net + shareable puzzles)

Date: 2026-06-26
Status: Draft (awaiting review)
Features: #8 Loop/while safety net UI, #10 Shareable puzzle links

## Problem

- **#8:** The engine already detects runaway loops (`'loopStuck'` status,
  `MAX_WHILE_ITERATIONS = 200`, `MAX_STEPS = 600`, and a "body made no progress"
  guard in `src/engine/map.ts`) and `src/engine/checker.ts` already returns a
  distinct message ("Your loop never stopped — check its condition so it can
  finish."). But the run UI treats `loopStuck` like any other crash — no visual
  signal *which* loop spun, no live iteration count, and no kid-facing hint that
  the issue is "it never stops" vs. "you hit a rock". Kids can't tell what to fix.
- **#10:** There's no way to send a puzzle to a friend. The engine, solver, and
  verifier already make it trivial to validate a self-contained puzzle, so a
  stateless share code is low-risk and high-fun.

## Goals

1. Make runaway loops visually obvious and point at the offending block.
2. Let a kid (or parent/teacher) share a puzzle via a URL, and let a recipient
   open it in a read-only "solve it" view with no auth or AI required.

## Non-goals

- Changing engine safety caps or the `loopStuck` status semantics.
- Server-side share link storage / analytics. Codes are stateless and
  self-contained; no backend round-trip.
- Sharing full lesson state or progress — only a single puzzle.

## Design

### #8 Loop/while safety net UI

Two parts: a small engine enrichment (optional, recommended) and a UI layer.

**Engine enrichment** (`src/engine/map.ts`, `RunResult`):

- Add `loopIterations: { index: number; iterations: number }[]` to `RunResult` —
  one entry per loop/while instruction encountered, keyed by its position in the
  flattened instruction walk. The interpreter already tracks `iterations` for
  while; add the same for `for` loops (just the count). On `loopStuck`, include
  the index of the block that tripped the cap as `stuckBlockIndex` on the result.
- This is additive; existing callers ignore the new fields. No status changes.

**UI** (`src/components/MapGrid.tsx`, `src/components/CommandSequence.tsx`,
`src/pages/LessonPage.tsx`, `src/pages/PracticePage.tsx`):

- When `run.status === 'loopStuck'`, the explorer tile gets a distinct
  "spinning" state (a small spinner ring + a "stuck" badge) instead of the
  crash splat. New `loopStuck` prop on `MapGrid`.
- `CommandSequence` accepts an optional `runIterations?: Map<string, number>`
  (keyed by node id) and renders a live badge on each loop/while block header:
  "ran 4×". For while loops that hit the cap, the badge turns red with
  "never stops". The LessonPage/PracticePage run loop already steps through
  `run.path`; it can additionally feed per-index iteration counts to the editor.
  Mapping engine instruction indices to editor node ids is done by walking the
  program in parallel (same order both sides use), produced by a small helper in
  `src/components/programNodes.ts` (`iterationMap(program, run)`).
- The existing checker message stays; the badge is the visual companion.

**Why this is mostly UI:** the hard safety work is done. The only engine change
is exposing counts the interpreter already computes, so the UI can point at the
right block.

### #10 Shareable puzzle links

**Encoding** — new `src/content/shareCode.ts`:

```ts
export function encodePuzzle(p: ShareablePuzzle): string
export function decodePuzzle(code: string): ShareablePuzzle | null
```

- Payload is the `GeneratedPuzzle`-ish shape: `map`, `availableCommands`,
  `availableActions?`, `blocks?`, `predicateOptions?`, `loopRange?`,
  `cardLimits?`, `solution`, `goal?`, `prompt?`, `feedback?`. Omit
  `optimal`/`difficulty`/`concept` (recompute via solver on decode).
- Format: `v1.<base64url(JSON.stringify(payload))>`. The `v1.` prefix lets the
  format evolve. `decodePuzzle` returns `null` on any parse/shape failure.
- Validation on decode: run the solution through `runInstructions` + the solver
  to confirm it actually reaches the goal; reject otherwise (a tampered or
  truncated code never shows a broken puzzle). Reuse `parseConceptPuzzle`-style
  guards from `src/ai/generation.ts` where possible.

**Registry** — `src/content/registry.ts` gains `registerSharePuzzle(code, puzzle)`
keyed by the code so the share route can resolve it; or the share page just
decodes inline (preferred — no registry needed). Decision: decode inline.

**Route** — `src/App.tsx` adds `const SharePage = lazy(...)` and a
`/share/:code` route. `SharePage` decodes, validates, and renders a single
puzzle in a stripped-down workspace (map + `CommandSequence` + Run/Reset +
feedback). No prefetch, no adaptivity, no AI, no auth gate (shareable to anyone).
On invalid code: a friendly "This puzzle link is broken" screen + link home.

**Share buttons** (Agent B owns these; Agent A does not touch the lesson-complete
card):
- `src/pages/LessonPage.tsx` lesson-complete card: a "Share this puzzle" button
  that encodes the *current step's* puzzle (only for `sequence`/`conditional`
  steps that carry a `solution`) and copies `<origin>/share/<code>` to clipboard
  with a toast.
- `src/pages/PracticePage.tsx` after a correct run: "Share this puzzle" using the
  generated puzzle (which already has all fields). Disabled if AI off and no
  generated puzzle is in hand.

**Privacy:** no learner data, no PII, no progress in the code — only the puzzle
itself. The kid's name/learners are never encoded.

## Alternatives considered

- **No engine change for #8** (badge only on the block the kid last edited).
  Rejected: guessing which loop spun is unreliable when several are nested.
  Exposing the interpreter's real counts is cheap and authoritative.
- **Server-hosted share links** (short codes, analytics). Rejected: needs a
  backend, adds privacy surface. Stateless codes fit the local-first ethos and
  the codes are short enough for kid use (a QR or copy-paste).
- **Binary compact encoding.** Rejected: base64url JSON is debuggable and the
  payload is small (<1KB typical). Switch later if URLs get too long.

## Testing

- `engine/map.test.ts`: `loopIterations` populated for nested loops; while cap
  sets `stuckBlockIndex`.
- `shareCode.test.ts`: round-trip encode/decode; invalid/old-version codes
  return null; a code whose solution no longer solves returns null.
- `SharePage` smoke test: valid code renders a playable puzzle; invalid code
  shows the broken-link screen.
- `CommandSequence` test: iteration badge renders and turns red on cap.

## Open decisions (flag for reviewer)

1. **`loopStuck` streak/progress impact.** Proposal: a `loopStuck` run counts
   as an incorrect attempt (it already does — it's not `success`). No change.
2. **Share route auth gate.** Proposal: none — shareable to anyone, no profile
   needed. Solving a shared puzzle does not record into any learner's stats
   (no active learner guaranteed). Confirm this is desired.
3. **Share button copy mechanism.** `navigator.clipboard.writeText` with a toast
   fallback to a text field on unsupported browsers.

## Files touched

Agent A (#8):
- `src/engine/map.ts` — `loopIterations`, `stuckBlockIndex` on `RunResult`.
- `src/components/programNodes.ts` — `iterationMap(program, run)`.
- `src/components/MapGrid.tsx` — `loopStuck` visual state.
- `src/components/CommandSequence.tsx` — iteration badge prop.
- `src/pages/LessonPage.tsx`, `src/pages/PracticePage.tsx` — feed iterations
  (run-workspace edits only; Agent A avoids the lesson-complete card).

Agent B (#10):
- `src/content/shareCode.ts` — new encode/decode + validate.
- `src/App.tsx` — `/share/:code` route + lazy `SharePage`.
- `src/pages/SharePage.tsx` — new, stripped-down puzzle player.
- `src/pages/LessonPage.tsx` — share button on the **lesson-complete card only**.
- `src/pages/PracticePage.tsx` — share button after a correct run.

Shared-file discipline: `LessonPage.tsx` is touched by both agents on disjoint
regions (Agent A = run workspace; Agent B = completion card). Sequence the merge
carefully; the spec's region split makes conflicts trivial to resolve.
