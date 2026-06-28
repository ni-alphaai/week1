# Badge enamel inlays + holographic diamond — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each badge medal a per-badge colored enamel center disc, and turn the diamond tier from a too-bright bulb into a cool ice gem with a whole-face view-dependent holographic shimmer.

**Architecture:** A new pure palette module (`src/content/badgeEnamel.ts`) maps badge ids → enamel colors with a deterministic hash fallback. The renderer (`src/components/BadgeMedalScene.tsx`, the only three.js module) retunes the diamond material and adds three texture maps (color + packed roughness/metalness) to each earned badge's emblem face so the center disc reads as glossy dielectric enamel while the surrounding metal and tone-on-tone engravings are unchanged.

**Tech Stack:** TypeScript, three.js (`MeshPhysicalMaterial`, `CanvasTexture`), Vitest (jsdom), Vite.

## Global Constraints

- `three` is imported ONLY in `src/components/BadgeMedalScene.tsx`; it must stay code-split into the `threeEnv` chunk (no three import added anywhere else, including the new palette module).
- Color lives ONLY in the enamel center disc. Engravings (emblem, laurels, crest stars, rim) stay metallic, struck tone-on-tone via the existing bump map.
- Holographic shimmer is diamond-only and whole-face (not a ring; not on silver/gold).
- Locked badges are unchanged: dark blued steel, no enamel color, no holo.
- No new npm dependencies.
- WebGL does not run under jsdom — the scene never instantiates in tests. Only the pure palette module is unit-tested; scene changes are verified by `npx tsc -b`, the existing test suite staying green, `npm run build`, and the user's manual browser check.
- Release checklist before merge: `npm run lint`, `npx tsc -b`, `npm test`, `npm run build`.

---

### Task 1: Per-badge enamel palette module

**Files:**
- Create: `src/content/badgeEnamel.ts`
- Test: `src/content/badgeEnamel.test.ts`

**Interfaces:**
- Consumes: `BADGES` from `./badges` (to key the per-concept palette and let the test assert coverage).
- Produces:
  - `BADGE_ENAMEL: Record<string, string>` — explicit lowercase `#rrggbb` enamel color per achievement badge id.
  - `enamelColorFor(id: string): string` — returns the mapped color, or a deterministic hash→hue `#rrggbb` for unmapped ids (lesson-award badges, unknowns). Stable per id.

- [ ] **Step 1: Write the failing test**

Create `src/content/badgeEnamel.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { BADGES } from './badges'
import { BADGE_ENAMEL, enamelColorFor } from './badgeEnamel'

const HEX = /^#[0-9a-f]{6}$/

describe('badgeEnamel', () => {
  it('maps every achievement badge id to a valid enamel hex', () => {
    for (const b of BADGES) {
      expect(BADGE_ENAMEL[b.id], `missing enamel for ${b.id}`).toMatch(HEX)
    }
  })

  it('returns the explicit color for a mapped id', () => {
    expect(enamelColorFor('first-loop')).toBe(BADGE_ENAMEL['first-loop'])
  })

  it('gives distinct colors to distinct mapped concepts', () => {
    expect(enamelColorFor('first-loop')).not.toBe(enamelColorFor('first-if'))
  })

  it('returns a valid, stable color for unmapped ids', () => {
    const a = enamelColorFor('some-lesson-award-xyz')
    const b = enamelColorFor('some-lesson-award-xyz')
    expect(a).toMatch(HEX)
    expect(a).toBe(b)
  })

  it('returns valid hex for many arbitrary ids', () => {
    for (const id of ['lesson-1', 'lesson-2', 'maze-master', 'zzz', 'A']) {
      expect(enamelColorFor(id)).toMatch(HEX)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/content/badgeEnamel.test.ts`
Expected: FAIL — cannot resolve `./badgeEnamel` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `src/content/badgeEnamel.ts`:

```ts
// Per-badge enamel inlay colors for the medal center disc (see
// src/components/BadgeMedalScene.tsx). Pure data + a resolver — NO three import,
// so it stays out of the code-split three chunk. Colors are rich, saturated
// "enamel" tones spread around the hue wheel so the badge grid reads varied.
import { BADGES } from './badges'

// Explicit color per achievement badge, keyed to its concept. Hues are spread
// around the wheel so neighbouring badges stay distinct on the grid.
export const BADGE_ENAMEL: Record<string, string> = {
  'first-loop': '#1f9e6f', // loops — emerald
  'first-while': '#1f9ed0', // while — cyan
  'first-if': '#7c4dd6', // if/else — violet
  'practice-5': '#e8a32a', // practice — amber
  'practice-20': '#e2671e', // practice mastery — deep orange
  'comeback-kid': '#d2402f', // resilience — warm red
  'optimal-solver': '#2f6fd0', // precision — royal blue
  'speedy': '#e23d8b', // speed — magenta
}

// FNV-1a hash → hue in [0,360). Deterministic so an id always maps to the same
// color across reloads.
function hashHue(id: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h % 360
}

// HSL → lowercase #rrggbb. h in [0,360), s/l in [0,1].
function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let r = 0
  let g = 0
  let b = 0
  if (hp < 1) [r, g, b] = [c, x, 0]
  else if (hp < 2) [r, g, b] = [x, c, 0]
  else if (hp < 3) [r, g, b] = [0, c, x]
  else if (hp < 4) [r, g, b] = [0, x, c]
  else if (hp < 5) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  const m = l - c / 2
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/**
 * Enamel center-disc color for any badge id. Achievement badges use the curated
 * BADGE_ENAMEL map; lesson-award and unknown ids get a stable hash→hue color so
 * every badge has a distinct, reproducible enamel without hand-authoring each.
 */
export function enamelColorFor(id: string): string {
  const explicit = BADGE_ENAMEL[id]
  if (explicit) return explicit
  return hslToHex(hashHue(id), 0.62, 0.5)
}

// Touch BADGES so a future badge id added without an enamel entry is at least
// import-visible here; the test asserts full coverage of achievement badges.
void BADGES
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/content/badgeEnamel.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Type-check**

Run: `npx tsc -b`
Expected: clean (no errors). If `void BADGES` trips `noUnusedLocals`-style complaints, it will not — `void` expression statements are allowed; the import is used.

- [ ] **Step 6: Commit**

```bash
git add src/content/badgeEnamel.ts src/content/badgeEnamel.test.ts
git commit -m "feat(badges): per-badge enamel palette with hash fallback"
```

---

### Task 2: Tone down the diamond + whole-face holographic shimmer

**Files:**
- Modify: `src/components/BadgeMedalScene.tsx:114-128` (the `DIAMOND_GEM` constant)

**Interfaces:**
- Consumes: nothing new.
- Produces: an updated `DIAMOND_GEM` object (same shape/keys) consumed by `makeTierMaterial('diamond')` (coin body) and by the diamond face material in Task 3.

This task only retunes material parameters. It cannot be unit-tested (WebGL/jsdom); it is verified by type-check + build + the existing suite staying green, and by the user's manual visual check. The numbers below are the starting point; the user may fine-tune during manual verification.

- [ ] **Step 1: Replace the `DIAMOND_GEM` constant**

In `src/components/BadgeMedalScene.tsx`, replace the existing block at lines 114-128:

```ts
const DIAMOND_GEM = {
  color: TIER_COLOR.diamond,
  metalness: 0.1,
  roughness: TIER_ROUGHNESS.diamond,
  clearcoat: 1,
  clearcoatRoughness: 0.03,
  envMapIntensity: 3,
  ior: 2.4,
  reflectivity: 1,
  iridescence: 1,
  iridescenceIOR: 1.8,
  iridescenceThicknessRange: [120, 480] as [number, number],
  emissive: new THREE.Color(TIER_EMISSIVE.diamond),
  emissiveIntensity: 0.18,
} as const
```

with:

```ts
// Diamond is a dielectric gem, not a metal. Toned down from the earlier
// "glowing bulb": no emissive self-glow, default reflectivity, and a calmer
// environment intensity, so it reads as cool clear ice catching light. The
// colour punch now comes from the WHOLE-FACE holographic shimmer — a wide
// iridescence (thin-film) band whose hue sweeps the full spectrum as the coin
// rotates. Shared by the coin-body material and the engraved face material so
// the trophy tier looks identical whether or not its heightfield has loaded.
const DIAMOND_GEM = {
  color: TIER_COLOR.diamond,
  metalness: 0.1,
  roughness: TIER_ROUGHNESS.diamond,
  clearcoat: 1,
  clearcoatRoughness: 0.06,
  envMapIntensity: 1,
  ior: 2.2,
  reflectivity: 0.5,
  iridescence: 1,
  iridescenceIOR: 1.6,
  iridescenceThicknessRange: [100, 800] as [number, number],
  emissive: new THREE.Color(TIER_EMISSIVE.diamond),
  emissiveIntensity: 0,
} as const
```

(Changes: `envMapIntensity` 3 → 1, `reflectivity` 1 → 0.5, `clearcoatRoughness` 0.03 → 0.06, `ior` 2.4 → 2.2, `iridescenceIOR` 1.8 → 1.6, `iridescenceThicknessRange` widened to [100, 800] for a fuller spectrum sweep, `emissiveIntensity` 0.18 → 0. `emissive` color is kept but contributes nothing at intensity 0 — left in place so the object shape is unchanged for the spread in Task 3.)

- [ ] **Step 2: Type-check**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 3: Regression — existing suite stays green**

Run: `npm test`
Expected: all tests pass (same count as before this task; no scene tests exist).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds; `three` remains a separate `threeEnv` chunk in the build output.

- [ ] **Step 5: Commit**

```bash
git add src/components/BadgeMedalScene.tsx
git commit -m "fix(badges): tone down diamond glare + widen holo shimmer"
```

---

### Task 3: Enamel center disc on earned badge faces

**Files:**
- Modify: `src/components/BadgeMedalScene.tsx` — add enamel-map constants + builder (after `makeTierMaterial`, ~line 425); declare an enamel-texture array (near `faceTextures`, ~line 524); wire maps into the earned face materials (~lines 552-572); dispose them (~line 777).

**Interfaces:**
- Consumes: `enamelColorFor` from `../content/badgeEnamel` (Task 1); `DIAMOND_GEM` (Task 2); existing `TIER_COLOR`, `TIER_EMISSIVE`, `TIER_ROUGHNESS`, `TIER_RIM`, `enhanceMetalMaterial`.
- Produces: earned emblem-face materials that carry `map` (enamel/metal albedo), `metalnessMap` + `roughnessMap` (one packed ORM texture), and the existing `bumpMap`. Locked faces are untouched.

This task cannot be unit-tested (WebGL/jsdom). Verified by type-check + build + existing suite + the user's manual visual check.

- [ ] **Step 1: Add the import**

At the top of `src/components/BadgeMedalScene.tsx`, add to the existing imports (after the `medalPixelRatio` import on line 6):

```ts
import { enamelColorFor } from '../content/badgeEnamel'
```

- [ ] **Step 2: Add enamel-map constants and builder**

Insert after `makeTierMaterial` (after line 425, before `export function createBadgeMedalScene`):

```ts
// ── Enamel center disc (color + packed ORM maps) ───────────────────────────────
// CS2 operation-coin language: a glossy colored enamel disc sits behind the
// emblem, ringed by metal; the laurels/crest-stars stay out on the metal. We bake
// this into texture maps on the emblem FACE material (not the coin body):
//   • map (sRGB)      — enamel color inside the disc, tier metal albedo outside
//   • ORM (linear)    — packed: G = roughness, B = metalness (three reads .g/.b);
//                       assigned to BOTH roughnessMap and metalnessMap. Values are
//                       absolute, so the face material sets metalness=roughness=1.
// The existing grayscale bumpMap is unchanged and still strikes the emblem +
// framing in relief; here we only add color/finish.

// Enamel disc radius as a fraction of the emblem-face radius. The emblem (drawn
// to ~0.42 of the face in makeEmblemHeightfield) sits inside it; the laurels and
// crest stars (~0.69+) stay outside on the metal.
const ENAMEL_R_FRAC = 0.55
const ENAMEL_ROUGHNESS = 0.28

interface TierSurface {
  color: number
  metalness: number
  roughness: number
}

// Absolute PBR values for the metal (non-enamel) zone of each tier's face. For
// diamond these match DIAMOND_GEM's gem values so the holo gem is preserved
// outside the enamel disc.
function tierSurface(tier: BadgeTier): TierSurface {
  if (tier === 'diamond') return { color: TIER_COLOR.diamond, metalness: 0.1, roughness: TIER_ROUGHNESS.diamond }
  return { color: TIER_COLOR[tier], metalness: 1, roughness: TIER_ROUGHNESS[tier] }
}

interface EnamelMaps {
  color: THREE.CanvasTexture
  orm: THREE.CanvasTexture
}

// Build the color + ORM maps for one (tier, enamelColor). Synchronous (no image
// load) — purely radial. Caller owns disposal of both returned textures.
function makeEnamelMaps(tier: BadgeTier, enamelHex: string): EnamelMaps {
  const size = 256
  const c = size / 2
  const rDisc = c * ENAMEL_R_FRAC // = 70.4px for size 256
  const surf = tierSurface(tier)
  const metalHex = `#${new THREE.Color(surf.color).getHexString()}`
  const ringWidth = size * 0.02

  // colour map: tier metal albedo, with the enamel disc + a thin metal ring.
  const cc = document.createElement('canvas')
  cc.width = size
  cc.height = size
  const cx = cc.getContext('2d')
  // orm map: packed roughness (G) + metalness (B).
  const oc = document.createElement('canvas')
  oc.width = size
  oc.height = size
  const ox = oc.getContext('2d')
  if (!cx || !ox) {
    // No 2D context — return transparent textures; faces fall back to plain look.
    return { color: new THREE.CanvasTexture(cc), orm: new THREE.CanvasTexture(oc) }
  }

  const metalRgb = `rgb(0, ${Math.round(surf.roughness * 255)}, ${Math.round(surf.metalness * 255)})`
  const enamelRgb = `rgb(0, ${Math.round(ENAMEL_ROUGHNESS * 255)}, 0)` // metalness 0 inside disc

  // Metal everywhere.
  cx.fillStyle = metalHex
  cx.fillRect(0, 0, size, size)
  ox.fillStyle = metalRgb
  ox.fillRect(0, 0, size, size)
  // Enamel disc.
  cx.fillStyle = enamelHex
  cx.beginPath()
  cx.arc(c, c, rDisc, 0, Math.PI * 2)
  cx.fill()
  ox.fillStyle = enamelRgb
  ox.beginPath()
  ox.arc(c, c, rDisc, 0, Math.PI * 2)
  ox.fill()
  // Thin metal ring border around the enamel disc (both maps).
  cx.strokeStyle = metalHex
  cx.lineWidth = ringWidth
  cx.beginPath()
  cx.arc(c, c, rDisc, 0, Math.PI * 2)
  cx.stroke()
  ox.strokeStyle = metalRgb
  ox.lineWidth = ringWidth
  ox.beginPath()
  ox.arc(c, c, rDisc, 0, Math.PI * 2)
  ox.stroke()

  const color = new THREE.CanvasTexture(cc)
  color.colorSpace = THREE.SRGBColorSpace
  color.anisotropy = 4
  const orm = new THREE.CanvasTexture(oc)
  orm.colorSpace = THREE.NoColorSpace
  orm.anisotropy = 4
  return { color, orm }
}
```

- [ ] **Step 3: Declare an enamel-texture array for disposal**

In `createBadgeMedalScene`, find (line ~524):

```ts
  const faceTextures: THREE.CanvasTexture[] = []
```

Add immediately after it:

```ts
  // Enamel color + ORM maps for earned faces; disposed in dispose().
  const enamelTextures: THREE.CanvasTexture[] = []
```

- [ ] **Step 4: Wire the maps into the earned face materials**

Replace the earned-branch material construction (lines 552-572 — the block from the `// The engraved face shares...` comment through `faceMaterials.set(tile.badgeId, fm)`):

```ts
      // The engraved face shares each tier's finish (gem for diamond, metal
      // otherwise) and adds the badge's emblem+framing heightfield as a bump.
      let fm: THREE.MeshPhysicalMaterial
      if (tile.tier === 'diamond') {
        fm = new THREE.MeshPhysicalMaterial({ ...DIAMOND_GEM, bumpMap: tex, bumpScale: 6 })
      } else {
        fm = new THREE.MeshPhysicalMaterial({
          color: TIER_COLOR[tile.tier],
          metalness: 1,
          roughness: TIER_ROUGHNESS[tile.tier],
          clearcoat: 1,
          clearcoatRoughness: 0.15,
          envMapIntensity: 2,
          bumpMap: tex,
          bumpScale: 6,
          emissive: new THREE.Color(TIER_EMISSIVE[tile.tier]),
          emissiveIntensity: 0.1,
        })
        enhanceMetalMaterial(fm, TIER_RIM[tile.tier], 0.4, 3.5)
      }
      faceMaterials.set(tile.badgeId, fm)
```

with:

```ts
      // The engraved face shares each tier's finish (gem for diamond, metal
      // otherwise), strikes the emblem+framing via the bump heightfield, and
      // carries the enamel center disc via color + packed-ORM maps. Albedo and
      // finish are driven entirely by the maps, so the material's base color is
      // white and metalness/roughness are 1 (the maps hold the absolute values).
      const enamel = makeEnamelMaps(tile.tier, enamelColorFor(tile.badgeId))
      enamelTextures.push(enamel.color, enamel.orm)
      let fm: THREE.MeshPhysicalMaterial
      if (tile.tier === 'diamond') {
        fm = new THREE.MeshPhysicalMaterial({
          ...DIAMOND_GEM,
          color: 0xffffff,
          metalness: 1,
          roughness: 1,
          map: enamel.color,
          metalnessMap: enamel.orm,
          roughnessMap: enamel.orm,
          bumpMap: tex,
          bumpScale: 6,
        })
      } else {
        fm = new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          metalness: 1,
          roughness: 1,
          clearcoat: 1,
          clearcoatRoughness: 0.15,
          envMapIntensity: 2,
          map: enamel.color,
          metalnessMap: enamel.orm,
          roughnessMap: enamel.orm,
          bumpMap: tex,
          bumpScale: 6,
          emissive: new THREE.Color(TIER_EMISSIVE[tile.tier]),
          emissiveIntensity: 0.1,
        })
        enhanceMetalMaterial(fm, TIER_RIM[tile.tier], 0.4, 3.5)
      }
      faceMaterials.set(tile.badgeId, fm)
```

- [ ] **Step 5: Dispose the enamel textures**

In `dispose()`, find (line ~777):

```ts
      for (const tex of faceTextures) tex.dispose()
```

Add immediately after it:

```ts
      for (const tex of enamelTextures) tex.dispose()
```

- [ ] **Step 6: Type-check**

Run: `npx tsc -b`
Expected: clean. (Confirms `map`/`metalnessMap`/`roughnessMap` accept `THREE.CanvasTexture`, `enamelColorFor` is imported, and no unused locals.)

- [ ] **Step 7: Regression — existing suite stays green**

Run: `npm test`
Expected: all tests pass, unchanged count (the scene still never instantiates under jsdom; `BadgeMedalGrid.test.tsx` exercises the non-WebGL path).

- [ ] **Step 8: Build**

Run: `npm run build`
Expected: succeeds; `three` stays in the separate `threeEnv` chunk (the new import is from `../content/badgeEnamel`, which has no three dependency, so nothing pulls three out of its chunk).

- [ ] **Step 9: Commit**

```bash
git add src/components/BadgeMedalScene.tsx
git commit -m "feat(badges): colored enamel center disc on earned medal faces"
```

---

## Release checklist (run after all tasks)

- [ ] `npm run lint` — no new errors (warnings acceptable, matching repo baseline).
- [ ] `npx tsc -b` — clean.
- [ ] `npm test` — all green.
- [ ] `npm run build` — succeeds; `threeEnv` remains a separate chunk.
- [ ] Manual browser check (`npm run dev`) — USER's step:
  - Diamond coin is no longer blinding; reads as cool clear ice.
  - Rotating/tilting the diamond (detail view drag, or grid hover) shows the rainbow shimmer sweeping across the whole face.
  - Each earned badge shows a glossy colored enamel disc behind the emblem, ringed by metal; laurels/stars/rim stay metallic tone-on-tone.
  - Locked badges remain dark blued steel — no enamel color, no shimmer.

## Self-review notes

- **Spec coverage:** diamond tone-down + whole-face holo (Task 2); enamel center disc as dielectric via color+metalness+roughness maps, all tiers including diamond (Task 3); per-badge palette with hash fallback in `badgeEnamel.ts` (Task 1); center-disc-only / engravings stay metallic (radial maps, `ENAMEL_R_FRAC` 0.55 keeps laurels at ~0.69 on metal); locked unchanged (locked branch untouched in Task 3). All spec sections map to a task.
- **Type consistency:** `enamelColorFor(id: string): string` defined in Task 1, consumed in Task 3; `tierSurface`/`makeEnamelMaps`/`EnamelMaps` defined and used within Task 3; `DIAMOND_GEM` keeps its shape across Tasks 2-3 so the spread in Task 3 stays valid.
- **No placeholders:** every code step shows complete code; diamond numbers are concrete (tunable by the user during manual check).
