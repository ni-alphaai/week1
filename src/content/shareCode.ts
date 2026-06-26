// Stateless, self-contained puzzle share-code encoder/decoder.
//
// A share code is a URL-safe string `v1.<base64url(JSON)>` that carries a
// ShareablePuzzle. Decoding validates every field (mirroring the guards in
// ai/generation.ts but reimplemented locally so this module has no private
// dependencies) and replays the solution through the engine — a shared code
// can never surface a broken puzzle. The codec is deterministic and
// side-effect-free: no network, no localStorage, and decodePuzzle never throws
// on hostile input (it returns null instead).

import type {
  Action,
  BlockKind,
  Command,
  Instruction,
  MapConfig,
  Position,
  Predicate,
  PredicateOption,
  StepFeedback,
} from '../types'
import { runInstructions } from '../engine/map'

export interface ShareablePuzzle {
  map: MapConfig
  availableCommands: Command[]
  availableActions?: Action[]
  blocks?: BlockKind[]
  predicateOptions?: PredicateOption[]
  loopRange?: { min: number; max: number }
  cardLimits?: Partial<Record<Command | Action | BlockKind, number>>
  solution: Instruction[]
  goal?: string
  prompt?: string
  feedback?: StepFeedback
}

const VERSION = 'v1'
const PREFIX = `${VERSION}.`

// ---------------------------------------------------------------------------
// base64url helpers (URL-safe, padding-stripped, Unicode-safe).

function toBase64Url(input: string): string {
  // Encode the UTF-8 bytes of the string into a latin1 string that btoa accepts.
  const utf8 = encodeURIComponent(input).replace(/%([0-9A-F]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16)),
  )
  const standard = btoa(utf8)
  return standard.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(input: string): string | null {
  if (!/^[A-Za-z0-9_-]*$/.test(input)) return null
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const standard = padded + '='.repeat((4 - (padded.length % 4)) % 4)
  let utf8: string
  try {
    utf8 = atob(standard)
  } catch {
    return null
  }
  // Decode the UTF-8 bytes back into a JS string.
  try {
    return decodeURIComponent(
      Array.from(utf8)
        .map((ch) => '%' + ch.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    )
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Local validation guards (mirror ai/generation.ts style; no private imports).

const COMMANDS: readonly Command[] = ['up', 'down', 'left', 'right']
const ACTIONS: readonly Action[] = [
  'pickup',
  'drop',
  'toMiddle',
  'discardLower',
  'discardUpper',
  'dash',
  'shield',
  'super',
  'hold',
]
const BLOCK_KINDS: readonly BlockKind[] = ['loop', 'while', 'if']

const SENSOR_DIRS = new Set(['blocked', 'clear'])
const SENSOR_BARE = new Set([
  'atGem',
  'bridgeOpen',
  'counterEven',
  'counterOdd',
  'targetFound',
  'targetNotFound',
  'targetHigher',
  'targetLower',
])

function isCommand(value: unknown): value is Command {
  return typeof value === 'string' && (COMMANDS as readonly string[]).includes(value)
}

function isActionString(value: unknown): value is Action {
  return typeof value === 'string' && (ACTIONS as readonly string[]).includes(value)
}

function isBlockKind(value: unknown): value is BlockKind {
  return typeof value === 'string' && (BLOCK_KINDS as readonly string[]).includes(value)
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isPosition(value: unknown, rows: number, cols: number): value is Position {
  if (!value || typeof value !== 'object') return false
  const p = value as Record<string, unknown>
  return (
    isInteger(p.row) &&
    isInteger(p.col) &&
    (p.row as number) >= 0 &&
    (p.row as number) < rows &&
    (p.col as number) >= 0 &&
    (p.col as number) < cols
  )
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((s) => typeof s === 'string')
}

function parsePredicate(value: unknown): Predicate | null {
  if (!value || typeof value !== 'object') return null
  const p = value as Record<string, unknown>
  const sensor = p.sensor
  if (typeof sensor !== 'string') return null
  if (SENSOR_DIRS.has(sensor)) {
    if (!isCommand(p.dir)) return null
    return { sensor: sensor as 'blocked' | 'clear', dir: p.dir }
  }
  if (sensor === 'counterMod') {
    if (!isInteger(p.divisor) || !isInteger(p.remainder) || (p.divisor as number) <= 0) return null
    return {
      sensor: 'counterMod',
      divisor: p.divisor as number,
      remainder: p.remainder as number,
    }
  }
  if (SENSOR_BARE.has(sensor)) {
    return { sensor } as Predicate
  }
  return null
}

// Parse one nested Instruction. Returns null on any malformation, recursing
// into loop/while/conditional bodies so a single bad node rejects the whole.
function parseInstruction(value: unknown): Instruction | null {
  if (typeof value === 'string') {
    if (isCommand(value) || isActionString(value)) return value
    return null
  }
  if (!value || typeof value !== 'object') return null
  const node = value as Record<string, unknown>
  const kind = node.kind

  if (kind === 'loop') {
    if (!isInteger(node.count) || (node.count as number) < 1) return null
    const body = parseInstructionList(node.body)
    if (!body) return null
    const label = typeof node.label === 'string' ? node.label : `Repeat ${node.count as number}×`
    return { kind: 'loop', count: node.count as number, body, label }
  }
  if (kind === 'conditional') {
    const predicate = parsePredicate(node.predicate)
    if (!predicate) return null
    const thenB = parseInstructionList(node.then)
    const elseB = parseInstructionList(node.else ?? [])
    if (!thenB || !elseB) return null
    const label = typeof node.label === 'string' ? node.label : 'condition'
    return { kind: 'conditional', predicate, then: thenB, else: elseB, label }
  }
  if (kind === 'while') {
    const predicate = parsePredicate(node.predicate)
    if (!predicate) return null
    const body = parseInstructionList(node.body)
    if (!body) return null
    const label = typeof node.label === 'string' ? node.label : 'while'
    return { kind: 'while', predicate, body, label }
  }
  return null
}

function parseInstructionList(value: unknown): Instruction[] | null {
  if (!Array.isArray(value)) return null
  const out: Instruction[] = []
  for (const item of value) {
    const inst = parseInstruction(item)
    if (inst === null) return null
    out.push(inst)
  }
  return out
}

function parsePredicateOption(value: unknown): PredicateOption | null {
  if (!value || typeof value !== 'object') return null
  const o = value as Record<string, unknown>
  const predicate = parsePredicate(o.predicate)
  if (!predicate) return null
  const label = typeof o.label === 'string' ? o.label : 'condition'
  return { predicate, label }
}

function parseCardLimits(
  value: unknown,
): Partial<Record<Command | Action | BlockKind, number>> | undefined | null {
  if (value === undefined || value === null) return undefined
  if (!value || typeof value !== 'object') return null
  const out: Partial<Record<Command | Action | BlockKind, number>> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!isCommand(key) && !isActionString(key) && !isBlockKind(key)) return null
    if (!isInteger(raw) || (raw as number) < 0) return null
    out[key as Command | Action | BlockKind] = raw as number
  }
  return out
}

// ---------------------------------------------------------------------------
// Map validation. Only the fields ShareablePuzzle ever carries are checked;
// optional mechanics are validated when present and otherwise ignored.

function parseMap(value: unknown): MapConfig | null {
  if (!value || typeof value !== 'object') return null
  const m = value as Record<string, unknown>
  if (!isInteger(m.rows) || (m.rows as number) < 1) return null
  if (!isInteger(m.cols) || (m.cols as number) < 1) return null
  const rows = m.rows as number
  const cols = m.cols as number
  if (!isPosition(m.start, rows, cols) || !isPosition(m.goal, rows, cols)) return null

  const map: MapConfig = {
    rows,
    cols,
    start: m.start as Position,
    goal: m.goal as Position,
  }

  if (m.obstacles !== undefined) {
    if (!Array.isArray(m.obstacles)) return null
    const obstacles: Position[] = []
    for (const o of m.obstacles) {
      if (!isPosition(o, rows, cols)) return null
      obstacles.push(o as Position)
    }
    map.obstacles = obstacles
  }

  if (m.checkpoints !== undefined) {
    if (!Array.isArray(m.checkpoints)) return null
    const checkpoints: Position[] = []
    for (const c of m.checkpoints) {
      if (!isPosition(c, rows, cols)) return null
      checkpoints.push(c as Position)
    }
    map.checkpoints = checkpoints
  }

  if (m.bridge !== undefined) {
    if (!m.bridge || typeof m.bridge !== 'object') return null
    const b = m.bridge as Record<string, unknown>
    if (!isInteger(b.row) || !isInteger(b.col) || typeof b.open !== 'boolean') return null
    if (!(b.row >= 0 && b.row < rows && b.col >= 0 && b.col < cols)) return null
    map.bridge = { row: b.row as number, col: b.col as number, open: b.open as boolean }
  }

  if (m.teleports !== undefined) {
    if (!Array.isArray(m.teleports)) return null
    const teleports = []
    for (const t of m.teleports) {
      if (!t || typeof t !== 'object') return null
      const tp = t as Record<string, unknown>
      if (!isPosition(tp.a, rows, cols) || !isPosition(tp.b, rows, cols)) return null
      teleports.push({ a: tp.a as Position, b: tp.b as Position })
    }
    map.teleports = teleports
  }

  if (m.tasks !== undefined) {
    if (!Array.isArray(m.tasks)) return null
    const tasks = []
    for (const task of m.tasks) {
      if (!task || typeof task !== 'object') return null
      const tk = task as Record<string, unknown>
      if (!isPosition(tk.from, rows, cols) || !isPosition(tk.to, rows, cols)) return null
      const label = tk.label === undefined ? undefined : typeof tk.label === 'string' ? tk.label : null
      if (label === null) return null
      tasks.push({ from: tk.from as Position, to: tk.to as Position, label })
    }
    map.tasks = tasks
  }

  if (m.gates !== undefined) {
    if (!Array.isArray(m.gates)) return null
    const gates = []
    for (const g of m.gates) {
      if (!g || typeof g !== 'object') return null
      const gp = g as Record<string, unknown>
      if (typeof gp.id !== 'string' || !isPosition(gp.at, rows, cols) || typeof gp.open !== 'boolean') return null
      gates.push({ id: gp.id, at: gp.at as Position, open: gp.open as boolean })
    }
    map.gates = gates
  }

  if (m.plates !== undefined) {
    if (!Array.isArray(m.plates)) return null
    const plates = []
    for (const pl of m.plates) {
      if (!pl || typeof pl !== 'object') return null
      const pp = pl as Record<string, unknown>
      if (!isPosition(pp.at, rows, cols)) return null
      if (typeof pp.gateId !== 'string') return null
      if (pp.mode !== 'toggle' && pp.mode !== 'open') return null
      plates.push({ at: pp.at as Position, gateId: pp.gateId, mode: pp.mode })
    }
    map.plates = plates
  }

  for (const key of ['ice', 'keys', 'doors'] as const) {
    if (m[key] !== undefined) {
      if (!Array.isArray(m[key])) return null
      const list: Position[] = []
      for (const p of m[key] as unknown[]) {
        if (!isPosition(p, rows, cols)) return null
        list.push(p as Position)
      }
      ;(map as Record<string, unknown>)[key] = list
    }
  }

  if (m.counterTiles !== undefined) {
    if (!Array.isArray(m.counterTiles)) return null
    const list = []
    for (const ct of m.counterTiles) {
      if (!ct || typeof ct !== 'object') return null
      const c = ct as Record<string, unknown>
      if (!isPosition(c.at, rows, cols)) return null
      const bonus = c.bonus === undefined ? undefined : isInteger(c.bonus) ? (c.bonus as number) : null
      if (bonus === null) return null
      list.push({ at: c.at as Position, ...(bonus !== undefined ? { bonus } : {}) })
    }
    map.counterTiles = list
  }

  if (m.numberTiles !== undefined) {
    if (!Array.isArray(m.numberTiles)) return null
    const list = []
    for (const nt of m.numberTiles) {
      if (!nt || typeof nt !== 'object') return null
      const n = nt as Record<string, unknown>
      if (!isPosition(n.at, rows, cols) || !isInteger(n.value)) return null
      list.push({ at: n.at as Position, value: n.value as number })
    }
    map.numberTiles = list
  }

  if (m.targetValue !== undefined) {
    if (!isInteger(m.targetValue)) return null
    map.targetValue = m.targetValue as number
  }

  if (m.binarySearch !== undefined) {
    if (typeof m.binarySearch !== 'boolean') return null
    map.binarySearch = m.binarySearch
  }

  return map
}

// ---------------------------------------------------------------------------
// ShareablePuzzle validation. Returns a normalized puzzle or null.

function validatePuzzleShape(data: unknown): ShareablePuzzle | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>

  const map = parseMap(d.map)
  if (!map) return null

  if (!Array.isArray(d.availableCommands)) return null
  const availableCommands: Command[] = []
  for (const c of d.availableCommands) {
    if (!isCommand(c)) return null
    availableCommands.push(c)
  }
  if (availableCommands.length === 0) return null

  let availableActions: Action[] | undefined
  if (d.availableActions !== undefined) {
    if (!Array.isArray(d.availableActions)) return null
    availableActions = []
    for (const a of d.availableActions) {
      if (!isActionString(a)) return null
      availableActions.push(a)
    }
  }

  let blocks: BlockKind[] | undefined
  if (d.blocks !== undefined) {
    if (!Array.isArray(d.blocks)) return null
    blocks = []
    for (const b of d.blocks) {
      if (!isBlockKind(b)) return null
      blocks.push(b)
    }
  }

  let predicateOptions: PredicateOption[] | undefined
  if (d.predicateOptions !== undefined) {
    if (!Array.isArray(d.predicateOptions)) return null
    predicateOptions = []
    for (const opt of d.predicateOptions) {
      const parsed = parsePredicateOption(opt)
      if (!parsed) return null
      predicateOptions.push(parsed)
    }
  }

  let loopRange: { min: number; max: number } | undefined
  if (d.loopRange !== undefined) {
    if (!d.loopRange || typeof d.loopRange !== 'object') return null
    const lr = d.loopRange as Record<string, unknown>
    if (!isInteger(lr.min) || !isInteger(lr.max) || (lr.min as number) < 0 || (lr.min as number) > (lr.max as number)) return null
    loopRange = { min: lr.min as number, max: lr.max as number }
  }

  const cardLimits = parseCardLimits(d.cardLimits)
  if (cardLimits === null) return null

  const solution = parseInstructionList(d.solution)
  if (!solution) return null

  // Every step in the solution must be offered in the palette — a shared puzzle
  // should be solvable with the cards it advertises.
  const allowedSteps = new Set<string>([...availableCommands, ...(availableActions ?? [])])
  const stepOk = (inst: Instruction[]): boolean =>
    inst.every((i) => {
      if (typeof i === 'string') return allowedSteps.has(i)
      if (i.kind === 'loop') return stepOk(i.body)
      if (i.kind === 'while') return stepOk(i.body)
      return stepOk(i.then) && stepOk(i.else)
    })
  if (!stepOk(solution)) return null

  const goal = d.goal === undefined ? undefined : typeof d.goal === 'string' ? d.goal : null
  if (goal === null) return null
  const prompt = d.prompt === undefined ? undefined : typeof d.prompt === 'string' ? d.prompt : null
  if (prompt === null) return null

  let feedback: StepFeedback | undefined
  if (d.feedback !== undefined) {
    if (!d.feedback || typeof d.feedback !== 'object') return null
    const f = d.feedback as Record<string, unknown>
    if (typeof f.correct !== 'string') return null
    if (!isStringArray(f.hints)) return null
    feedback = { correct: f.correct, hints: f.hints }
  }

  const puzzle: ShareablePuzzle = {
    map,
    availableCommands,
    solution,
  }
  if (availableActions) puzzle.availableActions = availableActions
  if (blocks) puzzle.blocks = blocks
  if (predicateOptions) puzzle.predicateOptions = predicateOptions
  if (loopRange) puzzle.loopRange = loopRange
  if (cardLimits) puzzle.cardLimits = cardLimits
  if (goal !== undefined) puzzle.goal = goal
  if (prompt !== undefined) puzzle.prompt = prompt
  if (feedback) puzzle.feedback = feedback
  return puzzle
}

// ---------------------------------------------------------------------------
// Public codec.

export function encodePuzzle(p: ShareablePuzzle): string {
  // Drop undefined fields so the payload stays minimal. We do NOT encode
  // optimal/difficulty/concept/aiGenerated — the page recomputes those.
  const payload: Record<string, unknown> = {
    map: p.map,
    availableCommands: p.availableCommands,
    solution: p.solution,
  }
  if (p.availableActions) payload.availableActions = p.availableActions
  if (p.blocks) payload.blocks = p.blocks
  if (p.predicateOptions) payload.predicateOptions = p.predicateOptions
  if (p.loopRange) payload.loopRange = p.loopRange
  if (p.cardLimits) payload.cardLimits = p.cardLimits
  if (p.goal !== undefined) payload.goal = p.goal
  if (p.prompt !== undefined) payload.prompt = p.prompt
  if (p.feedback) payload.feedback = p.feedback

  const json = JSON.stringify(payload)
  return `${PREFIX}${toBase64Url(json)}`
}

export function decodePuzzle(code: string): ShareablePuzzle | null {
  if (typeof code !== 'string') return null
  if (!code.startsWith(PREFIX)) return null
  const body = code.slice(PREFIX.length)
  const json = fromBase64Url(body)
  if (json === null) return null

  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }

  let puzzle: ShareablePuzzle | null = null
  try {
    puzzle = validatePuzzleShape(data)
  } catch {
    return null
  }
  if (!puzzle) return null

  // Replay the solution through the engine — a share code must never show a
  // puzzle whose verified solution does not actually reach the goal.
  try {
    const result = runInstructions(puzzle.map, puzzle.solution)
    if (result.status !== 'success') return null
  } catch {
    return null
  }

  return puzzle
}
