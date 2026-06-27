# Layer a runtime AI Preference beneath the build-time AI Capability ceiling

AI was controlled only by build-time env flags (`VITE_AI_*`), read as module-level
constants at ~26 call sites — invisible and unchangeable by users. We are adding a
single parent-controlled **AI Preference** (one master on/off in the Parent page)
while keeping the env flags as a hard **AI Capability** ceiling: the runtime
Preference can only turn off features the build already permits, never conjure AI a
build shipped without. The toggle is hidden when there is no AI Capability, defaults
ON when there is (today's behaviour is unchanged), and is stored device-side in
localStorage — mirroring the existing sound preference (`src/lib/sound.ts` +
`SoundToggle`).

## Considered Options

- **Toggle as the only control (drop env at runtime)** — simpler mental model, but
  loses the build-time kill-switch and risks calling AI (cost/keys) in builds never
  meant to. Rejected.
- **Default OFF / opt-in** — privacy-and-cost-first, but silently removes Rico's
  hints and generation for every existing learner. Rejected; off is one tap away.
- **Granular per-feature toggles** — more control, but more UI and awkward states
  (review on, explain off). Rejected for one legible master switch.

## Consequences

- The ~26 sites that read `aiEnabled`/`aiExplainEnabled`/`aiGenerationEnabled`/
  `aiAdaptiveEnabled` as constants must become **runtime** checks of
  `Capability && Preference`. Introduce an `src/lib/aiPreference.ts` (pub/sub +
  localStorage, like `sound.ts`) and resolve effective flags through accessor
  functions / a `useAiEnabled()` hook rather than import-time constants.
- Every AI path already has an authored fallback, so flipping the Preference off is
  safe by construction; the Review Session in particular stays available (ADR-0002).
