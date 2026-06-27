import { useCallback, useEffect, useRef, useState } from 'react'
import type { MapConfig, Step } from '../types'
import type { CheckResult } from '../engine/checker'
import { playSound } from '../lib/sound'
import { buildRunTimeline, idleFrame, type MazeRenderState, type RunOutcome } from './timeline'

// Pages run at slightly different cadences (the lesson player is a touch slower).
const DEFAULT_STEP_MS = 240

export interface UsePuzzleRunOptions {
  /** The puzzle's map. The Run resets to its idle frame whenever this changes. */
  map: MapConfig
  /** Builds the result to animate — the page owns spec-building + conversion. */
  check: () => CheckResult
  /** Per-tile animation cadence. Defaults to 240ms. */
  stepMs?: number
  /** Fired as the Run begins (e.g. to scroll the maze into view). */
  onStart?: () => void
  /** Fired once the Run settles, for page-specific Attempt recording + reactions. */
  onSettle?: (outcome: RunOutcome) => void
}

export interface PuzzleRun {
  /** The Render Frame to show right now (idle frame before any Run). */
  frame: MazeRenderState
  animating: boolean
  solved: boolean
  crashed: boolean
  loopStuck: boolean
  feedback: { status: 'correct' | 'incorrect'; message: string } | null
  /** Executed-step chips for the Run Strip; empty until a Run plays. */
  chips: Step[]
  handleRun: () => void
  reset: () => void
}

// Plays a precomputed Run Timeline: steps an index through the frames on a timer,
// fires each frame's sound cues, and settles into the outcome. Owns the timers
// and their cleanup; the page supplies how to check the program and what to do
// when the Run settles.
export function usePuzzleRun({
  map,
  check,
  stepMs = DEFAULT_STEP_MS,
  onStart,
  onSettle,
}: UsePuzzleRunOptions): PuzzleRun {
  const [frame, setFrame] = useState<MazeRenderState>(() => idleFrame(map))
  const [animating, setAnimating] = useState(false)
  const [solved, setSolved] = useState(false)
  const [crashed, setCrashed] = useState(false)
  const [loopStuck, setLoopStuck] = useState(false)
  const [feedback, setFeedback] = useState<{ status: 'correct' | 'incorrect'; message: string } | null>(null)
  const [chips, setChips] = useState<Step[]>([])

  const timers = useRef<number[]>([])
  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }, [])

  // Clear any in-flight animation when the hook unmounts.
  useEffect(() => () => clearTimers(), [clearTimers])

  // A new puzzle (map identity change) resets to the idle resting state.
  useEffect(() => {
    clearTimers()
    setFrame(idleFrame(map))
    setAnimating(false)
    setSolved(false)
    setCrashed(false)
    setLoopStuck(false)
    setFeedback(null)
    setChips([])
  }, [map, clearTimers])

  const reset = useCallback(() => {
    clearTimers()
    setFrame(idleFrame(map))
    setAnimating(false)
    setSolved(false)
    setCrashed(false)
    setLoopStuck(false)
    setFeedback(null)
    setChips([])
  }, [map, clearTimers])

  function handleRun() {
    if (animating) return
    const result = check()
    const timeline = buildRunTimeline(result, map)

    clearTimers()
    setAnimating(true)
    setSolved(false)
    setCrashed(false)
    setLoopStuck(false)
    setFeedback(null)
    setChips(result.run.executed)
    setFrame(timeline.frames[0] ?? timeline.settle)
    onStart?.()
    playSound('runStart')

    timeline.frames.forEach((f, i) => {
      const timer = window.setTimeout(() => {
        setFrame(f)
        for (const cue of timeline.cues[i]) playSound(cue)
      }, i * stepMs)
      timers.current.push(timer)
    })

    const endTimer = window.setTimeout(
      () => {
        const { outcome } = timeline
        setAnimating(false)
        setFrame(timeline.settle)
        setSolved(outcome.solved)
        setCrashed(outcome.crashed)
        setLoopStuck(outcome.loopStuck)
        setFeedback({ status: outcome.solved ? 'correct' : 'incorrect', message: outcome.message })
        playSound(timeline.settleCue)
        onSettle?.(outcome)
      },
      timeline.frames.length * stepMs + 60,
    )
    timers.current.push(endTimer)
  }

  return { frame, animating, solved, crashed, loopStuck, feedback, chips, handleRun, reset }
}
