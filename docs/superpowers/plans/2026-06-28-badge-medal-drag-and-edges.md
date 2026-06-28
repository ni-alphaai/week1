# Badge Medallion: Draggable Coin Face + Crisper Edges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the zoomed detail medallion grab-and-spin when the coin face itself is grabbed, and render that single coin sharply (no aliased/shimmery edges).

**Architecture:** Two small, independent fixes, both gated on the existing `draggable` flag so the grid view is unchanged. (1) Lift the shared `<canvas>` above the `position:relative` medal slot with a z-index so it becomes the top pointer-hit target across the whole coin. (2) Supersample the single detail coin via a pure `medalPixelRatio()` helper in `src/lib/webgl.ts`.

**Tech Stack:** React + TypeScript, three.js (code-split, dynamic import only), Vitest + Testing Library (jsdom), Vite.

## Global Constraints

- Type-checking is strict: `noUnusedLocals` / `noUnusedParameters` are on — unused vars/params break `tsc -b` and `build`.
- three.js must NEVER be statically imported outside `src/components/BadgeMedalScene.tsx`; it is reached only via the dynamic `import('./BadgeMedalScene')`. New pure helpers shared with tests go in `src/lib/webgl.ts` (no three dependency), not in the scene module.
- The grid view (`draggable === false`) must be visually and behaviorally unchanged. Both fixes activate only when `draggable === true`.
- Release checklist before done: `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`.
- WebGL does not run under jsdom (`supportsWebGL()` returns false), so the live scene is never created in tests — assert DOM/style and pure helpers only.

---

### Task 1: Lift the canvas above the medal slot so the coin face is draggable

**Files:**
- Modify: `src/components/BadgeMedalGrid.tsx` (canvas inline `style` object, ~lines 120-130)
- Test: `src/components/BadgeMedalGrid.test.tsx` (add cases near the existing canvas test, ~line 89)

**Interfaces:**
- Consumes: nothing new — uses the existing `draggable` prop already destructured in `BadgeMedalGrid`.
- Produces: no exported API change. The `<canvas class="badge-medal-grid__canvas">` element gains inline `z-index: 1` when `draggable` is true and no `z-index` when false.

Root cause recap: `.badge-tile__medal` is `position: relative` (auto z-index) and comes after the `position:absolute` canvas in the DOM, so it paints on top of the canvas over the coin face and absorbs pointer events there. A positive `z-index` on the canvas moves it into a later paint layer, making it the topmost hit target across the entire medal area. No visual change (the slot is transparent and its children hidden when 3D is active).

- [ ] **Step 1: Write the failing tests**

Add these two `it` blocks to `src/components/BadgeMedalGrid.test.tsx` inside the `describe('BadgeMedalGrid (DOM-first)', ...)` block, right after the existing "renders an aria-hidden canvas pinned to the grid" test (after line 89):

```tsx
  it('draggable: canvas is lifted above the medal slot and captures the pointer', () => {
    const { container } = render(
      <BadgeMedalGrid items={[items[0]]} onSelect={() => {}} interactive={false} showLabels={false} draggable />,
    )
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas).toBeInTheDocument()
    expect(canvas.style.zIndex).toBe('1')
    expect(canvas.style.pointerEvents).toBe('auto')
  })

  it('non-draggable (grid): canvas does not set z-index and lets clicks fall through', () => {
    const { container } = render(<BadgeMedalGrid items={items} onSelect={() => {}} />)
    const canvas = container.querySelector('canvas') as HTMLCanvasElement
    expect(canvas.style.zIndex).toBe('')
    expect(canvas.style.pointerEvents).toBe('none')
  })
```

- [ ] **Step 2: Run the tests to verify the draggable one fails**

Run: `npx vitest run src/components/BadgeMedalGrid.test.tsx -t "lifted above the medal slot"`
Expected: FAIL — `expected '' to be '1'` (the canvas has no `zIndex` yet).

- [ ] **Step 3: Add the z-index to the canvas style**

In `src/components/BadgeMedalGrid.tsx`, find the canvas `style` object (currently):

```tsx
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          // Draggable (detail) medal captures the pointer to spin; the grid lets
          // clicks fall through to the tile buttons underneath.
          pointerEvents: draggable ? 'auto' : 'none',
          cursor: draggable ? 'grab' : undefined,
          touchAction: draggable ? 'none' : undefined,
        }}
```

Add the `zIndex` line (and extend the comment) so it reads:

```tsx
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          // Draggable (detail) medal captures the pointer to spin; the grid lets
          // clicks fall through to the tile buttons underneath. The detail canvas
          // also needs a z-index: the medal slot is position:relative, so without
          // one it paints over the coin face and swallows the grab.
          pointerEvents: draggable ? 'auto' : 'none',
          zIndex: draggable ? 1 : undefined,
          cursor: draggable ? 'grab' : undefined,
          touchAction: draggable ? 'none' : undefined,
        }}
```

- [ ] **Step 4: Run both tests to verify they pass**

Run: `npx vitest run src/components/BadgeMedalGrid.test.tsx`
Expected: PASS (all cases in the file, including the two new ones).

- [ ] **Step 5: Commit**

```bash
git add src/components/BadgeMedalGrid.tsx src/components/BadgeMedalGrid.test.tsx
git commit -m "fix(badges): make the detail coin face draggable (lift canvas above slot)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E2qNVeZBgYZZNN1E6ic8JT"
```

---

### Task 2: Supersample the single detail coin for crisp edges

**Files:**
- Modify: `src/lib/webgl.ts` (add the `medalPixelRatio` helper at the end)
- Create: `src/lib/webgl.test.ts`
- Modify: `src/components/BadgeMedalScene.tsx` (import the helper; replace the `setPixelRatio` call, ~line 436)

**Interfaces:**
- Consumes (in the scene): `medalPixelRatio(deviceRatio: number, draggable: boolean): number` from `../lib/webgl`, and the existing `draggable` value already destructured from `params` in `createBadgeMedalScene`.
- Produces: `export function medalPixelRatio(deviceRatio: number, draggable: boolean): number` in `src/lib/webgl.ts`.

The helper lives in `src/lib/webgl.ts` (not the scene) so the unit test does not pull the static `three` import. Detail view (`draggable`) supersamples up to ratio 3; grid stays at the existing `≤2` cap. MSAA smooths silhouettes; the extra pixels smooth the specular crawl on the reeding/emblem while preserving the sharp premium look.

- [ ] **Step 1: Write the failing test**

Create `src/lib/webgl.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { medalPixelRatio } from './webgl'

describe('medalPixelRatio', () => {
  it('caps the grid (non-draggable) at 2', () => {
    expect(medalPixelRatio(1, false)).toBe(1)
    expect(medalPixelRatio(2, false)).toBe(2)
    expect(medalPixelRatio(3, false)).toBe(2)
  })

  it('supersamples the detail (draggable) view up to 3', () => {
    expect(medalPixelRatio(1, true)).toBe(2) // base 1 * 2
    expect(medalPixelRatio(2, true)).toBe(3) // base 2 * 2 -> capped at 3
    expect(medalPixelRatio(3, true)).toBe(3) // base capped at 2, *2 -> capped at 3
  })

  it('guards a zero / missing device ratio', () => {
    expect(medalPixelRatio(0, false)).toBe(1)
    expect(medalPixelRatio(0, true)).toBe(2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/webgl.test.ts`
Expected: FAIL — `medalPixelRatio is not a function` / import error (not yet exported).

- [ ] **Step 3: Implement the helper**

Append to `src/lib/webgl.ts`:

```ts
/**
 * Device-pixel-ratio for the badge medal canvas.
 *
 * The grid renders many coins into one shared canvas, so it stays capped at 2 (a
 * deliberate perf guard). The single-coin detail view (`draggable`) can afford to
 * supersample: rendering above the display resolution integrates several lighting
 * samples per pixel, which smooths both the silhouette and the specular crawl on
 * the reeded edge / struck emblem without flattening the premium finish. Capped at
 * 3 to keep the drawing buffer bounded.
 */
export function medalPixelRatio(deviceRatio: number, draggable: boolean): number {
  const base = Math.min(deviceRatio || 1, 2)
  return draggable ? Math.min(base * 2, 3) : base
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/webgl.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 5: Use the helper in the scene**

In `src/components/BadgeMedalScene.tsx`, add the import to the existing import block near the top (after the `./threeEnv` import on line 5):

```ts
import { medalPixelRatio } from '../lib/webgl'
```

Then replace the current pixel-ratio line (currently `renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))`, ~line 436) with:

```ts
  // Grid stays at the ≤2 perf cap; the single detail coin supersamples for crisp
  // edges + no specular crawl (see medalPixelRatio).
  renderer.setPixelRatio(medalPixelRatio(window.devicePixelRatio, draggable))
```

(`draggable` is already destructured from `params` at the top of `createBadgeMedalScene`.)

- [ ] **Step 6: Type-check (the scene is not exercised by jsdom tests)**

Run: `npx tsc -b`
Expected: PASS — no errors. (Confirms the import path and that `draggable` is in scope.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/webgl.ts src/lib/webgl.test.ts src/components/BadgeMedalScene.tsx
git commit -m "fix(badges): supersample the detail medal for crisp edges

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01E2qNVeZBgYZZNN1E6ic8JT"
```

---

### Task 3: Release checklist + manual visual verification

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full release checklist**

Run: `npm run lint && npx tsc -b && npm test && npm run build`
Expected: lint clean, type-check clean, all tests pass, build succeeds.

- [ ] **Step 2: Manual browser verification (WebGL can't run under jsdom)**

Run: `npm run dev`, open the app, open a badge detail popup, and confirm:
- Grabbing **directly on the coin face** now grabs and spins the medallion (not just the area below it).
- The detail coin's silhouette, reeded edge, and struck emblem read **clean**, not shimmery/aliased.
- The home "Your treasures" grid is unchanged (coins still render, tiles still clickable, hover-tilt still works).

If edges still shimmer, the cap of 3 in `medalPixelRatio` is the single tuning knob — raise it (the detail buffer is tiny, one coin) and re-verify. No other change needed.

- [ ] **Step 3: No commit** — verification only. If Step 2 required raising the cap, that edit is committed as a follow-up to Task 2's commit.

---

## Notes for the implementer

- Do **not** touch materials (`bumpScale`, `envMapIntensity`, roughness) — supersampling handles the crawl and material edits risk flattening the intended premium look. That path is explicitly out of scope per the spec.
- Do **not** add a postprocessing AA pass (FXAA/SMAA/EffectComposer) — it conflicts with the multi-viewport scissor rendering and blurs detail.
- The two fixes are independent; Task 1 and Task 2 can be implemented and reviewed in either order.
