# Badge medallion: draggable coin face + crisper edges

**Date:** 2026-06-28
**Branch:** feat/badge-redesign
**Scope:** Two targeted fixes to the 3D badge medallion, both confined to the
single-medal detail view. No change to the grid view's look or performance.

## Problem

1. **Coin face is not draggable.** In the zoomed badge detail card the medallion
   is meant to be grabbed and spun. Grabbing *directly on the coin face* does
   nothing; only the area *below* the coin (ribbon / empty space) responds.

2. **Rough edges / resolution.** The coin's silhouette and its fine detail (the
   60 reeded edge flutes, the struck emblem, the shiny low-roughness metal) look
   aliased — a crawling shimmer on edges rather than a clean premium finish.

## Root causes

### 1. Coin face not draggable — a paint-order / hit-test bug

- The drag handler is bound to the shared `<canvas>`, which is
  `position: absolute; inset: 0` and (in the draggable view) `pointer-events:
  auto`. By intent the canvas is the top hit target across the whole medal area.
- But `.badge-tile__medal` (the circular slot, `src/index.css`) is
  `position: relative`. A positioned element with `z-index: auto` paints in the
  same stacking layer as the absolutely-positioned canvas, **in DOM order** — and
  the slot comes *after* the canvas in the DOM.
- Result: the slot span paints *on top of* the canvas, directly over the coin
  face, and absorbs pointer events there. (Its children are `visibility:hidden`
  via `[data-medal-3d] > *`, but the span itself still hit-tests.) Below the coin
  there is no slot box, so the canvas is the topmost target — which is exactly
  the observed "only the lower part works."

### 2. Rough edges — specular aliasing, not just silhouette aliasing

- The renderer caps `pixelRatio` at 2 and relies on MSAA (`antialias: true`).
- MSAA smooths *geometry silhouettes* but does nothing for **specular aliasing** —
  the shimmer on high-frequency shiny detail (reeded flutes, `bumpScale: 6`
  emblem, roughness 0.05–0.18 with `envMapIntensity` 2–3). That sub-pixel detail
  crawls because each display pixel samples the lighting only once.
- The detail view renders a *single* large coin, so it can afford a much higher
  sample budget than the multi-medal grid (where the ≤2 cap is a deliberate perf
  guard and stays as-is).

## Design

Both fixes are small, localized, and gated on the existing `draggable` flag so the
grid view is byte-for-byte unchanged.

### Fix 1 — make the canvas the top hit target (detail view only)

In `BadgeMedalGrid.tsx`, add a z-index to the canvas inline style when
`draggable`:

```ts
style={{
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  pointerEvents: draggable ? 'auto' : 'none',
  zIndex: draggable ? 1 : undefined,   // <- lift above the position:relative slot
  cursor: draggable ? 'grab' : undefined,
  touchAction: draggable ? 'none' : undefined,
}}
```

A positive z-index moves the canvas into a later paint layer than the
auto-z-index slot, so it becomes the topmost element across the *entire* medal
area — coin face included. No visual change: when 3D is active the slot is
transparent and its children are hidden, so only the hit target moves.

The grid view is unaffected: there `draggable` is false, `zIndex` is `undefined`,
and the canvas is `pointer-events: none` (clicks fall through to the tile
buttons).

### Fix 2 — supersample the detail medal

Extract the pixel-ratio decision into a tiny pure helper so it is unit-testable
without WebGL, then call it from the scene.

```ts
// Pure, testable. Detail view (draggable) supersamples; grid stays capped at 2.
export function medalPixelRatio(deviceRatio: number, draggable: boolean): number {
  const base = Math.min(deviceRatio || 1, 2)
  return draggable ? Math.min(base * 2, 3) : base
}
```

In `createBadgeMedalScene`:

```ts
renderer.setPixelRatio(medalPixelRatio(window.devicePixelRatio, draggable))
```

- Detail view: effective ratio up to 3 (e.g. 1.5× supersample on a DPR-2 display,
  2× on DPR-1). For a single ~144px coin the drawing buffer stays tiny, so the
  cost is negligible — but every display pixel now integrates multiple lighting
  samples, which smooths both the silhouette *and* the specular crawl while
  preserving the sharp premium look (no material flattening).
- Grid view: unchanged (`base`, ≤2).
- The cap of 3 is a conservative bound; it is a single constant and trivially
  tunable upward during the visual verification step if more smoothing is wanted.

No EffectComposer / FXAA / SMAA — supersampling plus the existing MSAA is enough
and avoids the blur and the multi-viewport-scissor complications a post pass
would add.

## Files touched

- `src/components/BadgeMedalGrid.tsx` — add `zIndex` to the canvas style.
- `src/components/BadgeMedalScene.tsx` — add + use `medalPixelRatio`.

## Testing

- **Fix 1 (jsdom):** in `BadgeMedalGrid.test.tsx`, render with `draggable` and
  assert the canvas style has `zIndex: '1'` and `pointerEvents: 'auto'`; render
  without `draggable` and assert no `zIndex` and `pointerEvents: 'none'`. This is
  a real regression guard for the paint-order fix and needs no WebGL.
- **Fix 2 (pure unit test):** test `medalPixelRatio` directly —
  `medalPixelRatio(2, false) === 2`, `medalPixelRatio(1, true) === 2`,
  `medalPixelRatio(2, true) === 3`, `medalPixelRatio(3, true) === 3`,
  `medalPixelRatio(0, false) === 1` (the `|| 1` guard).
- **Visual verification (manual):** the WebGL scene does not run under jsdom, so
  confirm in the browser that (a) the coin face now spins when grabbed directly,
  and (b) the detail coin's edges and reeding read clean rather than shimmery.

## Out of scope

- Grid-view resolution / performance (kept behind the existing ≤2 cap).
- Material re-tuning (bumpScale, envMapIntensity, roughness) — not needed once the
  detail view supersamples; revisit only if the visual check still shows crawl.
- Making the grid coins draggable.
