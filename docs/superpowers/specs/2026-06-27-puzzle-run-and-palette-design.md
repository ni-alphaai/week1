# Puzzle Run module + palette consolidation — design

Outcome of an architecture grilling session (2026-06-27) on two deepening
candidates from the review. Vocabulary follows [CONTEXT.md](../../../CONTEXT.md);
the keystone decision is recorded in
[ADR-0001](../../adr/0001-precomputed-run-timeline.md).

## Problem

The run-and-check loop is copied across **five** sites — `LessonPage.handleRun`,
its inner `VariantPlayer.handleRun`, `PracticePage`, `ReviewPage`, `SharePage` —
each with a hand-rolled `resetRun`/`resetRunState` twin clearing ~15 scattered
state vars. Separately, the editor palette builder (`buildPalette` /
`buildPracticePalette` ×2 / `buildSharePalette`) is duplicated byte-for-byte
across four pages.

## Candidate 1 — the Puzzle Run module (`src/run/`)

### Shape: precomputed timeline + thin play hook

Every per-tile value (checkpoints, gates, keys, counter, search window, carried
tasks, facing, active strip chip) is a pure function of `(RunResult, pathIndex)`.
So we precompute the whole animation up front, then play it.

```ts
// src/run/timeline.ts — pure, no React

interface MazeRenderState {        // a Render Frame; flat, self-neutralizing
  explorer: Position
  facing: Command
  activeTile: Position | null
  activeStepIndex: number          // Run Strip chip
  taskPicked: number
  taskDropped: number
  isTeleporting: boolean
  isDeparting: boolean
  // authored-lesson fields — neutral ({}, 0, undefined) on practice/share:
  checkpointsDelivered: number
  gateState: Record<string, boolean>
  keysCollected: number
  counter: number | undefined
  searchWindow: SearchWindow | null
}

interface RunOutcome {
  solved: boolean
  crashed: boolean
  loopStuck: boolean
  message: string
  run: RunResult                   // raw — for recording + iterationMap
  instructions: Instruction[]
}

interface RunTimeline {
  frames: MazeRenderState[]        // one per path tile + final settle frame
  cues: (SoundName | null)[]       // parallel sound track (incl. bridge)
  outcome: RunOutcome
}

function buildRunTimeline(run: RunResult, map: MapConfig): RunTimeline
```

`buildRunStrip` (today `components/runStripProgress.ts`) folds into
`buildRunTimeline`; the old file and its test are deleted, coverage moves to
`src/run/timeline.test.ts`.

### The hook

```ts
// src/run/usePuzzleRun.ts — owns timers + animating flag only
function usePuzzleRun(opts: {
  map: MapConfig
  check: () => RunResult            // page builds spec + converts program
  onStart?: () => void              // e.g. scroll map into view
  onSettle?: (outcome: RunOutcome) => void  // page-specific Attempt recording
}): {
  frame: MazeRenderState            // current frame (idle frame before a run)
  status: 'idle' | 'running' | 'solved' | 'crashed' | 'loopStuck'
  feedback: { status: 'correct' | 'incorrect'; message: string } | null
  handleRun: () => void
  reset: () => void
}
```

Decisions and rationale:

- **`check: () => RunResult` thunk** — the page keeps ownership of spec-building
  (`specForStep` vs inline `{map, successRule, …}`) and `program.map(nodeToInstruction)`
  (candidate-5 territory). The hook never learns `ProgramNode`/`Instruction`/spec shapes.
- **Sounds are precomputed cues**, fired by the hook from `cues[]` — zero page
  sound code. `bridge` is decided in the builder, which has the map.
- **`onSettle(outcome)`** is the only page-specific seam: `recordResult` (Lesson),
  `recordPracticeResult` + session bump (Practice), once-guarded `recordReview` +
  `clearReview` (Review), nothing (Share); plus celebrate and `lastAttempt`/`iterations`.
- **Ghost stays separate.** The solution demonstration is a different concept (no
  Attempt, drives the `ghostStep` overlay not the explorer) and a single site —
  folding it in would dilute the module with a suppression flag.

### MapGrid (candidate 4 deliberately out of scope)

MapGrid's interface is unchanged. Call sites spread the frame:

```tsx
<MapGrid map={map} {...frame}
  crashed={run.status === 'crashed'} solved={run.status === 'solved'}
  loopStuck={...} ghostPath={ghostPath} ghostStep={ghostStep} />
```

The spread collapses most of the per-prop threading for free. Fully narrowing
MapGrid to a single `state` value remains a clean follow-up (candidate 4).

## Candidate 2 — one `buildPalette`

```ts
// src/components/buildPalette.ts  (beside PaletteItem in CommandSequence.tsx)
export interface PaletteSource {
  availableCommands: Command[]
  availableActions?: Action[]
  blocks?: BlockKind[]
  cardLimits?: CardLimits
}
export function buildPalette(s: PaletteSource): PaletteItem[]
```

`PlayStep`, `SequenceStep`, and `ShareablePuzzle` all satisfy `PaletteSource`
structurally — no union, no coupling. Four call sites collapse to
`buildPalette(step)` / `buildPalette(puzzle)`. Gets `buildPalette.test.ts`.
Lives in `components/` (not `content/`) to avoid inverting the layering, since
`PaletteItem` is a component-layer type.

## Migration plan (tests-first, incremental)

1. `buildPalette.ts` + test; swap the four call sites. (Isolated, low risk.)
2. `src/run/timeline.ts` + `timeline.test.ts` (port `runStripProgress` tests, add
   frame/cue/outcome coverage). Delete `runStripProgress.ts`.
3. `src/run/usePuzzleRun.ts`.
4. Migrate pages simplest → hardest, running the suite after each: **Share →
   Practice → Review → Lesson + VariantPlayer**. Existing page tests
   (`sharePage`, `practicePage`, `lessonPageResume`, `lessonVariantResume`,
   `integration/lessonFlow`) guard behavior.
