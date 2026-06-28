# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Brillant — a learn-by-doing web app teaching programming logic (sequencing,
loops, if/else, algorithms) to ~10-11 year olds. Kids drag command cards to move
an explorer across interactive maps; every run gives instant feedback. AI
explanations and AI-generated practice are optional overlays that fail closed to
authored content, so the app runs identically (and offline) with AI off.

## Commands

```bash
npm run dev          # Vite dev server (http://localhost:5173)
npm test             # vitest run (once)
npm run test:watch   # vitest watch mode
npm run lint         # oxlint
npx tsc -b           # type-check (build mode); flags unused locals/params
npm run build        # tsc -b && vite build
npm run preview      # serve dist/
npm run deploy       # build, then npx firebase-tools deploy

# Single test file / single test by name:
npx vitest run src/adaptivity/mastery.test.ts
npx vitest run -t "lessonMastery"

# Deeper dead-code pass:
npx knip --no-progress
```

Before committing/deploying, run the release checklist: `npm run lint`,
`npx tsc -b`, `npm test`, `npm run build`.

Type-checking is strict: `noUnusedLocals`/`noUnusedParameters` are on, so unused
variables and parameters break `tsc -b` (and therefore `build`).

## Testing setup

Vitest is configured inline in `vite.config.ts` (`globals: true`,
`environment: 'jsdom'`, `setupFiles: ['./src/test/setup.ts']`). Tests are
co-located with source as `*.test.ts` / `*.test.tsx` and are excluded from the
production build. `src/test/setup.ts` wires up jest-dom matchers and
`cleanup()` after each test.

## Architecture

The app is layered so authoring, learner logic, persistence, and AI are
independent. Two rules drive most of the design:

1. **The engine is the only authority on correctness.** `src/engine/` holds the
   deterministic map runner, beat engine, BFS solver, difficulty scorer, and
   verifier. Nothing — including AI-generated puzzles and shared solutions — is
   rendered until the engine validates it.

2. **AI fails closed.** All model calls go through one seam, `generateText()` in
   `src/ai/aiClient.ts`, gated by `VITE_AI_*` env flags. Explain, generation,
   grounding, leak-guard, and prefetch all flow through it; any error or
   policy-leak falls back to authored content. Provider is Gemini (in-browser via
   Firebase AI Logic) or OpenAI (via the Cloud Function proxy in `functions/`,
   which keeps the key server-side).

### Layers (`src/`)

- `types.ts` — domain types (commands, maps, instructions, lessons, beat puzzles).
- `engine/` — puzzle simulation, solving, scoring, verification (see rule 1).
- `content/` — lessons authored as typed data served via a registry; scaffolds,
  share-code validation, solution-structure helpers, generated-puzzle adapters.
- `ai/` — the `generateText()` seam and everything built on it (see rule 2).
- `adaptivity/` — per-skill mastery tiers and Leitner spaced-repetition (`boxes`
  with day-spaced intervals; correct → promote, incorrect → reset to box 1).
  Pure arithmetic over persisted stats; works with AI off.
- `storage/` — swappable persistence behind one interface (localStorage or
  Firestore). `storage/progress.ts` holds immutable `LearnerState` mutations;
  `storage/types.ts` is the `LearnerState` schema.
- `context/` — `AuthContext` (optional Firebase auth, exposes `ownerKey`) and
  `LearnerContext` (active learner, progress, optimistic updates, queued writes).
- `run/` — converts an engine `RunResult` into a timeline of render frames
  (`timeline.ts`) played by `usePuzzleRun.ts`; shared by all player pages.
- `components/` — map grid, command builder, beat lane, bird guide, feedback.
- `pages/` — `HomePage`, `CoursePage`, `LessonPage`, `PracticePage`,
  `ReviewPage`, `SharePage`, `ParentPage`.
- `lib/` — auth gate, AI preference toggle, hints, sound.

### Routing & auth gate (`src/App.tsx`)

Seven lazily-loaded routes. `Gate` decides via `shouldGateForAuth` whether to
show `AuthPage`, then wraps the app in `LearnerProvider` with `ownerKey` =
`'local'` (Firebase off) or the signed-in parent's uid. `/share/:code`
deliberately bypasses the gate so shared puzzle links open without a login; it
renders under `LearnerProvider` but never reads or records learner state.

The four learner-interactive ("player") pages — Lesson, Practice, Review,
Share — all reuse the `src/run/` timeline player.

## Firebase

Optional and env-guarded (`VITE_FIREBASE_*`); without it the app runs local-only.
`npm run deploy` ships Hosting (`dist/`, SPA rewrites), Firestore rules
(`firestore.rules`), and Cloud Functions (`functions/`, Node 20). Default
project (`.firebaserc`): `brillant-95d1d3`. See `README.md` for AI-provider /
OpenAI proxy setup.
