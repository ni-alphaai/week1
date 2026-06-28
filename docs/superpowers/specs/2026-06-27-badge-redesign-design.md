# Badge redesign: fix hover + premium 3D medallions

## Context

The "Your treasures" achievement grid (rendered by `BadgeMedalGrid`, used on
`HomePage` and `ParentPage`) has two user-reported problems:

1. **Hover is broken.** Each tile uses the native HTML `title` attribute
   (`BadgeMedalGrid.tsx:145,156`). The browser positions that tooltip by *cursor*,
   not by element, so near a viewport edge it clips to the top-left corner — the
   "Solved a puzzle using an If block…" text floats detached at the page top-left.
   It also can't be styled to match the app.

2. **The medals look ugly / clip-arty.** They render as Three.js 3D medallions
   (`BadgeMedalScene.tsx`) but: the emblem is a flat tinted disc *pasted* onto the
   metal face (`makeEmblemTexture` → `emblemMesh`), the shape is one of 6 picked by a
   meaningless hash of the badge id (`shapeIndexFor`), and the metal reads dull.

The app teaches programming logic to ~10–11 year olds; the achievement wall should
feel like a premium, coherent **medal collection**, not random shiny stickers.

### Decisions (locked in with the user)

- **Keep Three.js, elevate the medallions** (not a 2D rewrite, not a hybrid).
- **Unify to one medallion silhouette** — a struck coin with a raised rim. Identity
  comes from the **engraved emblem + tier metal** (bronze/silver/gold), not shape.
- **Hover** shows a **custom title + blurb tooltip** anchored to the tile (auto-flips
  near edges); click still opens the existing full `BadgeDetailCard`.
- Premium touches, all approved: **hover tilt-to-cursor**, **slow idle shine sweep**,
  **ribbon tail**, **locked badges render as dim un-struck blank metal**.

## Design

### A. Custom hover tooltip

Replace the native `title` with a React-controlled tooltip rendered into a portal
(`createPortal` → `document.body`) so it is never clipped by the grid container.

- `BadgeMedalGrid` tracks `hovered: { badgeId, rect } | null`, set on tile
  `onPointerEnter`/`onFocus` (capturing `getBoundingClientRect()`), cleared on
  `onPointerLeave`/`onBlur`/`Escape`.
- `BadgeTooltip` renders `meta.title` (bold) + `meta.blurb` in a `position: fixed`
  bubble with a caret.
- **Placement is a pure function** `placeTooltip(anchorRect, tipSize, viewport)
  → { top, left, side }`: prefer *above* the tile, flip *below* when there isn't
  room, clamp horizontally into the viewport. This is the unit-tested seam
  (jsdom-friendly, no WebGL).
- Accessibility: drop the `title` attribute (prevents a double native tooltip); add
  `aria-describedby` linking the tile to the tooltip; show on keyboard focus, dismiss
  on `Escape`. Honor `prefers-reduced-motion` (no fade/scale).
- Reuse `badgeMeta(item.badgeId)` (already called at `BadgeMedalGrid.tsx:119`).

New CSS: `.badge-tooltip` (+ above/below caret variants) using existing surface/
border/shadow tokens.

### B. Unified struck-coin medallion

In `BadgeMedalScene.tsx`, delete the 6-shape system (`prismShape`, `extrudeShape`,
`starShapePath`, `shieldShapePath`, `gearShapePath`, `diamondShapePath`,
`shapeIndexFor`, the `shapes[]` array) and build **one** coin:

- **Coin body + rim via `LatheGeometry`.** A small 2D profile revolved 360° gives a
  real beveled/rounded raised rim + flat central field. Built once, reused per tile.
- **Engraved emblem (no pasted disc).** Rework `makeEmblemTexture` to render the badge
  SVG (`emblemFor`) onto a **grayscale heightfield** canvas (raised emblem + thin
  raised inner ring on a mid-gray field) used as a **`bumpMap`** on the coin face
  material. The emblem is struck into the *same tier metal* (tone-on-tone), catching
  the same reflections. Keep the async/fail-closed contract: on SVG→Image failure,
  resolve null and the face is plain metal (DOM 2D emblem still shows). Per-badge face
  material caching by `badgeId` stays.
- **Richer tier metals.** Retune `makeTierMaterial`: per-tier `roughness` (gold ~0.18,
  silver ~0.22, bronze ~0.3), keep `metalness:1` + clearcoat, bump `envMapIntensity`,
  add subtle `anisotropy`. Keep `RoomEnvironment`/PMREM env (`threeEnv.ts`) + ACES.
- **Ribbon tail.** A small tier-tinted ribbon parented under the coin in the shared
  `medal` group, tuned small for the 88px tile and proper for the larger detail medal.

### C. Motion & interaction

The frame loop already sets `medal.rotation` per tile before each scissored render
(`BadgeMedalScene.tsx:395-447`); extend it:

- **Idle shine sweep.** Retune the per-tile-phase sway so a specular band drifts slowly
  across earned coins.
- **Hover tilt-to-cursor.** A container `pointermove`/`pointerleave` listener records
  the cursor's client position; each frame the tile whose rect contains the cursor gets
  a tilt toward the cursor (normalized offset → small eased x/y rotation); others keep
  idle sway. No raycaster — the per-tile rects already exist in the loop. Disabled when
  `draggable` (detail medal keeps grab-to-spin).
- **Locked = un-struck metal.** Pass *all* tiles to the scene with an `earned` flag.
  Locked coins render with no emblem bump and a dim, matte, desaturated material — a
  blank struck blank. The 2D fallback (WebGL off) keeps showing `LockIcon`.

### D. Fallbacks unchanged

WebGL-off / reduced-motion path untouched: DOM tiles keep `emblemFor` (earned) /
`LockIcon` (locked) with the CSS tier gradients. The 3D path stays a single shared
context layered over the grid. `prefers-reduced-motion` disables idle motion, hover
tilt, and tooltip animation.

## Components & interfaces

- `placeTooltip(anchorRect, tipSize, viewport) → { top, left, side: 'above'|'below' }`
  — pure, tested.
- `BadgeTooltip({ title, blurb, anchorRect, id })` — portal bubble.
- `BadgeMedalSceneTile` gains `earned: boolean`; scene renders all tiles.

## Testing

- Unit: `placeTooltip` edge-flip + horizontal clamp (jsdom).
- Visual (`npm run dev`): tooltip anchors/flips near edges; coins read as a matching
  set with engraved emblems, distinct tier metals, shine sweep, ribbon, hover tilt;
  locked tiles are dim matte blanks; detail medal still grab-spins.
- Fallback: reduced-motion + WebGL-off keep DOM emblems/LockIcon, no errors.
- Release checklist: `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`.
