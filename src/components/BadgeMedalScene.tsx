import * as THREE from 'three'
import { renderToStaticMarkup } from 'react-dom/server'
import type { BadgeTier } from '../content/badges'
import { emblemFor } from './badgeEmblems'

// This is the ONLY module in the medal-grid feature that imports three.js. It
// is reached exclusively through the dynamic import() in BadgeMedalGrid, so
// Vite code-splits three (and react-dom/server) into a chunk that loads only
// when the live-3D path actually activates.
//
// ── ONE WebGL context for the whole grid ──────────────────────────────────────
// We create EXACTLY ONE THREE.WebGLRenderer (one WebGL context) on the single
// shared canvas. Each frame we render ONE reused medal mesh once per earned
// tile, using setViewport + setScissor + setScissorTest to confine each draw to
// that tile's screen rectangle. This is the canonical three.js "multiple
// elements, one renderer" technique. We never make a renderer/context per tile.

export interface BadgeMedalSceneTile {
  badgeId: string
  tier: BadgeTier
  element: HTMLElement
}

export interface BadgeMedalSceneParams {
  canvas: HTMLCanvasElement
  container: HTMLElement
  tiles: BadgeMedalSceneTile[]
}

export interface BadgeMedalSceneController {
  dispose(): void
}

const TIER_COLOR: Record<BadgeTier, number> = {
  bronze: 0xcd7f32,
  silver: 0xc7ccd1,
  gold: 0xf5b73c,
}

const TIER_EMISSIVE: Record<BadgeTier, number> = {
  bronze: 0x3a2208,
  silver: 0x2a2d31,
  gold: 0x6b4a00,
}

// Render the badge's 2D SVG emblem to a CanvasTexture for the medal face. This
// is the target look; if anything in the pipeline fails (SVG → Image load), we
// resolve null and the caller falls back to a plain tier-tinted disc. The
// unique emblem still shows in the DOM 2D fallback and the detail card, so this
// is an acceptable, documented degrade.
//
// `pendingUrls` is a Set owned by the scene closure. Each object URL is added
// before `img.src` is set and removed (+ revoked) inside the handlers. If
// dispose() fires while an Image is still loading, it revokes all remaining
// entries so no URL leaks even when the handler never fires. `isDisposed` is a
// ref-cell so the in-flight callback can read the disposed state at the time it
// eventually runs.
function makeEmblemTexture(
  badgeId: string,
  tier: BadgeTier,
  pendingUrls: Set<string>,
  isDisposed: { current: boolean },
): Promise<THREE.CanvasTexture | null> {
  return new Promise((resolve) => {
    try {
      const svg = renderToStaticMarkup(emblemFor(badgeId, undefined))
      // Ensure a viewBox-driven SVG carries explicit size + a tinted color so
      // currentColor strokes/fills render visibly on the metal face.
      const sized = svg
        .replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" style="color:#fff"')
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
          // Tinted disc background matching the tier, then the emblem centered.
          const color = new THREE.Color(TIER_COLOR[tier])
          ctx.fillStyle = `#${color.getHexString()}`
          ctx.beginPath()
          ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2)
          ctx.fill()
          const pad = size * 0.22
          ctx.drawImage(img, pad, pad, size - pad * 2, size - pad * 2)
          const tex = new THREE.CanvasTexture(c)
          tex.colorSpace = THREE.SRGBColorSpace
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

export function createBadgeMedalScene(params: BadgeMedalSceneParams): BadgeMedalSceneController {
  const { canvas, container, tiles } = params

  let renderer: THREE.WebGLRenderer
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
  } catch {
    // Fail closed — caller keeps the DOM 2D emblems.
    return { dispose() {} }
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.setScissorTest(true)

  const scene = new THREE.Scene()
  // Orthographic camera looking straight down -Z at a unit medal; this keeps
  // every per-tile viewport showing the medal centered and the same size.
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
  camera.position.set(0, 0, 3)
  camera.lookAt(0, 0, 0)

  scene.add(new THREE.AmbientLight(0xffffff, 0.9))
  const key = new THREE.DirectionalLight(0xfff2d6, 1.4)
  key.position.set(1.5, 2.2, 3)
  scene.add(key)
  const rim = new THREE.DirectionalLight(0x9bd2ff, 0.5)
  rim.position.set(-2, -1, 2)
  scene.add(rim)

  // ONE shared geometry, reused for every tile's render.
  const geometry = new THREE.CylinderGeometry(0.78, 0.78, 0.16, 48)
  // Stand the disc up to face the camera (cylinder axis is +Y by default).
  geometry.rotateX(Math.PI / 2)

  // At most three tier materials, created once and swapped per tile.
  const tierMaterials: Record<BadgeTier, THREE.MeshStandardMaterial> = {
    bronze: new THREE.MeshStandardMaterial(),
    silver: new THREE.MeshStandardMaterial(),
    gold: new THREE.MeshStandardMaterial(),
  }
  for (const tier of Object.keys(tierMaterials) as BadgeTier[]) {
    const m = tierMaterials[tier]
    m.color.setHex(TIER_COLOR[tier])
    m.metalness = 0.85
    m.roughness = 0.32
    m.emissive.setHex(TIER_EMISSIVE[tier])
    m.emissiveIntensity = 0.25
  }

  const medal = new THREE.Mesh(geometry, tierMaterials.bronze)
  scene.add(medal)

  // Per-badge face textures (async; null until/unless they resolve). When a
  // texture is present we use a face material that maps it; otherwise the plain
  // tier material (a tinted disc) is used — the documented fallback.
  const faceMaterials = new Map<string, THREE.MeshStandardMaterial>()
  const faceTextures: THREE.CanvasTexture[] = []
  let disposed = false
  // Ref-cell threaded into makeEmblemTexture so in-flight handlers can check
  // the disposed state at the time they eventually run.
  const isDisposed = { current: false }
  // Object URLs that have been created but whose Image hasn't loaded yet.
  // dispose() will revoke any still-pending ones to prevent URL leaks.
  const pendingUrls = new Set<string>()

  for (const tile of tiles) {
    void makeEmblemTexture(tile.badgeId, tile.tier, pendingUrls, isDisposed).then((tex) => {
      if (disposed || !tex) {
        tex?.dispose()
        return
      }
      faceTextures.push(tex)
      const fm = new THREE.MeshStandardMaterial({
        map: tex,
        metalness: 0.6,
        roughness: 0.35,
        emissive: new THREE.Color(TIER_EMISSIVE[tile.tier]),
        emissiveIntensity: 0.18,
      })
      faceMaterials.set(tile.badgeId, fm)
    })
  }

  const clock = new THREE.Clock()
  let raf = 0
  let running = true

  function frame() {
    if (!running) return
    raf = requestAnimationFrame(frame)

    const t = clock.getElapsedTime()
    const cRect = container.getBoundingClientRect()
    if (cRect.width === 0 || cRect.height === 0) return

    // Size the renderer to the container once per frame (handles resize/scroll
    // of the grid). setSize updates the drawing buffer + canvas style.
    renderer.setSize(cRect.width, cRect.height, false)

    medal.rotation.y = t * 0.6

    for (const tile of tiles) {
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

      medal.material = faceMaterials.get(tile.badgeId) ?? tierMaterials[tile.tier]
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
      // Revoke any object URLs whose Image.onload/onerror hasn't fired yet so
      // they don't leak if this scene is torn down mid-load.
      for (const url of pendingUrls) URL.revokeObjectURL(url)
      pendingUrls.clear()
      geometry.dispose()
      for (const tier of Object.keys(tierMaterials) as BadgeTier[]) tierMaterials[tier].dispose()
      for (const fm of faceMaterials.values()) fm.dispose()
      for (const tex of faceTextures) tex.dispose()
      renderer.forceContextLoss?.()
      renderer.dispose()
    },
  }
}
