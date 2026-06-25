# Brillant

**Subject: Programming Logic (built for 5th graders, ages 10–11).**

A Brilliant-inspired, learn-by-doing web app. Kids learn the foundations of
programming logic — sequencing, ordering, and finding the shortest path — by
dragging command cards to guide an explorer across interactive treasure maps.
Every answer gives instant, hand-written feedback. No AI is used anywhere in
this MVP (Phase 1).

## What it does

- **Interactive lessons**, not videos or walls of text. Each lesson is a short
  sequence of steps: a concept, then 5 hands-on puzzles.
- **Direct manipulation**: drag/tap command cards into order, reorder them, and
  press Run to watch the explorer move tile by tile.
- **Instant, specific feedback** on every run, right or wrong, written by hand.
- **Progress that persists** across sessions and resumes mid-lesson.
- **Habit loop**: day streaks, a course progress bar, and a saved portfolio of
  solved puzzles.
- **Parent dashboard** with skill mastery, struggle signals, and recent creations.
- **Mobile-friendly** and touch-first.

## Course (Phase 1)

1. **Order Matters** — programs run commands in order (sequencing).
2. **Avoid the Rocks** — order changes the result; route around obstacles.
3. **Shortest Safe Path** — reach the treasure in the fewest moves.
4. **If There Is a Bridge** — simple if/else conditionals based on map state.
5. **Choose the Right Tool** — capstone combining sequencing, obstacles, and conditionals.

## Testing

```bash
npm test          # run once
npm run test:watch
```

Vitest covers the map engine, answer checker, progress/streak logic, content registry, sound mute state, UI components, and lesson-flow integration.

## Tech stack

- React + Vite + TypeScript
- Tailwind CSS v4
- React Router
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

- `src/types.ts` — domain types (commands, maps, steps, lessons).
- `src/engine/` — deterministic map runner and answer checker (no AI).
- `src/content/` — lessons authored as typed data, served via a content registry.
- `src/storage/` — persistence: a localStorage backend now, with a Firebase
  backend ready to drop in behind the same interface.
- `src/context/LearnerContext.tsx` — active learner, progress, and actions.
- `src/components/` — map grid, command builder, feedback.
- `src/pages/` — course path, lesson player, parent dashboard.

## Firebase (optional, for cloud sync + deploy)

1. Create a Firebase project and a Web App.
2. Copy `.env.example` to `.env` and fill in the `VITE_FIREBASE_*` values.
3. Set the Hosting project id in `.firebaserc`.
4. Deploy:

```bash
npm run deploy
```

Without these values the app runs in local-only mode.
