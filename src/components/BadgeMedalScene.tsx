import * as THREE from 'three'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BadgeTier } from '../content/badges'
import { emblemFor } from './badgeEmblems'
import { setupRenderer, makeStudioEnvironment } from './threeEnv'
import { medalPixelRatio } from '../lib/webgl'

// This is the ONLY module in the medal-grid feature that imports three.js. It
// is reached exclusively through the dynamic import() in BadgeMedalGrid, so
// Vite code-splits three (and react-dom/server) into a chunk that loads only
// when the live-3D path actually activates.
//
// ── ONE WebGL context for the whole grid ──────────────────────────────────────
// We create EXACTLY ONE THREE.WebGLRenderer (one WebGL context) on the single
// shared canvas. Each frame we render ONE reused medal mesh once per tile, using
// setViewport + setScissor + setScissorTest to confine each draw to that tile's
// screen rectangle. This is the canonical three.js "multiple elements, one
// renderer" technique. We never make a renderer/context per tile.
//
// ── One coherent medallion (CS:GO operation-coin language) ─────────────────────
// Every badge is the SAME struck-coin medallion (a LatheGeometry with a raised
// rim, a reeded/milled edge, and a recessed field) — modelled on CS:GO operation
// challenge coins. Identity comes from the engraved emblem and the tier finish,
// not from the shape. Struck INTO the same field via a tone-on-tone bump map are
// the badge emblem PLUS the coin's signature framing: two laurel branches arcing
// up the flanks and a crest of three stars. The tier is the finish: silver and
// gold are polished metals; diamond is the top trophy — a faceted ice-blue gem
// (low-metalness, iridescent, mirror-smooth) rather than a metal. A tier-tinted
// ribbon sits behind the coin. Earned coins catch a slow shine sweep and tilt
// toward the cursor on hover; locked badges render as a dim, matte, un-struck
// blank. A procedural studio environment (see ./threeEnv) gives the metal real
// reflections. In the single-medal detail view (`draggable`), the pointer can
// grab and spin the medallion with inertia.

export interface BadgeMedalSceneTile {
  badgeId: string
  tier: BadgeTier
  earned: boolean
  element: HTMLElement
}

export interface BadgeMedalSceneParams {
  canvas: HTMLCanvasElement
  container: HTMLElement
  tiles: BadgeMedalSceneTile[]
  /** Single-medal detail view: enable grab-and-spin. */
  draggable?: boolean
}

export interface BadgeMedalSceneController {
  dispose(): void
}

// Base albedo per tier. silver/gold are metals; diamond is the icy-blue gem base
// (its look comes mostly from the gem material params below, not this colour).
const TIER_COLOR: Record<BadgeTier, number> = {
  silver: 0xd6dade,
  gold: 0xf5c542,
  diamond: 0xbfe9ff,
}

const TIER_EMISSIVE: Record<BadgeTier, number> = {
  silver: 0x2a2d31,
  gold: 0x6b4a00,
  diamond: 0x10394f,
}

// Per-tier roughness — gold polished mirror-bright, silver a touch softer,
// diamond glass-smooth so highlights read as sharp gem glints.
const TIER_ROUGHNESS: Record<BadgeTier, number> = {
  silver: 0.22,
  gold: 0.18,
  diamond: 0.05,
}

// Deeper, matte fabric colours for the ribbon, distinct from the bright coin.
const RIBBON_COLOR: Record<BadgeTier, number> = {
  silver: 0x8a9197,
  gold: 0xc89b1a,
  diamond: 0x2f7fb0,
}

// Grazing-angle sheen tint per metal tier. Polished metal brightens toward its
// own specular colour at the rim, so silver picks up a cool white and gold a
// warm white-gold. Fed to the Fresnel injection in enhanceMetalMaterial.
const TIER_RIM: Record<BadgeTier, number> = {
  silver: 0xeef4ff,
  gold: 0xffe9ac,
  diamond: 0xffffff, // unused — diamond is the gem material, not enhanced metal
}

// Locked finish: a dark blued-steel coin that still takes the struck emblem in
// relief, so a locked badge reads as an un-awarded medallion (a preview of the
// prize) rather than a blank disc. A faint cool Fresnel rim keeps the dark coin
// from disappearing against the page.
const LOCKED_COLOR = 0x2b313b
const LOCKED_RIM = 0x6f8bb0

// Per-tier RIM-LIGHT colour (the directional fill raking the coin from below-
// left), tinted to match each tier's spotlight-stage glow so coin + backdrop
// read as one dramatic composition. Set on the shared rim light per tile in the
// frame loop. Cool blue / warm amber / icy cyan; locked stays a dim cool steel.
const TIER_RIM_LIGHT: Record<BadgeTier, number> = {
  silver: 0x9bd2ff,
  gold: 0xffce7a,
  diamond: 0x8fe6ff,
}
const LOCKED_RIM_LIGHT = 0x6f8bb0

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

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(Math.max(x, lo), hi)
}

// ── Coin geometry ──────────────────────────────────────────────────────────────
// A LatheGeometry profile (cross-section revolved 360°) gives a real struck coin:
// flat back, cylindrical edge, a flat RAISED RIM ring, then a slope down into a
// RECESSED FIELD where the emblem is struck. Far less "flat disc" than a plain
// cylinder. `fieldZ` (after the upright rotation) is where the emblem face sits.

const COIN_R = 0.86 // outer radius (rim)
const COIN_HALF_DEPTH = 0.08
const RIM_WIDTH = 0.08
const FIELD_RECESS = 0.05
const FIELD_R = 0.72 // emblem disc radius (sits inside the flat field)

// Reeding: the fine vertical ridges milled into a real coin's edge. 60 ridges,
// shallow, resolved by ~6 lathe segments each (hence the high segment count).
const REED_COUNT = 60
const REED_DEPTH = 0.011

function makeCoinGeometry(): THREE.BufferGeometry {
  const innerRimR = COIN_R - RIM_WIDTH
  const fieldTopY = COIN_HALF_DEPTH - FIELD_RECESS
  // Trace the cross-section from the back centre, counter-clockwise.
  const profile = [
    new THREE.Vector2(0, -COIN_HALF_DEPTH),
    new THREE.Vector2(COIN_R, -COIN_HALF_DEPTH),
    new THREE.Vector2(COIN_R, COIN_HALF_DEPTH),
    new THREE.Vector2(innerRimR, COIN_HALF_DEPTH),
    new THREE.Vector2(innerRimR - 0.03, fieldTopY),
    new THREE.Vector2(0, fieldTopY),
  ]
  const geo = new THREE.LatheGeometry(profile, 360)
  // Stand the coin up so its faces point ±Z (front field toward the camera).
  geo.rotateX(Math.PI / 2)

  // Mill the edge: the outer cylindrical wall is the only ring at radius COIN_R
  // (both the front-rim and back-face outer vertices). Pull those vertices in by
  // a cosine of their angle so the wall gains evenly-spaced vertical flutes; the
  // re-derived vertex normals turn the flutes into catch-the-light facets.
  const pos = geo.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    const rad = Math.hypot(v.x, v.y)
    if (rad > COIN_R - 1e-3) {
      const ang = Math.atan2(v.y, v.x)
      const ripple = (Math.cos(ang * REED_COUNT) * 0.5 + 0.5) * REED_DEPTH
      const newRad = rad - ripple
      pos.setXY(i, Math.cos(ang) * newRad, Math.sin(ang) * newRad)
    }
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

// Front-field z (in world units after the rotation) so the emblem face sits just
// proud of the recessed field.
const FIELD_Z = COIN_HALF_DEPTH - FIELD_RECESS

// ── Ribbon ───────────────────────────────────────────────────────────────────
// Two angled fabric tails with a notched end, sitting behind the coin so it
// overlaps them and only the tails peek out below — an award-ribbon accent.

function makeRibbonTailGeometry(): THREE.BufferGeometry {
  const w = 0.34
  const s = new THREE.Shape()
  s.moveTo(-w / 2, 0)
  s.lineTo(w / 2, 0)
  s.lineTo(w / 2, -0.8)
  s.lineTo(0, -0.62) // inverted-V notch
  s.lineTo(-w / 2, -0.8)
  s.closePath()
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: false })
  geo.center()
  // re-anchor so the tail's TOP is at y≈0 (center() moved it); translate up by
  // half its height so it hangs down from the knot.
  geo.computeBoundingBox()
  const h = geo.boundingBox ? geo.boundingBox.max.y - geo.boundingBox.min.y : 0.8
  geo.translate(0, -h / 2, 0)
  return geo
}

// ── Coin framing: laurels + crest stars ────────────────────────────────────────
// The signature CS:GO operation-coin motif: two laurel branches arcing up the
// flanks and a crest of three stars across the top. Drawn in greyscale into the
// emblem heightfield so they're struck into the metal at a lower relief than the
// emblem itself (mid-grey 128 = field; brighter = more raised).

function drawLeaf(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, len: number, wid: number): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  ctx.beginPath()
  ctx.ellipse(0, 0, len, wid, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

// Canvas angles are y-down: 90°=bottom, 180°=left, 270°=top, 0°=right. Each
// branch runs from near the bottom up one flank toward the crest; leaves lie
// tangent to the arc so they feather along the stem.
function drawLaurels(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const R = size * 0.345
  const leafLen = size * 0.05
  const leafWid = size * 0.021
  const N = 7
  ctx.fillStyle = '#bdbdbd'
  ctx.strokeStyle = '#a8a8a8'
  ctx.lineWidth = size * 0.012
  for (const dir of [1, -1] as const) {
    // dir +1 = left branch (110°→225°), dir −1 = right branch (70°→−45°).
    ctx.beginPath()
    for (let k = 0; k < N; k++) {
      const f = k / (N - 1)
      const a = (dir === 1 ? 110 + f * 115 : 70 - f * 115) * (Math.PI / 180)
      const x = c + Math.cos(a) * R
      const y = c + Math.sin(a) * R
      if (k === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    for (let k = 0; k < N; k++) {
      const f = k / (N - 1)
      const a = (dir === 1 ? 110 + f * 115 : 70 - f * 115) * (Math.PI / 180)
      const x = c + Math.cos(a) * R
      const y = c + Math.sin(a) * R
      drawLeaf(ctx, x, y, a + Math.PI / 2, leafLen, leafWid)
    }
  }
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, outer: number, inner: number): void {
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
}

function drawCrestStars(ctx: CanvasRenderingContext2D, size: number): void {
  const c = size / 2
  const R = size * 0.36
  ctx.fillStyle = '#dcdcdc'
  const crest: Array<[number, number]> = [
    [252, size * 0.026],
    [270, size * 0.038],
    [288, size * 0.026],
  ]
  for (const [deg, outer] of crest) {
    const a = deg * (Math.PI / 180)
    drawStar(ctx, c + Math.cos(a) * R, c + Math.sin(a) * R, outer, outer * 0.45)
  }
}

// ── Emblem heightfield (engraving) ─────────────────────────────────────────────
// Render the badge's 2D SVG emblem to a GRAYSCALE canvas (white emblem + a thin
// raised inner ring on a mid-gray field) and use it as a bumpMap on the coin's
// face material, so the emblem appears struck INTO the same metal. If anything
// in the pipeline fails (SVG → Image load), we resolve null and the caller
// leaves the field plain — the unique emblem still shows in the DOM 2D fallback
// and the detail card, so this is an acceptable, documented degrade.
//
// `pendingUrls` is a Set owned by the scene closure; each object URL is added
// before `img.src` and removed (+revoked) in the handlers, and dispose() revokes
// any still-pending ones so no URL leaks if teardown happens mid-load.
function makeEmblemHeightfield(
  badgeId: string,
  pendingUrls: Set<string>,
  isDisposed: { current: boolean },
): Promise<THREE.CanvasTexture | null> {
  return new Promise((resolve) => {
    try {
      const svg = renderToStaticMarkup(emblemFor(badgeId, undefined))
      // Force white strokes/fills so the emblem reads as the RAISED (bright) part
      // of the heightfield.
      const sized = svg.replace(
        '<svg',
        '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" style="color:#fff"',
      )
      const blob = new Blob([sized], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      pendingUrls.add(url)
      const img = new Image()
      img.onload = () => {
        pendingUrls.delete(url)
        URL.revokeObjectURL(url)
        if (isDisposed.current) {
          resolve(null)
          return
        }
        try {
          const size = 256
          const c = document.createElement('canvas')
          c.width = size
          c.height = size
          const ctx = c.getContext('2d')
          if (!ctx) {
            resolve(null)
            return
          }
          // Mid-gray field = no displacement; brighter = raised, darker = sunk.
          ctx.fillStyle = '#808080'
          ctx.fillRect(0, 0, size, size)
          // A thin raised ring just inside the field edge for a minted-coin feel.
          ctx.strokeStyle = '#b0b0b0'
          ctx.lineWidth = size * 0.025
          ctx.beginPath()
          ctx.arc(size / 2, size / 2, size * 0.42, 0, Math.PI * 2)
          ctx.stroke()
          // Coin framing struck at low relief: laurels up the flanks, stars at the crest.
          drawLaurels(ctx, size)
          drawCrestStars(ctx, size)
          // The emblem, raised (white) and centered within the laurel frame.
          const pad = size * 0.29
          ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2)
          const tex = new THREE.CanvasTexture(c)
          // Bump maps are data, not colour — keep them linear.
          tex.colorSpace = THREE.NoColorSpace
          tex.anisotropy = 4
          resolve(tex)
        } catch {
          resolve(null)
        }
      }
      img.onerror = () => {
        pendingUrls.delete(url)
        URL.revokeObjectURL(url)
        resolve(null)
      }
      img.src = url
    } catch {
      resolve(null)
    }
  })
}

// ── Metal realism: a Fresnel grazing-angle sheen (onBeforeCompile) ─────────────
// PBR metalness alone gives a flat-looking coin under a soft studio env: the rim
// goes as dark as the face. Real polished metal does the opposite — it brightens
// toward its specular colour at glancing angles where it grazes the brighter
// parts of the surroundings. We inject that Fresnel term into the stock
// MeshPhysicalMaterial shader (right after <emissivemap_fragment>, where `normal`
// and `vViewPosition` are both in scope) and add it to the emissive radiance, so
// the coin gains a lit, rounded edge instead of fading out. Kept subtle so it
// reads as caught light, not a neon glow. Uniforms are static (no per-frame
// update); instances with identical injected source share one shader program.
function enhanceMetalMaterial(
  mat: THREE.MeshPhysicalMaterial,
  rimColor: number,
  rimStrength: number,
  fresnelPower: number,
): void {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRimColor = { value: new THREE.Color(rimColor) }
    shader.uniforms.uRimStrength = { value: rimStrength }
    shader.uniforms.uFresnelPower = { value: fresnelPower }
    shader.fragmentShader =
      'uniform vec3 uRimColor;\nuniform float uRimStrength;\nuniform float uFresnelPower;\n' +
      shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          vec3 vDir = normalize( vViewPosition );
          float fres = pow( 1.0 - clamp( dot( vDir, normal ), 0.0, 1.0 ), uFresnelPower );
          totalEmissiveRadiance += uRimColor * ( fres * uRimStrength );
        }`,
      )
  }
}

function makeTierMaterial(tier: BadgeTier): THREE.MeshPhysicalMaterial {
  if (tier === 'diamond') return new THREE.MeshPhysicalMaterial({ ...DIAMOND_GEM })
  const mat = new THREE.MeshPhysicalMaterial({
    color: TIER_COLOR[tier],
    metalness: 1,
    roughness: TIER_ROUGHNESS[tier],
    clearcoat: 1,
    clearcoatRoughness: 0.15,
    envMapIntensity: 2,
    anisotropy: 0.25,
    emissive: new THREE.Color(TIER_EMISSIVE[tier]),
    emissiveIntensity: 0.1,
  })
  enhanceMetalMaterial(mat, TIER_RIM[tier], 0.4, 3.5)
  return mat
}

export function createBadgeMedalScene(params: BadgeMedalSceneParams): BadgeMedalSceneController {
  const { canvas, container, tiles, draggable = false } = params

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  } catch {
    // Fail closed — caller keeps the DOM 2D emblems.
    return { dispose() {} }
  }
  // Grid stays at the ≤2 perf cap; the single detail coin supersamples for crisp
  // edges + no specular crawl (see medalPixelRatio).
  renderer.setPixelRatio(medalPixelRatio(window.devicePixelRatio, draggable))
  setupRenderer(renderer)
  renderer.setScissorTest(true)

  const scene = new THREE.Scene()
  // Soft procedural studio environment so the metals actually reflect something.
  const disposeEnv = makeStudioEnvironment(renderer, scene)
  // Orthographic camera looking straight down -Z at a unit medal; the frustum is
  // re-fit to each tile's aspect in the frame loop so the medal stays circular.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
  camera.position.set(0, 0, 3)
  camera.lookAt(0, 0, 0)

  // Dramatic / premium rig: low ambient so the coin falls off into the dark
  // spotlight stage, a strong high-raked warm key for a glossy highlight sweep,
  // and a punchy rim re-tinted per tier each frame (see TIER_RIM_LIGHT) so the
  // coin's edge light matches the backdrop glow.
  scene.add(new THREE.AmbientLight(0xffffff, 0.14))
  const key = new THREE.DirectionalLight(0xfff2d6, 2.1)
  key.position.set(1.6, 2.8, 3)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x9bd2ff, 0.9)
  rim.position.set(-2, -1, 2)
  scene.add(rim)

  // The single shared coin geometry, reused for every tile.
  const coinGeo = makeCoinGeometry()

  // Tier metals + a dim matte "un-struck" material for locked badges, created
  // once and swapped per tile.
  const tierMaterials: Record<BadgeTier, THREE.MeshPhysicalMaterial> = {
    silver: makeTierMaterial('silver'),
    gold: makeTierMaterial('gold'),
    diamond: makeTierMaterial('diamond'),
  }
  // Locked coin: dark blued steel with a faint cool Fresnel rim. Still takes the
  // struck emblem (built below into lockedFaceMaterials) so a locked badge looks
  // like an un-awarded medallion — a preview of the prize — not a blank disc.
  const lockedMaterial = new THREE.MeshPhysicalMaterial({
    color: LOCKED_COLOR,
    metalness: 0.9,
    roughness: 0.5,
    clearcoat: 0.6,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.9,
  })
  enhanceMetalMaterial(lockedMaterial, LOCKED_RIM, 0.45, 3)

  // Ribbon: two angled tails behind the coin, tinted per tier each frame.
  const ribbonGeo = makeRibbonTailGeometry()
  const ribbonMaterials: Record<BadgeTier, THREE.MeshStandardMaterial> = {
    silver: new THREE.MeshStandardMaterial({ color: RIBBON_COLOR.silver, roughness: 0.75, metalness: 0.1 }),
    gold: new THREE.MeshStandardMaterial({ color: RIBBON_COLOR.gold, roughness: 0.75, metalness: 0.1 }),
    diamond: new THREE.MeshStandardMaterial({ color: RIBBON_COLOR.diamond, roughness: 0.55, metalness: 0.2 }),
  }
  const ribbonGroup = new THREE.Group()
  const ribbonLeft = new THREE.Mesh(ribbonGeo, ribbonMaterials.gold)
  const ribbonRight = new THREE.Mesh(ribbonGeo, ribbonMaterials.gold)
  ribbonLeft.rotation.z = 0.32
  ribbonRight.rotation.z = -0.32
  ribbonLeft.position.set(-0.12, -0.32, 0)
  ribbonRight.position.set(0.12, -0.32, 0)
  ribbonGroup.add(ribbonLeft, ribbonRight)
  ribbonGroup.position.z = -0.12 // behind the coin so the coin overlaps the knot

  // ONE shared medal group, reused for every tile's render: the coin (geometry
  // fixed; material swapped per tile), a front emblem face (bump map swapped per
  // tile), and the ribbon behind it.
  const medal = new THREE.Group()
  const coinMesh = new THREE.Mesh(coinGeo, tierMaterials.silver)
  const emblemGeometry = new THREE.CircleGeometry(FIELD_R, 64)
  const emblemMesh = new THREE.Mesh(emblemGeometry, tierMaterials.silver)
  emblemMesh.position.z = FIELD_Z + 0.002
  medal.add(ribbonGroup)
  medal.add(coinMesh)
  medal.add(emblemMesh)
  scene.add(medal)

  // Per-badge emblem FACE materials (tier metal + that badge's bump map). Async;
  // absent until/unless the heightfield resolves. When present the field shows
  // the struck emblem; otherwise the plain recessed metal field.
  const faceMaterials = new Map<string, THREE.MeshPhysicalMaterial>()
  // Locked badges get their own engraved face: the same struck emblem, but in the
  // dark blued-steel finish, so the prize is previewed rather than hidden.
  const lockedFaceMaterials = new Map<string, THREE.MeshPhysicalMaterial>()
  const faceTextures: THREE.CanvasTexture[] = []
  let disposed = false
  const isDisposed = { current: false }
  const pendingUrls = new Set<string>()

  for (const tile of tiles) {
    void makeEmblemHeightfield(tile.badgeId, pendingUrls, isDisposed).then((tex) => {
      if (disposed || !tex) {
        tex?.dispose()
        return
      }
      faceTextures.push(tex)
      if (!tile.earned) {
        // Struck emblem in the dark locked finish (matches lockedMaterial).
        const lm = new THREE.MeshPhysicalMaterial({
          color: LOCKED_COLOR,
          metalness: 0.9,
          roughness: 0.5,
          clearcoat: 0.6,
          clearcoatRoughness: 0.25,
          envMapIntensity: 0.9,
          bumpMap: tex,
          bumpScale: 6,
        })
        enhanceMetalMaterial(lm, LOCKED_RIM, 0.45, 3)
        lockedFaceMaterials.set(tile.badgeId, lm)
        return
      }
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
    })
  }

  // ── Drag-to-spin (detail view only) ─────────────────────────────────────────
  let dragging = false
  let lastX = 0
  let lastY = 0
  let dragRotY = 0
  let dragRotX = 0
  let velY = 0
  let velX = 0

  function onPointerDown(e: PointerEvent) {
    dragging = true
    lastX = e.clientX
    lastY = e.clientY
    velX = 0
    velY = 0
    canvas.setPointerCapture?.(e.pointerId)
    canvas.style.cursor = 'grabbing'
  }
  function onDragMove(e: PointerEvent) {
    if (!dragging) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    lastX = e.clientX
    lastY = e.clientY
    dragRotY += dx * 0.01
    dragRotX = clamp(dragRotX + dy * 0.01, -1.1, 1.1)
    velY = dx * 0.01
    velX = dy * 0.01
  }
  function onPointerUp(e: PointerEvent) {
    dragging = false
    canvas.releasePointerCapture?.(e.pointerId)
    canvas.style.cursor = 'grab'
  }

  // ── Hover tilt-to-cursor (grid view only) ────────────────────────────────────
  // The canvas is pointer-events:none over the grid, so events fall through to
  // the tile buttons and bubble to the container. We track the cursor in client
  // coords and, in the frame loop, tilt whichever tile's rect contains it toward
  // the cursor — no raycaster needed, the per-tile rects already exist there.
  let cursorX = 0
  let cursorY = 0
  let cursorInside = false
  // Per-tile eased hover amount (0→1) so the tilt blends in/out smoothly.
  const hoverEase = new Float32Array(tiles.length)

  function onHoverMove(e: PointerEvent) {
    cursorX = e.clientX
    cursorY = e.clientY
    cursorInside = true
  }
  function onHoverLeave() {
    cursorInside = false
  }

  if (draggable) {
    canvas.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onDragMove)
    window.addEventListener('pointerup', onPointerUp)
  } else {
    container.addEventListener('pointermove', onHoverMove)
    container.addEventListener('pointerleave', onHoverLeave)
  }

  const TILT_MAX = 0.45
  const clock = new THREE.Clock()
  let raf = 0
  let running = true

  function frame() {
    if (!running) return
    raf = requestAnimationFrame(frame)

    const t = clock.getElapsedTime()
    const cRect = container.getBoundingClientRect()
    if (cRect.width === 0 || cRect.height === 0) return

    // Size the renderer to the container once per frame (handles resize/scroll).
    renderer.setSize(cRect.width, cRect.height, false)

    // Inertia for the draggable medal: ease spin to rest after release.
    if (draggable && !dragging) {
      dragRotY += velY
      dragRotX = clamp(dragRotX + velX, -1.1, 1.1)
      velY *= 0.94
      velX *= 0.94
      if (Math.abs(velY) < 0.0004) velY = 0
      if (Math.abs(velX) < 0.0004) velX = 0
    }

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i]
      const r = tile.element.getBoundingClientRect()
      // Skip tiles scrolled out of the container's visible band.
      if (r.bottom < cRect.top || r.top > cRect.bottom) continue

      // Rect relative to the container; WebGL y origin is bottom-left.
      const x = r.left - cRect.left
      const yTop = r.top - cRect.top
      const w = r.width
      const h = r.height
      const y = cRect.height - (yTop + h)

      renderer.setViewport(x, y, w, h)
      renderer.setScissor(x, y, w, h)

      // Match the orthographic frustum to this tile's aspect so the medal stays
      // circular (never stretched into an oval) whatever the slot's shape.
      const a = h > 0 ? w / h : 1
      camera.left = -a
      camera.right = a
      camera.top = 1
      camera.bottom = -1
      camera.updateProjectionMatrix()

      // Tier metal (earned) or dark blued steel (locked). The ribbon is the
      // earned-only flourish; locked still shows the struck emblem in relief as
      // a preview of the prize.
      coinMesh.material = tile.earned ? tierMaterials[tile.tier] : lockedMaterial
      // Tint the rim light to this tile's tier so its edge light matches the
      // per-tier spotlight-stage glow (locked stays a dim cool steel).
      rim.color.set(tile.earned ? TIER_RIM_LIGHT[tile.tier] : LOCKED_RIM_LIGHT)
      ribbonGroup.visible = tile.earned
      if (tile.earned) {
        ribbonLeft.material = ribbonMaterials[tile.tier]
        ribbonRight.material = ribbonMaterials[tile.tier]
      }
      const faceMat = tile.earned
        ? faceMaterials.get(tile.badgeId)
        : lockedFaceMaterials.get(tile.badgeId)
      if (faceMat) {
        emblemMesh.material = faceMat
        emblemMesh.visible = true
      } else {
        emblemMesh.visible = false
      }

      if (draggable) {
        medal.rotation.y = dragRotY
        medal.rotation.x = dragRotX
        medal.position.y = Math.sin(t * 1.1) * 0.02
        // The zoomed detail view shows a single medal — fill more of the frame.
        medal.scale.setScalar(1.12)
      } else {
        // Idle shine sweep: a gentle per-tile-phase sway drifts the environment
        // highlight slowly across the metal so the grid feels alive.
        const phase = i * 0.7
        const idleY = Math.sin(t * 0.5 + phase) * 0.35
        const idleX = Math.sin(t * 0.8 + phase) * 0.1

        // Hover tilt: blend toward a cursor-driven tilt for the tile under the
        // pointer; ease the others back to idle.
        const over = cursorInside && cursorX >= r.left && cursorX <= r.right && cursorY >= r.top && cursorY <= r.bottom && tile.earned
        hoverEase[i] += ((over ? 1 : 0) - hoverEase[i]) * 0.18
        const e = hoverEase[i]
        let targetY = idleY
        let targetX = idleX
        if (over) {
          const nx = ((cursorX - r.left) / w) * 2 - 1
          const ny = ((cursorY - r.top) / h) * 2 - 1
          targetY = nx * TILT_MAX
          targetX = ny * TILT_MAX
        }
        medal.rotation.y = idleY * (1 - e) + targetY * e
        medal.rotation.x = idleX * (1 - e) + targetX * e
        medal.position.y = Math.sin(t * 1.1 + phase) * 0.02
        medal.scale.setScalar(1 + e * 0.05)
      }

      renderer.render(scene, camera)
    }
  }
  frame()

  return {
    dispose() {
      disposed = true
      isDisposed.current = true
      running = false
      cancelAnimationFrame(raf)
      if (draggable) {
        canvas.removeEventListener('pointerdown', onPointerDown)
        window.removeEventListener('pointermove', onDragMove)
        window.removeEventListener('pointerup', onPointerUp)
      } else {
        container.removeEventListener('pointermove', onHoverMove)
        container.removeEventListener('pointerleave', onHoverLeave)
      }
      // Revoke any object URLs whose Image.onload/onerror hasn't fired yet so
      // they don't leak if this scene is torn down mid-load.
      for (const url of pendingUrls) URL.revokeObjectURL(url)
      pendingUrls.clear()
      disposeEnv()
      coinGeo.dispose()
      emblemGeometry.dispose()
      ribbonGeo.dispose()
      lockedMaterial.dispose()
      for (const tier of Object.keys(tierMaterials) as BadgeTier[]) tierMaterials[tier].dispose()
      for (const tier of Object.keys(ribbonMaterials) as BadgeTier[]) ribbonMaterials[tier].dispose()
      for (const fm of faceMaterials.values()) fm.dispose()
      for (const fm of lockedFaceMaterials.values()) fm.dispose()
      for (const tex of faceTextures) tex.dispose()
      renderer.forceContextLoss?.()
      renderer.dispose()
    },
  }
}
