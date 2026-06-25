import type { Action, Command, Instruction, MapConfig, Position, Predicate, Step } from '../types'
import { isAction } from '../types'

export type RunStatus = 'success' | 'offMap' | 'hitRock' | 'missedGoal' | 'badAction' | 'loopStuck'

// Safety cap so a malformed while-loop can never hang the UI.
const MAX_STEPS = 600
const MAX_WHILE_ITERATIONS = 200

// An action that happened mid-run, anchored to the path tile it occurred on.
export interface RunEvent {
  pathIndex: number
  type: Action
  /** Which task (0-based) this event advanced. */
  taskIndex: number
}

// A mechanic that fired mid-run (teleport jump, plate toggle, key pickup, door
// unlock), anchored to the path tile it happened on so the UI can animate it.
export interface WorldEvent {
  pathIndex: number
  kind: 'teleport' | 'teleport-depart' | 'plate' | 'key' | 'door'
  /** For plate events: the gate that changed and its new open state. */
  gateId?: string
  open?: boolean
}

// Inclusive column range still in play during a binary search.
export interface SearchWindow {
  lo: number
  hi: number
}

export interface RunResult {
  status: RunStatus
  // Tiles visited, starting with the start tile. Stops at the tile before a crash.
  path: Position[]
  /**
   * Run-counter value the learner should see while standing on each path tile,
   * after all landing effects (including counter-tile bonuses) at that tile.
   * INVARIANT: counterAtPath.length === path.length.
   */
  counterAtPath: number[]
  /**
   * Binary-search window active at each path tile (null on non-search maps).
   * INVARIANT: searchWindows.length === path.length.
   */
  searchWindows: (SearchWindow | null)[]
  steps: number
  failIndex: number | null
  end: Position
  /** Pickup/drop events along the run, in execution order. */
  events: RunEvent[]
  /** Mechanic events (teleport/plate/key/door) along the run, in order. */
  worldEvents: WorldEvent[]
  /** The flat move/action steps actually executed (control flow resolved). */
  executed: Step[]
  /** How many fetch-and-carry tasks were fully completed (picked + dropped). */
  tasksCompleted: number
  /** True if the explorer is still holding an item when the run ends. */
  carryingAtEnd: boolean
  /** On a badAction failure, why the pickup/drop was illegal. */
  actionError?: string
}

const DELTA: Record<Command, Position> = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 },
}

export function samePos(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col
}

// Static-only obstacle test (rocks + a closed bridge). Kept for callers that do
// not have runtime state; movement uses the state-aware test below.
export function isObstacle(map: MapConfig, pos: Position): boolean {
  // A closed bridge behaves like impassable water.
  if (map.bridge && !map.bridge.open && samePos(map.bridge, pos)) {
    return true
  }
  return (map.obstacles ?? []).some((o) => samePos(o, pos))
}

function inBounds(map: MapConfig, pos: Position): boolean {
  return pos.row >= 0 && pos.row < map.rows && pos.col >= 0 && pos.col < map.cols
}

function tileKey(pos: Position): string {
  return `${pos.row},${pos.col}`
}

// Append a tile to the path, recording the current counter value (and, in
// binary-search maps, the live window) alongside it so the per-tile arrays stay
// exactly as long as `path` on every code path.
function pushTile(state: ExecState, pos: Position): void {
  state.path.push(pos)
  state.counterAtPath.push(state.counter)
  state.searchWindows.push(state.trackWindow ? { lo: state.lo, hi: state.hi } : null)
}

// Mutable bookkeeping shared across the interpreter's recursive calls.
interface ExecState {
  pos: Position
  carrying: boolean
  taskIndex: number
  path: Position[]
  /** Counter value per path tile — kept in lockstep with `path`. */
  counterAtPath: number[]
  /** Binary-search window per path tile (null when not tracking) — in lockstep with `path`. */
  searchWindows: (SearchWindow | null)[]
  /** Whether to record the search window on each pushed tile. */
  trackWindow: boolean
  /** Run counter; increments by one after each successful move. */
  counter: number
  /** Counter tiles already credited, so a re-visit cannot double-count. */
  visitedCounterTiles: Set<string>
  events: RunEvent[]
  worldEvents: WorldEvent[]
  executed: Step[]
  /** Live gate open/closed state, keyed by gate id. */
  gates: Record<string, boolean>
  /** Keys collected but not yet spent on a door. */
  keysHeld: number
  /** Tiles whose key has already been picked up. */
  keysTaken: Set<string>
  /** Binary-search window (inclusive column bounds). Only used in binarySearch maps. */
  lo: number
  hi: number
}

// A failure surfaced from somewhere inside the instruction tree.
interface ExecFailure {
  status: Exclude<RunStatus, 'success' | 'missedGoal'>
  actionError?: string
}

function gateAt(map: MapConfig, pos: Position) {
  return (map.gates ?? []).find((gate) => samePos(gate.at, pos))
}

function isDoorTile(map: MapConfig, pos: Position): boolean {
  return (map.doors ?? []).some((door) => samePos(door, pos))
}

// Why is this tile impassable right now? null means it can be entered.
// 'door' means it is a locked door that a held key could open.
function blockReason(map: MapConfig, state: ExecState, pos: Position): 'wall' | 'door' | null {
  if (isObstacle(map, pos)) return 'wall'
  const gate = gateAt(map, pos)
  if (gate && !state.gates[gate.id]) return 'wall'
  if (isDoorTile(map, pos)) return state.keysHeld > 0 ? null : 'door'
  return null
}

// Is the neighbouring tile in `dir` blocked right now (edge, rock, closed gate,
// or a locked door we cannot open)?
function blockedToward(map: MapConfig, state: ExecState, dir: Command): boolean {
  const delta = DELTA[dir]
  const next: Position = { row: state.pos.row + delta.row, col: state.pos.col + delta.col }
  return !inBounds(map, next) || blockReason(map, state, next) !== null
}

// The number shown on the tile the explorer is standing on, or null if none.
function valueAt(map: MapConfig, pos: Position): number | null {
  const tile = (map.numberTiles ?? []).find((t) => samePos(t.at, pos))
  return tile ? tile.value : null
}

export function evalPredicate(map: MapConfig, state: ExecState, predicate: Predicate): boolean {
  switch (predicate.sensor) {
    case 'blocked':
      return blockedToward(map, state, predicate.dir)
    case 'clear':
      return !blockedToward(map, state, predicate.dir)
    case 'atGem': {
      const task = (map.tasks ?? [])[state.taskIndex]
      return !state.carrying && !!task && samePos(state.pos, task.from)
    }
    case 'bridgeOpen':
      return map.bridge?.open === true
    case 'counterEven':
      return state.counter % 2 === 0
    case 'counterOdd':
      return state.counter % 2 !== 0
    case 'counterMod':
      return state.counter % predicate.divisor === predicate.remainder
    case 'targetFound':
      return valueAt(map, state.pos) === map.targetValue
    case 'targetNotFound':
      return valueAt(map, state.pos) !== map.targetValue
    case 'targetHigher': {
      const here = valueAt(map, state.pos)
      return here !== null && map.targetValue !== undefined && map.targetValue > here
    }
    case 'targetLower': {
      const here = valueAt(map, state.pos)
      return here !== null && map.targetValue !== undefined && map.targetValue < here
    }
  }
}

// The explicit binary-search cards. `toMiddle` leaps to the middle of the live
// window; `discardLower`/`discardUpper` narrow the window without moving. A
// collapsed window only fails on the next `toMiddle`, so a loop that exits on
// "found" right after the final discard still succeeds. Returns a failure or null.
function runSearchOp(
  map: MapConfig,
  state: ExecState,
  step: 'toMiddle' | 'discardLower' | 'discardUpper',
): ExecFailure | null {
  if (step === 'discardLower') {
    state.lo = state.pos.col + 1
    state.executed.push(step)
    return null
  }
  if (step === 'discardUpper') {
    state.hi = state.pos.col - 1
    state.executed.push(step)
    return null
  }
  // toMiddle — the window is empty, so the number is nowhere left to find.
  if (state.lo > state.hi) return { status: 'offMap' }
  const mid = Math.floor((state.lo + state.hi) / 2)
  const next: Position = { row: state.pos.row, col: mid }
  if (!inBounds(map, next)) return { status: 'offMap' }
  state.pos = next
  state.counter += 1
  pushTile(state, next)
  state.executed.push(step)
  return resolveLanding(map, state, 'right')
}

// Executes a single move or action, mutating state. Returns a failure or null.
function runStep(map: MapConfig, state: ExecState, step: Step): ExecFailure | null {
  if (state.executed.length >= MAX_STEPS) {
    return { status: 'loopStuck' }
  }

  if (step === 'toMiddle' || step === 'discardLower' || step === 'discardUpper') {
    return runSearchOp(map, state, step)
  }

  if (isAction(step)) {
    const task = (map.tasks ?? [])[state.taskIndex]
    if (step === 'pickup') {
      if (state.carrying) return { status: 'badAction', actionError: 'Your explorer is already carrying something.' }
      if (!task || !samePos(state.pos, task.from)) {
        return { status: 'badAction', actionError: 'There is nothing to pick up on this tile.' }
      }
      state.carrying = true
      state.events.push({ pathIndex: state.path.length - 1, type: 'pickup', taskIndex: state.taskIndex })
      state.executed.push(step)
      return null
    }
    if (!state.carrying) return { status: 'badAction', actionError: 'Your explorer has nothing to drop.' }
    if (!task || !samePos(state.pos, task.to)) {
      return { status: 'badAction', actionError: 'This is not the right drop-off tile.' }
    }
    state.carrying = false
    state.events.push({ pathIndex: state.path.length - 1, type: 'drop', taskIndex: state.taskIndex })
    state.taskIndex += 1
    state.executed.push(step)
    return null
  }

  const delta = DELTA[step]
  const next: Position = { row: state.pos.row + delta.row, col: state.pos.col + delta.col }
  if (!inBounds(map, next)) return { status: 'offMap' }
  const block = blockReason(map, state, next)
  if (block === 'wall') return { status: 'hitRock' }
  if (block === 'door') return { status: 'hitRock' }

  // Crossing a door spends one key.
  if (isDoorTile(map, next)) {
    state.keysHeld -= 1
    state.worldEvents.push({ pathIndex: state.path.length, kind: 'door' })
  }
  state.pos = next
  // A successful move advances the run counter by exactly one (actions do not).
  state.counter += 1
  pushTile(state, next)
  state.executed.push(step)
  return resolveLanding(map, state, step)
}

// After a move lands on a tile, apply its mechanics (key pickup, plate, teleport,
// ice slide). Ice and teleport can chain, so loop until the tile is stable —
// guarded by MAX_STEPS so nothing can spin forever.
function resolveLanding(map: MapConfig, state: ExecState, dir: Command): ExecFailure | null {
  let guard = 0
  // The tile we just teleported onto — don't immediately bounce back from it.
  let suppressTeleportAt: Position | null = null
  for (;;) {
    if (state.path.length > MAX_STEPS) return { status: 'loopStuck' }
    if (guard++ > MAX_STEPS) return { status: 'loopStuck' }
    const here = state.pos

    // Pick up a key lying on this tile.
    if ((map.keys ?? []).some((k) => samePos(k, here)) && !state.keysTaken.has(tileKey(here))) {
      state.keysTaken.add(tileKey(here))
      state.keysHeld += 1
      state.worldEvents.push({ pathIndex: state.path.length - 1, kind: 'key' })
    }

    // Step on a plate: open or toggle its gate.
    const plate = (map.plates ?? []).find((p) => samePos(p.at, here))
    if (plate) {
      const open = plate.mode === 'open' ? true : !state.gates[plate.gateId]
      state.gates[plate.gateId] = open
      state.worldEvents.push({ pathIndex: state.path.length - 1, kind: 'plate', gateId: plate.gateId, open })
    }

    // Teleport pads whisk to their partner (but not straight back again).
    const pad = (map.teleports ?? []).find((t) => samePos(t.a, here) || samePos(t.b, here))
    if (pad && !(suppressTeleportAt && samePos(suppressTeleportAt, here))) {
      const dest = samePos(pad.a, here) ? pad.b : pad.a
      if (!samePos(dest, here)) {
        state.worldEvents.push({ pathIndex: state.path.length - 1, kind: 'teleport-depart' })
        state.pos = dest
        pushTile(state, dest)
        state.worldEvents.push({ pathIndex: state.path.length - 1, kind: 'teleport' })
        suppressTeleportAt = dest
        continue
      }
    }

    // Slippery ice keeps the explorer sliding in the same direction.
    if ((map.ice ?? []).some((tile) => samePos(tile, here))) {
      const d = DELTA[dir]
      const ahead: Position = { row: here.row + d.row, col: here.col + d.col }
      if (inBounds(map, ahead) && blockReason(map, state, ahead) === null) {
        if (isDoorTile(map, ahead)) {
          state.keysHeld -= 1
          state.worldEvents.push({ pathIndex: state.path.length, kind: 'door' })
        }
        state.pos = ahead
        pushTile(state, ahead)
        continue
      }
    }

    // Step on a counter tile: credit its bonus once per visited tile, so an ice
    // slide or teleport re-entering the same tile can't make the count run away.
    const cTile = (map.counterTiles ?? []).find((t) => samePos(t.at, here))
    if (cTile && !state.visitedCounterTiles.has(tileKey(here))) {
      state.visitedCounterTiles.add(tileKey(here))
      state.counter += cTile.bonus ?? 1
    }

    // The settle tile is the current last path entry; record its post-bonus
    // counter value so `counterAtPath` reflects what the learner sees here.
    state.counterAtPath[state.counterAtPath.length - 1] = state.counter
    return null
  }
}

function runBody(map: MapConfig, state: ExecState, body: Instruction[]): ExecFailure | null {
  for (const instruction of body) {
    const failure = runInstruction(map, state, instruction)
    if (failure) return failure
  }
  return null
}

function runInstruction(map: MapConfig, state: ExecState, instruction: Instruction): ExecFailure | null {
  if (typeof instruction === 'string') {
    return runStep(map, state, instruction)
  }
  if (instruction.kind === 'conditional') {
    const branch = evalPredicate(map, state, instruction.predicate) ? instruction.then : instruction.else
    return runBody(map, state, branch)
  }
  if (instruction.kind === 'loop') {
    for (let i = 0; i < instruction.count; i++) {
      const failure = runBody(map, state, instruction.body)
      if (failure) return failure
    }
    return null
  }
  // while-loop
  let iterations = 0
  while (evalPredicate(map, state, instruction.predicate)) {
    if (iterations >= MAX_WHILE_ITERATIONS || state.executed.length >= MAX_STEPS) {
      return { status: 'loopStuck' }
    }
    const before = state.executed.length
    const failure = runBody(map, state, instruction.body)
    if (failure) return failure
    // A body that makes no progress would spin forever — stop it.
    if (state.executed.length === before) return { status: 'loopStuck' }
    iterations += 1
  }
  return null
}

// Interprets a program (moves, actions, if/else, for-loops, while-loops) against
// the map, resolving all control flow at runtime. Deterministic and synchronous.
export function runInstructions(map: MapConfig, instructions: Instruction[]): RunResult {
  const gates: Record<string, boolean> = {}
  for (const gate of map.gates ?? []) gates[gate.id] = gate.open

  // Binary-search window spans the columns covered by the sorted number row.
  const searchCols = (map.numberTiles ?? []).map((t) => t.at.col)
  const lo = searchCols.length > 0 ? Math.min(...searchCols) : 0
  const hi = searchCols.length > 0 ? Math.max(...searchCols) : map.cols - 1
  const trackWindow = !!map.binarySearch

  const state: ExecState = {
    pos: map.start,
    carrying: false,
    taskIndex: 0,
    path: [map.start],
    counterAtPath: [0],
    searchWindows: [trackWindow ? { lo, hi } : null],
    trackWindow,
    counter: 0,
    visitedCounterTiles: new Set<string>(),
    events: [],
    worldEvents: [],
    executed: [],
    gates,
    keysHeld: 0,
    keysTaken: new Set<string>(),
    lo,
    hi,
  }

  let failure: ExecFailure | null = null
  for (const instruction of instructions) {
    failure = runInstruction(map, state, instruction)
    if (failure) break
  }

  const tail = {
    path: state.path,
    counterAtPath: state.counterAtPath,
    searchWindows: state.searchWindows,
    events: state.events,
    worldEvents: state.worldEvents,
    executed: state.executed,
    end: state.pos,
    tasksCompleted: state.taskIndex,
    carryingAtEnd: state.carrying,
  }

  if (failure) {
    return {
      status: failure.status,
      steps: state.executed.length,
      failIndex: state.path.length - 1,
      actionError: failure.actionError,
      ...tail,
    }
  }

  const resolved = { steps: state.executed.length, failIndex: null, ...tail }
  if (samePos(state.pos, map.goal)) {
    return { status: 'success', ...resolved }
  }
  return { status: 'missedGoal', ...resolved }
}

// Runs a flat list of steps (moves + actions). Thin wrapper over the interpreter.
export function runProgram(map: MapConfig, steps: Step[]): RunResult {
  return runInstructions(map, steps)
}

export function checkpointsVisitedInOrder(path: Position[], checkpoints: Position[]): number {
  let next = 0
  for (const pos of path) {
    if (next < checkpoints.length && samePos(pos, checkpoints[next])) {
      next += 1
    }
  }
  return next
}

export function allCheckpointsVisited(path: Position[], checkpoints: Position[]): boolean {
  return checkpoints.length === 0 || checkpointsVisitedInOrder(path, checkpoints) === checkpoints.length
}

// Gate open/closed state from the map's starting config.
export function initialGateStates(map: MapConfig): Record<string, boolean> {
  const gates: Record<string, boolean> = {}
  for (const gate of map.gates ?? []) gates[gate.id] = gate.open
  return gates
}

// Gate states as of a given path index — drives the run animation.
export function gateStatesAt(
  map: MapConfig,
  worldEvents: WorldEvent[],
  pathIndex: number,
): Record<string, boolean> {
  const gates = initialGateStates(map)
  for (const ev of worldEvents) {
    if (ev.kind === 'plate' && ev.gateId && ev.pathIndex <= pathIndex) {
      gates[ev.gateId] = ev.open ?? gates[ev.gateId]
    }
  }
  return gates
}

// How many keys have been collected by a given path index.
export function keysCollectedAt(worldEvents: WorldEvent[], pathIndex: number): number {
  let collected = 0
  for (const ev of worldEvents) {
    if (ev.kind === 'key' && ev.pathIndex <= pathIndex) collected += 1
  }
  return collected
}

// Cumulative pickup/drop counts at each path index — drives run animation.
export function carryFrames(path: Position[], events: RunEvent[]): { picked: number; dropped: number }[] {
  const frames = path.map(() => ({ picked: 0, dropped: 0 }))
  for (const event of events) {
    for (let i = event.pathIndex; i < frames.length; i++) {
      if (event.type === 'pickup') frames[i].picked += 1
      else frames[i].dropped += 1
    }
  }
  return frames
}
