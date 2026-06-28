# Spec 1 — Badge rendering: drop enamel, holographic diamond

**Date:** 2026-06-28
**Branch:** feat/badge-redesign
**Status:** Approved design, ready for implementation plan

## Problem

The earned-badge medals were rebuilt with a colored "inset enamel" center disc
(a sunken well + radial ORM/color maps) on every tier. The rendered result
reads poorly — the user rejected the effect. The goal coin language is the
**CS2 Major operation coin**: clean struck metal for the metal tiers and a
**full-face holographic rainbow shimmer** on the diamond tier (the iridescent
"Austin 2025" look).

## Goal

Remove the enamel system from all coins, leaving silver/gold as clean struck
metal and making the diamond a full-face holographic gem, while keeping the
brightness/exposure fixes already in the working tree.

## Scope (one subsystem: the Three.js badge scene)

All changes live in `src/components/BadgeMedalScene.tsx` (the only module that
imports `three`) plus deletion of the now-unused enamel data module. No other
layer is touched. WebGL does not run under jsdom, so this spec is verified by
type-check + build (three stays code-split) + the existing suite staying green
+ the user's manual visual check.

## Decisions (locked)

- **Coin finish:** silver & gold = plain struck metal (no color, no recessed
  well). Diamond = full-face holographic rainbow shimmer.
- Keep the Phase-1 brightness keepers already in the tree (they are not part of
  the enamel effect and the user did not object to them).
- `badgeEnamel.ts` and its test are deleted (no remaining consumer).

## Changes

### A. Delete the enamel data module

- Delete `src/content/badgeEnamel.ts` and its test file
  (`src/content/badgeEnamel.test.ts`).
- Remove the import at `BadgeMedalScene.tsx:7`
  (`import { enamelColorFor } from '../content/badgeEnamel'`).

### B. Remove the enamel map system from `BadgeMedalScene.tsx`

Delete, in full:

- The enamel constants and builder block (currently ~lines 460–530):
  `ENAMEL_R_FRAC` (468), `ENAMEL_ROUGHNESS` (471), the `TierSurface` interface,
  `tierSurface()` (482–485), the `EnamelMaps` interface, and `makeEnamelMaps()`
  (494–…).
- The `enamelTextures` array declaration (649) and its disposal loop
  (`for (const tex of enamelTextures) tex.dispose()` at 921).

### C. Revert the recessed enamel well in `makeEmblemHeightfield`

In `makeEmblemHeightfield` (309–401), remove the "Recessed enamel well" block
(currently ~353–375): the `mid`/`rDisc`/`lipW`/`bevelW`/`rFloor` locals, the
raised-bezel-lip fill (`#aeaeae`), and the radial-gradient well
(`#565656`→`#aeaeae`). The emblem heightfield reverts to: mid-gray field, the
thin raised minted-coin ring (348–352), laurels, crest stars, and the centered
emblem. `ENAMEL_R_FRAC` must no longer be referenced here once B removes it.

### D. Revert earned-face materials to map-free finishes

Replace the earned branch (currently 677–715, the `makeEnamelMaps` call through
`faceMaterials.set`) with map-free materials:

- **Diamond:** `new THREE.MeshPhysicalMaterial({ ...DIAMOND_GEM, bumpMap: tex,
  bumpScale: 6 })`. No `color: 0xffffff`, no `metalness:1`/`roughness:1`
  override, no `map`/`metalnessMap`/`roughnessMap`. The full face is the holo
  gem.
- **Metal tiers:** `color: TIER_COLOR[tile.tier]`, `metalness: 1`,
  `roughness: TIER_ROUGHNESS[tile.tier]`, `clearcoat: 1`,
  `clearcoatRoughness: 0.1`, `envMapIntensity: 1.2`, `bumpMap: tex`,
  `bumpScale: 6`, `emissive: TIER_EMISSIVE[tile.tier]`, `emissiveIntensity:0.1`,
  then `enhanceMetalMaterial(fm, TIER_RIM[tile.tier], 0.4, 3.5)`. No map
  channels.
- Remove the `makeEnamelMaps(...)` call and the `enamelTextures.push(...)`.

The **locked** branch (661–675) stays untouched — locked badges remain dark
blued steel with no color and no shimmer.

### E. Keep the brightness keepers (do NOT revert)

These already in the tree and are kept verbatim:
- `renderer.toneMappingExposure = 1.0` (563)
- key light `new THREE.DirectionalLight(0xfff2d6, 1.6)` (580)
- `makeTierMaterial` metal `envMapIntensity: 1.2` (445) and
  `clearcoatRoughness` 0.1
- `TIER_ROUGHNESS.diamond` current value (0.12)

### F. Strengthen the diamond holo toward the CS2 look (tunable)

`DIAMOND_GEM` (118–132) already carries `iridescence: 1`,
`iridescenceIOR: 1.6`, `iridescenceThicknessRange: [100, 800]`. To push the
rainbow sweep closer to the reference, widen the thickness range (e.g.
`[100, 1000]`) and/or nudge `envMapIntensity`. Exact final values are the
user's call during the visual check; the plan should land sensible defaults and
flag them as tunable.

## Verification

- `npx tsc -b` clean (no unused locals after removals; `enamelColorFor`,
  `ENAMEL_R_FRAC`, `tierSurface`, `EnamelMaps`, `TierSurface`, `enamelTextures`
  all gone).
- `npm test` — unchanged green count (badge tests exercise the non-WebGL path;
  the deleted `badgeEnamel.test.ts` count drops out).
- `npm run build` — succeeds; `three` stays in the `threeEnv` chunk.
- `npm run lint` — no new errors.
- **User visual check (`npm run dev`):** silver/gold read as clean struck metal
  with no color disc and no sunken well; diamond shows a full-face rainbow
  shimmer that sweeps on rotation; locked badges stay dark blued steel.

## Out of scope

Practice/Review, mastery, content selection (Spec 2). No changes to the coin
body, geometry, drag-to-spin, or the locked finish beyond what D leaves intact.
