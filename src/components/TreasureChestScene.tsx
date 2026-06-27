import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// The one module that pulls in three.js. It is only ever imported via the
// dynamic import() in TreasureChestReward, so Vite code-splits three into its
// own chunk that loads only when a reward is actually shown.

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
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.setAttribute('aria-hidden', 'true')
    host.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
    camera.position.set(0, 1.55, 4.5)
    camera.lookAt(0, 0.2, 0)

    scene.add(new THREE.AmbientLight(0xffffff, 0.85))
    const key = new THREE.DirectionalLight(0xfff2d6, 1.6)
    key.position.set(2.6, 4, 3)
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

    const wood = new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.7, metalness: 0.1 })
    const gold = new THREE.MeshStandardMaterial({
      color: 0xf5b73c,
      roughness: 0.3,
      metalness: 0.85,
      emissive: 0x6b4a00,
      emissiveIntensity: 0.3,
    })
    const gem = new THREE.MeshStandardMaterial({
      color: 0x49c0e0,
      roughness: 0.15,
      metalness: 0.2,
      emissive: 0x0d6a86,
      emissiveIntensity: 0.45,
    })

    const disposables: { dispose(): void }[] = [wood, gold, gem]
    function mesh(geometry: THREE.BufferGeometry, material: THREE.Material): THREE.Mesh {
      disposables.push(geometry)
      return new THREE.Mesh(geometry, material)
    }

    // Chest body + gold band + front lock.
    const body = mesh(new THREE.BoxGeometry(1.7, 0.95, 1.15), wood)
    body.position.y = -0.05
    root.add(body)
    const band = mesh(new THREE.BoxGeometry(1.74, 0.16, 0.06), gold)
    band.position.set(0, 0.05, 0.59)
    root.add(band)
    const lock = mesh(new THREE.BoxGeometry(0.26, 0.32, 0.09), gold)
    lock.position.set(0, 0.02, 0.6)
    root.add(lock)

    // Lid hinged at the back-top edge so rotating the pivot flips it open.
    const lidPivot = new THREE.Group()
    lidPivot.position.set(0, 0.42, -0.575)
    root.add(lidPivot)
    const lid = mesh(new THREE.BoxGeometry(1.7, 0.5, 1.15), wood)
    lid.position.set(0, 0.1, 0.575)
    lidPivot.add(lid)
    const lidBand = mesh(new THREE.BoxGeometry(1.74, 0.14, 0.06), gold)
    lidBand.position.set(0, 0.12, 1.16)
    lidPivot.add(lidBand)

    // Loot that rises out of the chest once the lid is open.
    const lootDefs = [
      { mat: gold, r: 0.16, x: -0.35, z: 0.12 },
      { mat: gem, r: 0.14, x: 0.32, z: -0.05 },
      { mat: gold, r: 0.12, x: 0.06, z: 0.32 },
      { mat: gem, r: 0.1, x: -0.12, z: -0.26 },
    ]
    const loot = lootDefs.map((d) => {
      const m = mesh(new THREE.IcosahedronGeometry(d.r, 0), d.mat)
      m.position.set(d.x, 0.1, d.z)
      m.visible = false
      root.add(m)
      return { mesh: m, x: d.x, z: d.z, speed: 1.4 + Math.random() * 0.9, phase: Math.random() * Math.PI * 2 }
    })

    let medal: THREE.Mesh | null = null
    if (variant === 'badge') {
      medal = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 28), gold)
      medal.rotation.x = Math.PI / 2
      medal.position.set(0, 0.9, 0.12)
      medal.visible = false
      root.add(medal)
    }

    const clock = new THREE.Clock()
    const OPEN_DUR = 0.7
    const LID_OPEN = -2.1
    let raf = 0
    let running = true

    function render() {
      if (!running) return
      raf = requestAnimationFrame(render)
      // Use absolute time only (getElapsedTime updates the clock); deriving all
      // motion from sin/clamp keeps it framerate-independent without getDelta.
      const t = clock.getElapsedTime()

      const openT = Math.min(t / OPEN_DUR, 1)
      lidPivot.rotation.x = LID_OPEN * easeOutBack(openT)
      glow.intensity = 1.7 * openT

      const rise = Math.min(Math.max((t - 0.32) / 0.5, 0), 1)
      for (const item of loot) {
        item.mesh.visible = rise > 0
        item.mesh.position.y = 0.1 + rise * 0.45 + Math.sin(t * item.speed + item.phase) * 0.06 * rise
        item.mesh.rotation.y = t * item.speed
        item.mesh.rotation.x = t * item.speed * 0.6
      }

      if (medal) {
        const mRise = Math.min(Math.max((t - 0.5) / 0.5, 0), 1)
        medal.visible = mRise > 0
        medal.position.y = 0.7 + mRise * 0.55
        medal.rotation.y = t * 1.3
      }

      // Gentle idle: the whole chest bobs and turns slightly side to side.
      root.position.y = Math.sin(t * 1.4) * 0.04
      root.rotation.y = Math.sin(t * 0.5) * 0.16

      renderer.render(scene, camera)
    }
    render()

    return () => {
      running = false
      cancelAnimationFrame(raf)
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
