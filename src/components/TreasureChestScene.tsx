import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { setupRenderer, makeStudioEnvironment } from './threeEnv'

// The one module that pulls in three.js (and its addons: rounded geometry +
// post-processing). It is only ever imported via the dynamic import() in
// TreasureChestReward, so Vite code-splits all of it into a chunk that loads
// only when a reward is actually shown.
//
// A procedural studio environment (see ./threeEnv) gives the gold/gems real
// reflections; rounded geometry softens the chest; a ShadowMaterial ground
// plane grounds it with a soft contact shadow; and an UnrealBloom pass makes
// the loot and the inner glow sparkle.

export interface TreasureChestSceneProps {
  /** 'badge' adds a gold medal that pops above the open chest. */
  variant?: 'chest' | 'badge'
  /** Square canvas size in CSS pixels. */
  size?: number
}

// Overshoot easing so the lid flips open with a little bounce.
function easeOutBack(x: number): number {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3)
}

function clamp01(x: number): number {
  return Math.min(Math.max(x, 0), 1)
}

// A soft round sprite for the sparkle burst — a radial gradient drawn to a
// small canvas, so particles read as glints instead of hard squares.
function makeSparkleTexture(): THREE.CanvasTexture {
  const s = 64
  const c = document.createElement('canvas')
  c.width = s
  c.height = s
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.3, 'rgba(255,233,168,0.9)')
  g.addColorStop(1, 'rgba(255,233,168,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

export default function TreasureChestScene({ variant = 'chest', size = 200 }: TreasureChestSceneProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    } catch {
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    renderer.setSize(size, size)
    setupRenderer(renderer)
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.domElement.setAttribute('aria-hidden', 'true')
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const disposeEnv = makeStudioEnvironment(renderer, scene)
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
    camera.position.set(0, 1.55, 4.9)
    camera.lookAt(0, 0.2, 0)

    scene.add(new THREE.AmbientLight(0xffffff, 0.4))
    const key = new THREE.DirectionalLight(0xfff2d6, 1.7)
    key.position.set(2.6, 4, 3)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    key.shadow.camera.near = 1
    key.shadow.camera.far = 14
    key.shadow.camera.left = -3
    key.shadow.camera.right = 3
    key.shadow.camera.top = 3
    key.shadow.camera.bottom = -3
    key.shadow.bias = -0.0005
    scene.add(key)
    const rim = new THREE.DirectionalLight(0x9bd2ff, 0.5)
    rim.position.set(-3, 1.6, -2)
    scene.add(rim)
    // Warm light from inside the chest that brightens as the lid opens.
    const glow = new THREE.PointLight(0xffd54a, 0, 7)
    glow.position.set(0, 0.55, 0)
    scene.add(glow)

    const root = new THREE.Group()
    scene.add(root)

    const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.65, metalness: 0.15, envMapIntensity: 0.7 })
    const gold = new THREE.MeshPhysicalMaterial({
      color: 0xf5b73c,
      roughness: 0.22,
      metalness: 1,
      clearcoat: 1,
      clearcoatRoughness: 0.18,
      envMapIntensity: 1.5,
      emissive: 0x6b4a00,
      emissiveIntensity: 0.35,
    })
    const gem = new THREE.MeshPhysicalMaterial({
      color: 0x49c0e0,
      roughness: 0.05,
      metalness: 0,
      transmission: 0.6,
      thickness: 0.5,
      ior: 1.7,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      envMapIntensity: 1.4,
      emissive: 0x0d6a86,
      emissiveIntensity: 0.4,
    })

    const disposables: { dispose(): void }[] = [wood, gold, gem]
    function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
      disposables.push(geometry)
      const m = new THREE.Mesh(geometry, material)
      m.castShadow = true
      return m
    }

    // Soft contact shadow: an invisible plane that only shows the shadow the
    // chest casts, so it sits on the ground instead of floating.
    const groundGeo = new THREE.PlaneGeometry(8, 8)
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.28 })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.55
    ground.receiveShadow = true
    scene.add(ground)
    disposables.push(groundGeo, groundMat)

    // Chest body + gold band + front lock (rounded for a soft, toy-like look).
    const body = mesh(new RoundedBoxGeometry(1.7, 0.95, 1.15, 4, 0.1), wood)
    body.position.y = -0.05
    body.receiveShadow = true
    root.add(body)
    const band = mesh(new RoundedBoxGeometry(1.74, 0.16, 0.06, 2, 0.03), gold)
    band.position.set(0, 0.05, 0.59)
    root.add(band)
    const lock = mesh(new RoundedBoxGeometry(0.26, 0.32, 0.09, 2, 0.04), gold)
    lock.position.set(0, 0.02, 0.6)
    root.add(lock)

    // Lid hinged at the back-top edge so rotating the pivot flips it open.
    const lidPivot = new THREE.Group()
    lidPivot.position.set(0, 0.42, -0.575)
    root.add(lidPivot)
    const lid = mesh(new RoundedBoxGeometry(1.7, 0.5, 1.15, 4, 0.1), wood)
    lid.position.set(0, 0.1, 0.575)
    lidPivot.add(lid)
    const lidBand = mesh(new RoundedBoxGeometry(1.74, 0.14, 0.06, 2, 0.03), gold)
    lidBand.position.set(0, 0.12, 1.16)
    lidPivot.add(lidBand)

    // Loot that rises out of the chest once the lid is open: gold coins (thin
    // cylinders) and faceted gems (octahedra).
    const lootDefs = [
      { mat: gold, kind: 'coin' as const, x: -0.35, z: 0.12 },
      { mat: gem, kind: 'gem' as const, x: 0.32, z: -0.05 },
      { mat: gold, kind: 'coin' as const, x: 0.06, z: 0.32 },
      { mat: gem, kind: 'gem' as const, x: -0.12, z: -0.26 },
    ]
    const loot = lootDefs.map((d, i) => {
      const geo =
        d.kind === 'coin'
          ? new THREE.CylinderGeometry(0.15, 0.15, 0.045, 28)
          : new THREE.OctahedronGeometry(0.15, 0)
      const m = mesh(geo, d.mat)
      m.position.set(d.x, 0.1, d.z)
      m.visible = false
      root.add(m)
      // Deterministic per-item motion (no Math.random at module/render time keeps
      // it stable); spread speeds/phases across the four items.
      return { mesh: m, speed: 1.5 + i * 0.35, phase: i * 1.7 }
    })

    let medal: THREE.Mesh | null = null
    if (variant === 'badge') {
      medal = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 36), gold)
      medal.rotation.x = Math.PI / 2
      medal.position.set(0, 0.9, 0.12)
      medal.visible = false
      root.add(medal)
    }

    // Sparkle burst that pops when the lid opens.
    const SPARKLES = 26
    const sparkleTex = makeSparkleTexture()
    const sparkleDirs: THREE.Vector3[] = []
    const sparklePos = new Float32Array(SPARKLES * 3)
    for (let i = 0; i < SPARKLES; i++) {
      // Deterministic spread around the upward hemisphere.
      const ang = (i / SPARKLES) * Math.PI * 2
      const radial = 0.4 + (i % 5) * 0.12
      sparkleDirs.push(new THREE.Vector3(Math.cos(ang) * radial, 0.6 + (i % 3) * 0.25, Math.sin(ang) * radial))
    }
    const sparkleGeo = new THREE.BufferGeometry()
    sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sparklePos, 3))
    const sparkleMat = new THREE.PointsMaterial({
      size: 0.22,
      map: sparkleTex,
      color: 0xffe9a8,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    })
    const sparkles = new THREE.Points(sparkleGeo, sparkleMat)
    sparkles.visible = false
    root.add(sparkles)
    disposables.push(sparkleGeo, sparkleMat, sparkleTex)

    // Post-processing: bloom so the gold/gems and the inner glow shimmer.
    const composer = new EffectComposer(renderer)
    composer.setSize(size, size)
    const renderPass = new RenderPass(scene, camera)
    const bloom = new UnrealBloomPass(new THREE.Vector2(size, size), 0.45, 0.5, 0.8)
    const outputPass = new OutputPass()
    composer.addPass(renderPass)
    composer.addPass(bloom)
    composer.addPass(outputPass)

    const clock = new THREE.Clock()
    const OPEN_DELAY = 0.18
    const OPEN_DUR = 0.7
    const LID_OPEN = -2.1
    const BURST_START = OPEN_DELAY + 0.1
    const BURST_DUR = 1.1
    let raf = 0
    let running = true

    function render() {
      if (!running) return
      raf = requestAnimationFrame(render)
      // Use absolute time only (getElapsedTime updates the clock); deriving all
      // motion from sin/clamp keeps it framerate-independent without getDelta.
      const t = clock.getElapsedTime()

      const openT = clamp01((t - OPEN_DELAY) / OPEN_DUR)
      lidPivot.rotation.x = LID_OPEN * easeOutBack(openT)
      glow.intensity = 2 * openT

      // Subtle camera dolly-in as the chest opens.
      camera.position.z = 4.9 - 0.55 * easeOutCubic(openT)

      const rise = clamp01((t - (OPEN_DELAY + 0.2)) / 0.5)
      for (const item of loot) {
        item.mesh.visible = rise > 0
        item.mesh.position.y = 0.1 + rise * 0.45 + Math.sin(t * item.speed + item.phase) * 0.06 * rise
        item.mesh.rotation.y = t * item.speed
        item.mesh.rotation.x = t * item.speed * 0.6
      }

      if (medal) {
        const mRise = clamp01((t - (OPEN_DELAY + 0.35)) / 0.5)
        medal.visible = mRise > 0
        medal.position.y = 0.7 + mRise * 0.55
        medal.rotation.y = t * 1.3
      }

      // Sparkle burst: a single outward+upward pop that fades out.
      const burst = clamp01((t - BURST_START) / BURST_DUR)
      if (burst > 0 && burst < 1) {
        sparkles.visible = true
        const reach = easeOutCubic(burst)
        for (let i = 0; i < SPARKLES; i++) {
          const d = sparkleDirs[i]
          sparklePos[i * 3] = d.x * reach * 1.3
          sparklePos[i * 3 + 1] = 0.45 + d.y * reach * 1.2 + reach * 0.4
          sparklePos[i * 3 + 2] = d.z * reach * 1.3
        }
        sparkleGeo.attributes.position.needsUpdate = true
        sparkleMat.opacity = 1 - burst
      } else {
        sparkles.visible = false
      }

      // Pre-open anticipation shake, then gentle idle bob + sway.
      let shakeZ = 0
      if (t < OPEN_DELAY) {
        const k = 1 - t / OPEN_DELAY
        shakeZ = Math.sin(t * 70) * 0.04 * k
      }
      root.position.y = Math.sin(t * 1.4) * 0.04
      root.rotation.y = Math.sin(t * 0.5) * 0.16
      root.rotation.z = shakeZ

      composer.render()
    }
    render()

    return () => {
      running = false
      cancelAnimationFrame(raf)
      bloom.dispose()
      composer.dispose()
      disposeEnv()
      for (const d of disposables) d.dispose()
      renderer.forceContextLoss?.()
      renderer.dispose()
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement)
      }
    }
  }, [variant, size])

  return <div ref={hostRef} style={{ width: size, height: size }} />
}
