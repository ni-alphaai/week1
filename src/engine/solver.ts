// Deterministic shortest-path solver for plain-move puzzles.
//
// This is the trust anchor for AI problem generation: before any generated
// puzzle reaches a child, the solver proves it is solvable and computes the true
// optimal move count and one concrete solution. It is scoped to plain movement
// (up/down/left/right) over a grid with static obstacles - the puzzle shapes P1
// generation produces. It reuses `isObstacle`/`samePos` and validates its answer
// against `runInstructions`, so it agrees with `checkProgram`.

import type { CardLimits, Command, MapConfig, Position } from '../types'
import { isObstacle, samePos, runInstructions } from './map'

const STEP_DELTA: Record<Command, Position> = {
  up: { row: -1, col: 0 },
  down: { row: 1, col: 0 },
  left: { row: 0, col: -1 },
  right: { row: 0, col: 1 },
}

const COMMANDS: Command[] = ['up', 'down', 'left', 'right']

export interface SolveResult {
  solvable: boolean
  optimalMoves: number | null
  solution: Command[] | null
}

function inBounds(map: MapConfig, pos: Position): boolean {
  return pos.row >= 0 && pos.row < map.rows && pos.col >= 0 && pos.col < map.cols
}

function key(pos: Position): string {
  return `${pos.row},${pos.col}`
}

// Breadth-first search guarantees the first time we reach the goal is via a
// shortest path, so `optimalMoves` is exact.
export function solvePlainMoves(map: MapConfig): SolveResult {
  const unsolved: SolveResult = { solvable: false, optimalMoves: null, solution: null }
  const { start, goal } = map
  if (!inBounds(map, start) || !inBounds(map, goal)) return unsolved
  if (isObstacle(map, start) || isObstacle(map, goal)) return unsolved
  if (samePos(start, goal)) return { solvable: true, optimalMoves: 0, solution: [] }

  const visited = new Set<string>([key(start)])
  const cameFrom = new Map<string, { prev: string; cmd: Command }>()
  let frontier: Position[] = [start]

  while (frontier.length > 0) {
    const next: Position[] = []
    for (const pos of frontier) {
      for (const cmd of COMMANDS) {
        const delta = STEP_DELTA[cmd]
        const np: Position = { row: pos.row + delta.row, col: pos.col + delta.col }
        if (!inBounds(map, np) || isObstacle(map, np)) continue
        const k = key(np)
        if (visited.has(k)) continue
        visited.add(k)
        cameFrom.set(k, { prev: key(pos), cmd })
        if (samePos(np, goal)) {
          const solution = reconstruct(cameFrom, key(start), k)
          // Defensive: confirm the path against the real interpreter.
          const run = runInstructions(map, solution)
          if (run.status === 'success' && samePos(run.end, goal)) {
            return { solvable: true, optimalMoves: solution.length, solution }
          }
          return unsolved
        }
        next.push(np)
      }
    }
    frontier = next
  }
  return unsolved
}

function reconstruct(
  cameFrom: Map<string, { prev: string; cmd: Command }>,
  startKey: string,
  goalKey: string,
): Command[] {
  const commands: Command[] = []
  let cur = goalKey
  while (cur !== startKey) {
    const step = cameFrom.get(cur)
    if (!step) break
    commands.push(step.cmd)
    cur = step.prev
  }
  commands.reverse()
  return commands
}

// Per-command move budget derived from a puzzle's card limits. A command absent
// from `cardLimits` is unlimited; the editor lets the learner place as many of
// that move card as they like, so a flat solution may use any number of them.
type Budget = Record<Command, number>

function budgetFromLimits(cardLimits: CardLimits): Budget {
  const cap = (cmd: Command): number =>
    cardLimits[cmd] === undefined ? Number.POSITIVE_INFINITY : Math.max(0, cardLimits[cmd] as number)
  return { up: cap('up'), down: cap('down'), left: cap('left'), right: cap('right') }
}

// State key folds the position with the remaining budget of every LIMITED
// command (unlimited commands never decrement, so they cannot grow the state
// space). Because limited budgets only shrink and positions are bounded, the
// reachable state set is finite and the BFS is exhaustive.
function limitKey(pos: Position, budget: Budget): string {
  const lim = (n: number): string => (Number.isFinite(n) ? String(n) : '*')
  return `${pos.row},${pos.col}|${lim(budget.up)},${lim(budget.down)},${lim(budget.left)},${lim(budget.right)}`
}

// Can the goal be reached using ONLY plain moves, spending no more of each move
// card than `cardLimits` allows? This is the engine's proof that a *flat* (no
// loop/while) move-only program does NOT fit the offered card budget — i.e. a
// loop is genuinely required. Budgets are tiny so the bounded BFS is exhaustive.
export function solveWithinLimits(map: MapConfig, cardLimits: CardLimits): boolean {
  const { start, goal } = map
  if (!inBounds(map, start) || !inBounds(map, goal)) return false
  if (isObstacle(map, start) || isObstacle(map, goal)) return false
  if (samePos(start, goal)) return true

  const startBudget = budgetFromLimits(cardLimits)
  const visited = new Set<string>([limitKey(start, startBudget)])
  let frontier: { pos: Position; budget: Budget }[] = [{ pos: start, budget: startBudget }]

  while (frontier.length > 0) {
    const next: { pos: Position; budget: Budget }[] = []
    for (const { pos, budget } of frontier) {
      for (const cmd of COMMANDS) {
        if (budget[cmd] <= 0) continue
        const delta = STEP_DELTA[cmd]
        const np: Position = { row: pos.row + delta.row, col: pos.col + delta.col }
        if (!inBounds(map, np) || isObstacle(map, np)) continue
        const nb: Budget = { ...budget }
        // Only finite budgets decrement; unlimited commands stay unlimited.
        if (Number.isFinite(nb[cmd])) nb[cmd] -= 1
        if (samePos(np, goal)) return true
        const k = limitKey(np, nb)
        if (visited.has(k)) continue
        visited.add(k)
        next.push({ pos: np, budget: nb })
      }
    }
    frontier = next
  }
  return false
}
