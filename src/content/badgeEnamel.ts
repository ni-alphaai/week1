// Per-badge enamel inlay colors for the medal center disc (see
// src/components/BadgeMedalScene.tsx). Pure data + a resolver — NO three import,
// so it stays out of the code-split three chunk. Colors are rich, saturated
// "enamel" tones spread around the hue wheel so the badge grid reads varied.

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
