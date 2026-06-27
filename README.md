# Brillant

**Subject: Programming Logic (built for 5th graders, ages 10–11).**

A Brilliant-inspired, learn-by-doing web app. Kids learn programming logic —
sequencing, for-loops, while-loops, if/else, and real algorithm challenges — by
dragging command cards to guide an explorer across interactive treasure maps.
Every run gives instant feedback: hand-written by default, with optional
AI-assisted explanations and verified AI-generated practice puzzles layered on
top. The AI features are env-guarded and fail closed to authored content, so the
app runs identically (and fully offline) with AI switched off.

## What it does

- **Interactive lessons**, not videos or walls of text. Each lesson is a short
  sequence of steps: a concept, then hands-on puzzles.
- **Direct manipulation**: drag/tap command cards into order, nest them inside
  Repeat / While / If blocks, reorder them, and press Run to watch the explorer
  move tile by tile.
- **Rich puzzle mechanics**: obstacles, bridges, fetch-and-carry cargo runs,
  checkpoints, teleports, gates & pressure plates, keys & doors, ice slides,
  counters, binary search, and "Dodge the Beat" rhythm puzzles.
- **Instant, specific feedback** on every run, right or wrong — hand-written by
  default, plus an optional "Explain my mistake" from Rico the bird.
- **Manual escalating hints** that nudge without revealing the answer, capped by
  a "watch Rico show you" solution replay. Hints never auto-reveal on a failed
  run, and an anti-leak guard blocks the AI from ever reciting the solution.
- **"Try a smaller version" remediation** for stuck learners. The app serves a
  deterministic authored warm-up immediately, then swaps in a fresh verified AI
  variant if background generation finishes in time.
- **Adaptive practice**: endless verified AI-generated puzzles that aim for the
  learner's success band (~80%), with difficulty easing or leveling up per round.
- **Progress that persists** across sessions and resumes mid-lesson.
- **Self-contained share links** for solved puzzles. `/share/:code` links open
  publicly even when Firebase auth is enabled, and every shared solution is
  re-verified before it is rendered.
- **Habit loop**: day streaks, a course progress bar, badges, and a saved
  portfolio of solved puzzles, capped with a 3D treasure-chest reward scene when
  WebGL is available.
- **Parent dashboard** with skill mastery, puzzle-outcome breakdown, streaks,
  badges, and recent creations.
- **Mobile-friendly** and touch-first.

## Course

1. **Sequencing & Cargo** — plan the exact route, then haul fetch-and-carry cargo.
2. **For Loops** — repeat a fixed body a set number of times.
3. **While Loops** — keep going until something stops you, no counting needed.
4. **If / Else** — sense the world and let the explorer choose its path.
5. **All Together Now** — capstone mixing every tool.
6. **Challenges** — famous coding-interview puzzles rebuilt for the explorer
   (binary search, FizzBuzz-style "Dodge the Beat" rhythm puzzles).

## Testing

```bash
npm run lint     # oxlint
npx tsc -b       # type-check, including unused locals/parameters
npm test          # run once
npm run test:watch
npm run build    # type-check + production Vite build
```

Vitest covers the map engine, beat engine, answer checker, BFS solver,
difficulty scorer, verifier, content registry, share-code validation,
scaffolds, AI client / explain / generation / grounding / leakGuard,
adaptivity logic, sound mute state, UI components, and lesson-flow integration.

For a deeper dead-code/export pass, run:

```bash
npx knip --no-progress
```

Known Knip false positives: `functions/src/index.ts` and `functions/lib/index.js`
are Firebase Functions entrypoints reached through `firebase.json` /
`functions/package.json`, and several exported domain types are intentionally
kept as app-wide contracts.

## Tech stack

- React + Vite + TypeScript
- Tailwind CSS v4
- React Router
- Three.js for the reward scene (loaded only by the reward components)
- Firebase (Auth + Firestore) for cloud sync and hosting — optional and
  env-guarded; the app runs fully on local persistence without it.

## Run locally

```bash
npm install
npm run dev
```

Then open the printed URL (defaults to `http://localhost:5173`).

## Build

```bash
npm run build
npm run preview
```

## Architecture

- `src/types.ts` — domain types (commands, maps, instructions, lessons, beat puzzles).
- `src/engine/` — deterministic map runner, beat engine, BFS solver, difficulty
  scorer, and verifier. The sole authority on whether any puzzle or solution is
  valid — AI proposals must pass it before they are shown.
- `src/content/` — lessons authored as typed data, served via a content
  registry; plus scaffolds, share-code validation, solution-structure helpers,
  and generated-puzzle adapters/fallbacks for AI practice.
- `src/ai/` — a single `generateText()` seam (`aiClient.ts`) with provider swap
  (Gemini in-browser via Firebase AI Logic, or OpenAI via a Cloud Function
  proxy). Explain, verified generation, grounding, leak guard, diagnostics, and
  practice / review / smaller-variant prefetch all flow through it and fail
  closed to authored content.
- `src/adaptivity/` — per-skill mastery and adaptive difficulty direction (pure
  arithmetic over persisted stats; flag-gated, works with AI off).
- `src/storage/` — persistence: a localStorage backend now, with a Firebase
  backend ready to drop in behind the same interface.
- `src/context/` — `AuthContext` (optional Firebase auth) and `LearnerContext`
  (active learner, progress, and actions).
- `src/components/` — map grid, command builder, beat lane/puzzle, bird guide, feedback.
- `src/pages/` — home, course path, lesson player, practice player, parent dashboard.
- `functions/` — optional OpenAI proxy Cloud Function that holds the API key
  server-side so it never ships in the browser bundle.

## Firebase (optional, for cloud sync + deploy)

1. Create a Firebase project and a Web App.
2. Copy `.env.example` to `.env` and fill in the `VITE_FIREBASE_*` values.
3. Set the Hosting project id in `.firebaserc`.
4. Deploy:

```bash
npm run deploy
```

The deploy script builds first, then runs `npx -y firebase-tools@latest deploy`
so it does not require a globally installed Firebase CLI. Without Firebase env
values the app runs in local-only mode. Public `/share/:code` routes intentionally
bypass the auth gate so shared puzzle links work for families without a login.

### Release checklist

Before committing or deploying:

```bash
npm run lint
npx tsc -b
npm test
npm run build
```

Then deploy with:

```bash
npm run deploy
```

## AI provider (Gemini or OpenAI)

The AI features (e.g. "Explain my mistake", problem generation) call a single
seam, `generateText()` in `src/ai/aiClient.ts`, and fail closed to authored
content on any error. Two providers are supported:

- **Gemini** (default): runs through Firebase AI Logic directly in the browser.
  Set `VITE_AI_PROVIDER=gemini` (or leave unset).
- **OpenAI**: the key must never ship in the browser bundle, so requests go
  through a Firebase Cloud Function proxy in `functions/` that holds the key as
  a secret.

### Using OpenAI

Cloud Functions require the Firebase Blaze (pay-as-you-go) plan.

```bash
cd functions && npm install        # one-time
firebase functions:secrets:set OPENAI_API_KEY   # paste your key when prompted
firebase deploy --only functions
```

Then in `.env`:

```bash
VITE_AI_PROVIDER=openai
VITE_AI_ENABLED=true
VITE_AI_EXPLAIN_ENABLED=true       # plus whichever features you want
VITE_AI_OPENAI_MODEL=gpt-4o-mini   # optional override
```

For local testing without deploying, put the key in `functions/.env` as
`OPENAI_API_KEY=...` (gitignored) and run `firebase emulators:start --only functions`.
