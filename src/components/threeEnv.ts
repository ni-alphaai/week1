import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

// Shared three.js setup for the two reward/medal scenes. Both need identical
// renderer colour management and the same procedural studio environment that
// turns flat metals into believably reflective gold/silver/bronze. Keeping it
// here means BadgeMedalScene and TreasureChestScene stay focused on their own
// geometry/motion. This module only ever loads inside the dynamically-imported
// three chunk (both scenes are reached via dynamic import()), so it never adds
// to the initial bundle.

/**
 * Apply consistent colour management to a renderer: filmic tone mapping (so
 * bright metals/emissive roll off gracefully instead of clipping to harsh
 * white) and sRGB output.
 */
export function setupRenderer(renderer: THREE.WebGLRenderer): void {
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.1
}

/**
 * Generate a soft, procedural studio environment (RoomEnvironment → PMREM) and
 * assign it to `scene.environment` so every PBR material picks up reflections.
 * Works offline with zero assets. Returns a disposer that frees the generated
 * texture and the PMREM generator; call it from the scene's teardown.
 */
export function makeStudioEnvironment(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
): () => void {
  const pmrem = new THREE.PMREMGenerator(renderer)
  const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = envTexture

  return () => {
    scene.environment = null
    envTexture.dispose()
    pmrem.dispose()
  }
}
