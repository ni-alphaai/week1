# Badge medals: colored enamel inlays + holographic diamond — Design

**Date:** 2026-06-28
**Status:** Design — awaiting user review before plan
**Branch:** feat/badge-redesign

## Problem

Two issues with the current badge medals (rendered in
`src/components/BadgeMedalScene.tsx`):

1. **The diamond coin is too bright.** `DIAMOND_GEM` stacks several hot
   parameters (`envMapIntensity: 3`, an `emissive` glow, full `iridescence`,
   `reflectivity: 1`, `clearcoat: 1`). Together they make the diamond read as a
   self-lit bulb rather than a gem.
2. **The coins have no color.** Engravings (emblem + laurels + crest stars) are
   struck tone-on-tone into the metal via a grayscale `bumpMap` — there is no
   color anywhere. The user wants CS2-operation-coin-style color.

## Reference

CS2 / CS:GO operation coins (two reference images provided):

- **Shanghai 2024 (diamond-style):** whole-coin holographic rainbow foil, gold
  metallic engravings struck on top, a colored enamel center disc behind the
  emblem.
- **Copenhagen 2024 tier ladder (bronze / silver / gold / diamond):** the same
  coin design across tiers. Bronze/silver/gold are **solid metal with
  tone-on-tone engravings**; **diamond is full prismatic holographic foil**. All
  four share **one consistent colored enamel center disc** (blue) behind the
  emblem — only the surrounding metal changes per tier. The engraved ring stays
  metal tone-on-tone on every tier; the *only* colored region on the metal tiers
  is the center disc.

The design below follows this language faithfully.

## Decisions (locked during brainstorming)

1. **Holo is diamond-only and whole-face** (not a per-tier ring; not on
   silver/gold). View-dependent — the rainbow shifts as the coin rotates.
2. **Diamond reads as a cool, clear ice/glass gem** once toned down; the holo
   foil carries the color punch the gem loses.
3. **Color lives in colored enamel inlays**, not in the metal tint and not in
   the engravings. The engravings stay metallic tone-on-tone on all tiers.
4. **Enamel is the center disc only** (CS2-faithful — the metal tiers have no
   enamel in the engraved ring). One color per badge; no separate ring accent.
5. **Enamel color is per-badge**, keyed to the badge's concept, with a
   deterministic hash→hue fallback for badges not explicitly mapped.
6. **Locked coins** stay dark desaturated steel — no enamel color, no holo.
   Color and shimmer are the reward for earning the badge.

## Design

### A. Diamond material — tone down + whole-face holo

Retune the diamond `MeshPhysicalMaterial` so it reads as clear refractive ice
with a view-dependent prismatic shimmer across the whole face, instead of a
glowing bulb:

- **Tone down the glare:** reduce `envMapIntensity` (≈3 → ≈1), remove or zero the
  `emissive` glow, ease `reflectivity` and `clearcoat`/`clearcoatRoughness` so
  highlights are crisp but not blinding. Keep low metalness (dielectric gem) and
  the low roughness that gives it clarity.
- **Whole-face holographic foil:** the view-dependent rainbow is exactly what
  `MeshPhysicalMaterial.iridescence` (thin-film interference) produces — hue
  shifts with view angle. Retune it so the prismatic shimmer spreads across the
  entire coin face + rim rather than the current localized sheen: keep
  `iridescence: 1`, widen/tune `iridescenceThicknessRange` and tune
  `iridescenceIOR` for a full-spectrum sweep.

Exact starting numbers are an implementation/tuning concern for the plan; the
*intent* above governs.

### B. Enamel center disc (all tiers)

A glossy colored enamel disc behind the emblem, on silver, gold, and diamond.

- **Reads as dielectric enamel, not painted metal.** The face material gains:
  - a **colorMap** — the per-badge enamel color filling the center-disc zone;
    the metal/engraving zone is left at the tier metal color.
  - a **metalnessMap** — `0` (dielectric) inside the enamel disc, `1` (metal)
    elsewhere, so the enamel reads as glossy paint, not tinted metal.
  - a **roughnessMap** — a glossy enamel value inside the disc, the tier's metal
    roughness elsewhere.
- The **emblem still strikes into the enamel tone-on-tone** via the existing
  grayscale bump heightfield — the bump map is unchanged; we add color/metalness/
  roughness maps registered to the same center-disc geometry.
- **Diamond** also gets the enamel center disc (matching the Copenhagen diamond's
  blue center), composited over the holo foil metal.

### C. Per-badge palette

A new focused module `src/content/badgeEnamel.ts`:

- `BADGE_ENAMEL: Record<string, string>` — explicit center-disc color per
  achievement badge id, keyed to concept (e.g. loops → teal, while → cyan,
  if → purple, practice → amber, comeback → warm red, optimal → gold-green,
  speedy → electric blue). Exact hex values chosen in the plan.
- `enamelColorFor(id: string): string` — resolver: explicit map entry if present,
  else a **deterministic hash(id) → hue** fallback (stable HSL with fixed
  saturation/lightness tuned to read as enamel), so lesson-award badges and any
  future ids get a distinct, stable color without hand-authoring every one.
- `badges.ts` stays focused on award/evaluation logic; it may re-export
  `enamelColorFor` if convenient for callers.

### D. Locked coins

Unchanged from today: dark desaturated steel (`LOCKED_COLOR`), no enamel color
map, no holo. The reward semantics are preserved.

## Components & data flow

- **`src/content/badgeEnamel.ts`** (new, pure) — `BADGE_ENAMEL` + `enamelColorFor`.
  No three import; unit-testable.
- **`src/components/BadgeMedalScene.tsx`** (modified, the only three module):
  - Diamond material retune (section A).
  - New sibling to `makeEmblemHeightfield` that renders the **enamel
    color/metalness/roughness maps** for a badge (center-disc zone colored via
    `enamelColorFor(id)`, metal zone neutral), returning `THREE.CanvasTexture`s
    with appropriate color spaces (color map sRGB; metalness/roughness
    NoColorSpace).
  - Per-badge face-material construction wires the new maps onto silver/gold/
    diamond materials; locked path unchanged.
- Data flow: badge id → `enamelColorFor(id)` → enamel color baked into the
  color map → `MeshPhysicalMaterial` with color/metalness/roughness/bump maps →
  shared renderer draws the tile. No new runtime inputs.

## Testing

WebGL does not run under jsdom (the scene never instantiates in tests), so:

- **Unit tests** cover the pure palette module `badgeEnamel.ts`:
  - explicit ids return their mapped color;
  - unknown ids return a stable color (same id → same color across calls);
  - distinct ids generally return distinct colors;
  - returned values are valid CSS colors.
- The existing `BadgeMedalGrid.test.tsx` continues to assert the non-WebGL
  fallback/structure; no scene-rendering assertions are added.
- Release checklist before merge: `npm run lint`, `npx tsc -b`, `npm test`,
  `npm run build` (confirm `three` stays a separate `threeEnv` chunk).
- Manual browser visual verification (diamond no longer blinding; holo shifts on
  rotation; enamel centers read as glossy colored inlays; locked stays dark) is
  the user's step.

## Scope / non-goals

- No tinted metal bodies (color is enamel-only, per decision 3).
- No enamel in the engraved ring (center disc only, per decision 4).
- No per-badge holo (holo is diamond-only, per decision 1).
- No new dependencies; three stays code-split; changes confined to
  `BadgeMedalScene.tsx` + the new `badgeEnamel.ts`.
