# Analysis: Background music & further Three.js use in Brillant

Two research questions raised during the lesson-review + achievements work. Both are
**decisions recorded here**, not open tasks. Audience: ~10–11 year-olds learning programming
logic via drag-and-drop puzzles; may use low-end school tablets; app must run identically (and
offline) with AI off.

---

## 1. Is background music appropriate for this learning app?

**Decision: No background music. Keep the existing synthesized sound *effects*.** If music is
ever added, it must be default-OFF, instrumental-only, with its own persisted toggle separate
from the SFX mute.

### Why
Coding puzzles are a working-memory-heavy reasoning task — the case where the evidence is most
against continuous background audio.

- **Coherence principle (multimedia learning).** Learning improves when extraneous material —
  explicitly including background music/sounds — is excluded; the effect is large and robust.
  Moreno & Mayer showed added music/sound *hurt* retention and transfer.
  https://www.cambridge.org/core/books/abs/cambridge-handbook-of-multimedia-learning/principles-for-reducing-extraneous-processing-in-multimedia-learning-coherence-signaling-redundancy-spatial-contiguity-and-temporal-contiguity-principles/CD5B7AE1279A9AB81F8EEBB53DBEC86E
- **Music as a "seductive detail," worse for low working memory.** Lehmann & Seufert (2017):
  background music reduced comprehension most for low-WM learners (the group children skew
  toward); the authors "cannot recommend learning with background music."
  https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2017.01902/full
- **Children 9–11 filter background sound worse than adults.** Klatte et al. (2013): noise-induced
  serial-recall drop was ~39% in 2nd-graders vs ~11% in adults; adult-like masking only arrives
  ~age 10. https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2013.00578/full
- **Lyrics are worst; instrumental is at best neutral, not better than silence.** "Should We Turn
  Off the Music?" (J. Cognition, 2023). https://journalofcognition.org/articles/10.5334/joc.273
- **Accessibility.** Auto-playing audio >3s needs an independent control (WCAG 1.4.2); background
  audio should be absent/switchable/≥20 dB down (WCAG 1.4.7); game-accessibility guidance wants
  *separate* mutes for music vs effects. Autism/sensory sensitivity and the ADHD split (white/pink
  noise helps ADHD kids but mildly hurts neurotypical kids) all argue for control, not an
  on-by-default. https://www.w3.org/WAI/WCAG21/Understanding/audio-control.html ·
  https://gameaccessibilityguidelines.com/provide-separate-volume-controls-or-mutes-for-effects-speech-and-background-music/
- **Peer products.** The logic-puzzle peers closest to Brillant — Scratch, ScratchJr, Code.org,
  Lightbot — ship **no** ambient music in the puzzle experience. Edutainment apps (Khan Kids,
  Prodigy) keep music default-on but trivially mutable, and Prodigy separates music from SFX volume.

### Functional SFX are different — keep them
Brief, meaningful, accurate feedback cues (the app's `src/lib/sound.ts` synthesized effects) are a
favorable category: they aid error-awareness and engagement and are *not* "seductive details."
Keep them, keep them brief/accurate, and keep their independent mute.

---

## 2. Further applications of Three.js in this app

The app already uses Three.js for one thing — the lazy, single-context treasure-chest reward
(`TreasureChestScene.tsx` via `TreasureChestReward.tsx`) with WebGL detection + reduced-motion
fallback. This work added a second: the single-context 3D badge medal grid.

**Decision: spend Three.js budget only on *ephemeral reward/celebration* moments on the existing
lazy one-context seam. Do not 3D-ify functional/always-on surfaces.**

### Worth it
- **3D achievement medals** (built this round) — strong motivation, contained cost, single shared
  context + 2D fallback.
- **Ephemeral 3D solve-celebration burst** (optional next) — the "my program worked" moment is the
  core reinforcement event; a short mount-on-solve / unmount-after effect on the same one-context
  seam is the highest-value remaining idea.

### Avoid
- **3D-ifying the core maze.** The task is *logical, not spatial*; 3D adds camera/perspective/
  occlusion the learner must mentally undo (extraneous cognitive load) and forces a *persistent*
  WebGL context during the core interaction — worst case for low-end tablet responsiveness, battery,
  and accessibility. Lightbot (deliberately distraction-free) is the relevant peer.
- **3D Rico / mascot** — persistent context, high modeling cost, ~no learning value; SVG wins.
- **Shader/animated backgrounds** — always-on GPU/battery drain for decoration.

### Performance & accessibility rules (already modeled by `TreasureChestScene`)
Keep WebGL surfaces ephemeral and one-at-a-time; **one context per surface, never one per tile**
(mobile browsers cap live contexts very low — Android ~8, mobile Firefox as low as ~2/origin —
hence the medal grid uses a single renderer with per-tile `setViewport`/`setScissor`); release
probe contexts immediately; cap pixel ratio ≤2; render on-demand; `InstancedMesh`/shared materials
+ full dispose on unmount; lazy `import()` so three stays code-split; always a DOM/SVG fallback and
never put functional content behind WebGL.
