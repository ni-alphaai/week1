// Tiny synthesized sound engine built on the Web Audio API.
// No audio files to download, works offline, and stays well under any budget.
// Every cue is generated from oscillators so the whole thing is a few hundred bytes.

export type SoundName =
  | 'pick' // lift a card from the tray
  | 'place' // drop a card into the program
  | 'remove' // pull a card back out
  | 'step' // explorer hops one tile
  | 'runStart' // program begins executing
  | 'bridge' // crossing a bridge tile
  | 'success' // a puzzle is solved
  | 'error' // a run crashes or misses
  | 'complete' // a whole lesson is finished
  | 'click' // generic button tap
  | 'streak' // streak milestone on completion
  | 'pet' // a happy chirp when Rico is petted

const STORAGE_KEY = 'brillant.muted'

let audioCtx: AudioContext | null = null
let muted = readMuted()
const listeners = new Set<(muted: boolean) => void>()

function readMuted(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

function persistMuted(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0')
  } catch {
    // Storage may be unavailable (private mode); muting still works for the session.
  }
}

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!audioCtx) audioCtx = new Ctor()
  // Browsers start the context suspended until a user gesture; resume on demand.
  if (audioCtx.state === 'suspended') void audioCtx.resume()
  return audioCtx
}

interface Tone {
  freq: number
  start: number // seconds from now
  duration: number
  type?: OscillatorType
  gain?: number
  // Optional linear pitch glide to this frequency by the end of the tone.
  slideTo?: number
}

function playTones(tones: Tone[]): void {
  const ctx = getContext()
  if (!ctx) return
  const now = ctx.currentTime
  for (const tone of tones) {
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = tone.type ?? 'sine'
    const t0 = now + tone.start
    const t1 = t0 + tone.duration
    osc.frequency.setValueAtTime(tone.freq, t0)
    if (tone.slideTo) osc.frequency.linearRampToValueAtTime(tone.slideTo, t1)
    const peak = tone.gain ?? 0.18
    // Quick attack, smooth exponential release — keeps cues soft and non-jarring.
    env.gain.setValueAtTime(0.0001, t0)
    env.gain.exponentialRampToValueAtTime(peak, t0 + 0.012)
    env.gain.exponentialRampToValueAtTime(0.0001, t1)
    osc.connect(env).connect(ctx.destination)
    osc.start(t0)
    osc.stop(t1 + 0.02)
  }
}

const RECIPES: Record<SoundName, () => Tone[]> = {
  pick: () => [{ freq: 520, start: 0, duration: 0.08, type: 'triangle', gain: 0.12 }],
  place: () => [{ freq: 440, start: 0, duration: 0.1, type: 'triangle', slideTo: 660, gain: 0.16 }],
  remove: () => [{ freq: 360, start: 0, duration: 0.1, type: 'triangle', slideTo: 240, gain: 0.12 }],
  step: () => [{ freq: 300, start: 0, duration: 0.06, type: 'sine', gain: 0.08 }],
  runStart: () => [
    { freq: 220, start: 0, duration: 0.08, type: 'triangle', slideTo: 440, gain: 0.1 },
    { freq: 330, start: 0.06, duration: 0.1, type: 'triangle', slideTo: 550, gain: 0.08 },
  ],
  bridge: () => [{ freq: 440, start: 0, duration: 0.12, type: 'sine', slideTo: 660, gain: 0.1 }],
  click: () => [{ freq: 480, start: 0, duration: 0.05, type: 'square', gain: 0.07 }],
  streak: () => [
    { freq: 587.33, start: 0, duration: 0.1, type: 'triangle', gain: 0.14 }, // D5
    { freq: 783.99, start: 0.08, duration: 0.14, type: 'triangle', gain: 0.14 }, // G5
  ],
  pet: () => [
    { freq: 900, start: 0, duration: 0.08, type: 'sine', slideTo: 1300, gain: 0.12 },
    { freq: 1200, start: 0.07, duration: 0.1, type: 'sine', slideTo: 1700, gain: 0.1 },
  ],
  error: () => [
    { freq: 200, start: 0, duration: 0.18, type: 'sawtooth', slideTo: 120, gain: 0.14 },
    { freq: 150, start: 0.06, duration: 0.18, type: 'sawtooth', slideTo: 90, gain: 0.1 },
  ],
  success: () => [
    { freq: 523.25, start: 0, duration: 0.12, type: 'triangle', gain: 0.16 }, // C5
    { freq: 659.25, start: 0.1, duration: 0.12, type: 'triangle', gain: 0.16 }, // E5
    { freq: 783.99, start: 0.2, duration: 0.18, type: 'triangle', gain: 0.16 }, // G5
  ],
  complete: () => [
    { freq: 523.25, start: 0, duration: 0.14, type: 'triangle', gain: 0.16 }, // C5
    { freq: 659.25, start: 0.12, duration: 0.14, type: 'triangle', gain: 0.16 }, // E5
    { freq: 783.99, start: 0.24, duration: 0.14, type: 'triangle', gain: 0.16 }, // G5
    { freq: 1046.5, start: 0.36, duration: 0.28, type: 'triangle', gain: 0.18 }, // C6
  ],
}

export function playSound(name: SoundName): void {
  if (muted) return
  try {
    playTones(RECIPES[name]())
  } catch {
    // Audio is a non-essential enhancement; never let it break the app.
  }
}

export function isMuted(): boolean {
  return muted
}

export function setMuted(value: boolean): void {
  muted = value
  persistMuted(value)
  if (!value) playSound('click') // small confirmation that sound is back on
  listeners.forEach((listener) => listener(value))
}

export function toggleMuted(): void {
  setMuted(!muted)
}

export function subscribeMuted(listener: (muted: boolean) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
