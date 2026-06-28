import * as THREE from 'three'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BadgeTier } from '../content/badges'
import { emblemFor } from './badgeEmblems'
import { setupRenderer, makeStudioEnvironment } from './threeEnv'

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
// ── One coherent medallion ────────────────────────────────────────────────────
// Every badge is the SAME struck-coin medallion (a LatheGeometry with a raised
// rim and a recessed field) in its tier metal. Identity comes from the engraved
// emblem and the bronze/silver/gold metal, not from the shape. The emblem is
// struck INTO the same metal via a bump map (tone-on-tone) rather than a pasted
// coloured disc. A small tier-tinted ribbon sits behind the coin. Earned coins
// catch a slow shine sweep and tilt toward the cursor on hover; locked badges
// render as a dim, matte, un-struck blank. A procedural studio environment (see
// ./threeEnv) gives the metal real reflections. In the single-medal detail view
// (`draggable`), the pointer can grab and spin the medallion with inertia.

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

const TIER_COLOR: Record<BadgeTier, number> = {
  bronze: 0xcd7f32,
  silver: 0xd6dade,
  gold: 0xf5c542,
}

const TIER_EMISSIVE: Record<BadgeTier, number> = {
  bronze: 0x3a2208,
  silver: 0x2a2d31,
  gold: 0x6b4a00,
}

// Per-tier roughness — gold polished mirror-bright, bronze a touch softer.
const TIER_ROUGHNESS: Record<BadgeTier, number> = {
  bronze: 0.3,
  silver: 0.22,
  gold: 0.18,
}

// Deeper, matte fabric colours for the ribbon, distinct from the bright metal.
const RIBBON_COLOR: Record<BadgeTier, number> = {
  bronze: 0x8a5a2b,
  silver: 0x8a9197,
  gold: 0xc89b1a,
}

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
  const geo = new THREE.LatheGeometry(profile, 96)
  // Stand the coin up so its faces point ±Z (front field toward the camera).
  geo.rotateX(Math.PI / 2)
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
          // The emblem, raised (white) and centered.
          const pad = size * 0.26
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

function makeTierMaterial(tier: BadgeTier): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: TIER_COLOR[tier],
    metalness: 1,
    roughness: TIER_ROUGHNESS[tier],
    clearcoat: 1,
    clearcoatRoughness: 0.15,
    envMapIntensity: 1.5,
    anisotropy: 0.25,
    emissive: new THREE.Color(TIER_EMISSIVE[tier]),
    emissiveIntensity: 0.1,
  })
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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
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

  // The environment supplies most of the fill; a low ambient plus a warm key
  // and cool rim keep a directional highlight sweeping across the metal.
  scene.add(new THREE.AmbientLight(0xffffff, 0.25))
  const key = new THREE.DirectionalLight(0xfff2d6, 1.4)
  key.position.set(1.5, 2.2, 3)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x9bd2ff, 0.4)
  rim.position.set(-2, -1, 2)
  scene.add(rim)

  // The single shared coin geometry, reused for every tile.
  const coinGeo = makeCoinGeometry()

  // Tier metals + a dim matte "un-struck" material for locked badges, created
  // once and swapped per tile.
  const tierMaterials: Record<BadgeTier, THREE.MeshPhysicalMaterial> = {
    bronze: makeTierMaterial('bronze'),
    silver: makeTierMaterial('silver'),
    gold: makeTierMaterial('gold'),
  }
  const lockedMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x3b3f45,
    metalness: 0.7,
    roughness: 0.85,
    clearcoat: 0.2,
    envMapIntensity: 0.5,
  })

  // Ribbon: two angled tails behind the coin, tinted per tier each frame.
  const ribbonGeo = makeRibbonTailGeometry()
  const ribbonMaterials: Record<BadgeTier, THREE.MeshStandardMaterial> = {
    bronze: new THREE.MeshStandardMaterial({ color: RIBBON_COLOR.bronze, roughness: 0.75, metalness: 0.1 }),
    silver: new THREE.MeshStandardMaterial({ color: RIBBON_COLOR.silver, roughness: 0.75, metalness: 0.1 }),
    gold: new THREE.MeshStandardMaterial({ color: RIBBON_COLOR.gold, roughness: 0.75, metalness: 0.1 }),
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
  const coinMesh = new THREE.Mesh(coinGeo, tierMaterials.bronze)
  const emblemGeometry = new THREE.CircleGeometry(FIELD_R, 64)
  const emblemMesh = new THREE.Mesh(emblemGeometry, tierMaterials.bronze)
  emblemMesh.position.z = FIELD_Z + 0.002
  medal.add(ribbonGroup)
  medal.add(coinMesh)
  medal.add(emblemMesh)
  scene.add(medal)

  // Per-badge emblem FACE materials (tier metal + that badge's bump map). Async;
  // absent until/unless the heightfield resolves. When present the field shows
  // the struck emblem; otherwise the plain recessed metal field.
  const faceMaterials = new Map<string, THREE.MeshPhysicalMaterial>()
  const faceTextures: THREE.CanvasTexture[] = []
  let disposed = false
  const isDisposed = { current: false }
  const pendingUrls = new Set<string>()

  for (const tile of tiles) {
    if (!tile.earned) continue // locked badges are blank — no emblem
    void makeEmblemHeightfield(tile.badgeId, pendingUrls, isDisposed).then((tex) => {
      if (disposed || !tex) {
        tex?.dispose()
        return
      }
      faceTextures.push(tex)
      const fm = new THREE.MeshPhysicalMaterial({
        color: TIER_COLOR[tile.tier],
        metalness: 1,
        roughness: TIER_ROUGHNESS[tile.tier],
        clearcoat: 1,
        clearcoatRoughness: 0.15,
        envMapIntensity: 1.5,
        bumpMap: tex,
        bumpScale: 6,
        emissive: new THREE.Color(TIER_EMISSIVE[tile.tier]),
        emissiveIntensity: 0.1,
      })
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

      // Tier metal (earned) or dim matte blank (locked); emblem only when earned.
      coinMesh.material = tile.earned ? tierMaterials[tile.tier] : lockedMaterial
      ribbonGroup.visible = tile.earned
      if (tile.earned) {
        ribbonLeft.material = ribbonMaterials[tile.tier]
        ribbonRight.material = ribbonMaterials[tile.tier]
      }
      const faceMat = tile.earned ? faceMaterials.get(tile.badgeId) : undefined
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
        medal.scale.setScalar(1)
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
      for (const tex of faceTextures) tex.dispose()
      renderer.forceContextLoss?.()
      renderer.dispose()
    },
  }
}
