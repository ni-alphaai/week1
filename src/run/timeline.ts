import type { Command, MapConfig, Position } from '../types'
import { isAction } from '../types'
import type { CheckResult } from '../engine/checker'
import type { RunResult, SearchWindow } from '../engine/map'
import {
  carryFrames,
  checkpointsVisitedInOrder,
  gateStatesAt,
  keysCollectedAt,
  samePos,
} from '../engine/map'
import type { SoundName } from '../lib/sound'

// A Render Frame: the complete visible state of the maze at one moment of a Run.
// Flat and self-neutralizing — authored-lesson fields (checkpoints, gates, keys,
// counter, search window) sit at neutral values on puzzles that lack them, so a
// consumer reads the fields uniformly with no branching.
export interface MazeRenderState {
  explorer: Position
  facing: Command
  activeTile: Position | null
  /** Index into the Run Strip's chips of the currently-resolving step, or -1. */
  activeStepIndex: number
  taskPicked: number
  taskDropped: number
  isTeleporting: boolean
  isDeparting: boolean
  checkpointsDelivered: number
  gateState: Record<string, boolean>
  keysCollected: number
  counter: number | undefined
  searchWindow: SearchWindow | null
}

// The recorded shape of a Run's result, handed to the page so it can persist an
// Attempt and react (celebrate, surface the last failed attempt).
export interface RunOutcome {
  solved: boolean
  crashed: boolean
  loopStuck: boolean
  message: string
  run: RunResult
}

// A Run animation, fully precomputed: the frames to show, the sounds to play as
// each shows, the terminal settle frame, and the outcome.
export interface RunTimeline {
  /** One Render Frame per path tile, in animation order. */
  frames: MazeRenderState[]
  /** cues[i] are the sounds to play (in order) as frames[i] shows. */
  cues: SoundName[][]
  /** Terminal frame: explorer settled, transient flags cleared. */
  settle: MazeRenderState
  /** Sound played when the run settles. */
  settleCue: SoundName
  outcome: RunOutcome
}

function facingBetween(from: Position, to: Position): Command | null {
  if (to.row < from.row) return 'up'
  if (to.row > from.row) return 'down'
  if (to.col < from.col) return 'left'
  if (to.col > from.col) return 'right'
  return null
}

// For each path-tile index, the index into the executed-step chips of the step
// that is "active" while the explorer stands on that tile, or -1 before any step
// completes. Every move appends exactly one path tile (the i-th move resolves at
// path index i); actions hold the index steady.
function activeStripIndices(run: RunResult): number[] {
  const pathLen = Math.max(run.path.length, 1)
  const completion: number[] = []
  let pathIndex = 0
  for (const step of run.executed) {
    if (isAction(step)) {
      completion.push(pathIndex)
    } else {
      pathIndex += 1
      completion.push(pathIndex)
    }
  }
  const active = new Array<number>(pathLen).fill(-1)
  for (let i = 0; i < pathLen; i++) {
    let a = -1
    for (let j = 0; j < completion.length; j++) {
      if (completion[j] <= i) a = j
      else break
    }
    active[i] = a
  }
  return active
}

// The neutral resting state shown before a Run plays and after a reset: explorer
// at the map start facing right, every world feature at its neutral value.
export function idleFrame(map: MapConfig): MazeRenderState {
  return {
    explorer: map.start,
    facing: 'right',
    activeTile: null,
    activeStepIndex: -1,
    taskPicked: 0,
    taskDropped: 0,
    isTeleporting: false,
    isDeparting: false,
    checkpointsDelivered: 0,
    gateState: {},
    keysCollected: 0,
    counter: undefined,
    searchWindow: null,
  }
}

// Precompute a whole Run as a list of Render Frames plus a parallel sound-cue
// track and the terminal settle frame. Pure: every per-tile value is a function
// of the run and the map, so the animation is a value you can test directly.
export function buildRunTimeline(result: CheckResult, map: MapConfig): RunTimeline {
  const run = result.run
  const path = run.path
  const checkpoints = map.checkpoints ?? []
  const bridge = map.bridge
  const carry = carryFrames(path, run.events)
  const active = activeStripIndices(run)

  const teleportAt = new Set<number>()
  const teleportDepartAt = new Set<number>()
  for (const ev of run.worldEvents) {
    if (ev.kind === 'teleport') teleportAt.add(ev.pathIndex)
    if (ev.kind === 'teleport-depart') teleportDepartAt.add(ev.pathIndex)
  }

  const frames: MazeRenderState[] = []
  const cues: SoundName[][] = []
  let facing: Command = 'right'

  for (let i = 0; i < path.length; i++) {
    const pos = path[i]
    const carried = carry[i] ?? { picked: 0, dropped: 0 }
    const prev = i > 0 ? (carry[i - 1] ?? { picked: 0, dropped: 0 }) : { picked: 0, dropped: 0 }

    if (i > 0) {
      const dir = facingBetween(path[i - 1], pos)
      if (dir) facing = dir
    }

    frames.push({
      explorer: pos,
      facing,
      activeTile: pos,
      activeStepIndex: active[i] ?? -1,
      taskPicked: carried.picked,
      taskDropped: carried.dropped,
      isTeleporting: teleportAt.has(i),
      isDeparting: teleportDepartAt.has(i),
      checkpointsDelivered: checkpointsVisitedInOrder(path.slice(0, i + 1), checkpoints),
      gateState: gateStatesAt(map, run.worldEvents, i),
      keysCollected: keysCollectedAt(run.worldEvents, i),
      counter: run.counterAtPath[i],
      searchWindow: run.searchWindows[i] ?? null,
    })

    // Sounds for this tile, in the order the page fired them: pick, place, then
    // the step/bridge hop (every move after the first).
    const cue: SoundName[] = []
    if (carried.picked > prev.picked) cue.push('pick')
    if (carried.dropped > prev.dropped) cue.push('place')
    if (i > 0) cue.push(bridge && samePos(pos, bridge) ? 'bridge' : 'step')
    cues.push(cue)
  }

  const lastCarry = carry[carry.length - 1] ?? { picked: 0, dropped: 0 }
  const lastPos = path[path.length - 1] ?? map.start
  const settle: MazeRenderState = {
    explorer: lastPos,
    facing,
    activeTile: null,
    activeStepIndex: active[active.length - 1] ?? -1,
    taskPicked: lastCarry.picked,
    taskDropped: lastCarry.dropped,
    isTeleporting: false,
    isDeparting: false,
    checkpointsDelivered: result.correct
      ? checkpoints.length
      : checkpointsVisitedInOrder(path, checkpoints),
    gateState: gateStatesAt(map, run.worldEvents, path.length),
    keysCollected: keysCollectedAt(run.worldEvents, path.length),
    counter: run.counterAtPath.length > 0 ? run.counterAtPath[run.counterAtPath.length - 1] : undefined,
    searchWindow: run.searchWindows.length > 0 ? run.searchWindows[run.searchWindows.length - 1] : null,
  }

  const outcome: RunOutcome = {
    solved: result.correct,
    crashed: !result.correct && run.status !== 'success',
    loopStuck: run.status === 'loopStuck',
    message: result.message,
    run,
  }

  return { frames, cues, settle, settleCue: result.correct ? 'success' : 'error', outcome }
}
