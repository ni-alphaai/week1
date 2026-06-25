import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { Action, Command, Predicate, PredicateOption } from '../types'
import { ArrowIcon, CompassIcon, DropIcon, PickupIcon } from './icons'
import { playSound } from '../lib/sound'

export type { PredicateOption }

// The composable program is a tree of nodes. Loops/whiles/ifs hold child nodes
// the learner drags in (Scratch-style), so blocks can nest arbitrarily.
// `locked` nodes come from `initialProgram` — they cannot be dragged back to the
// palette or removed. Their child slots remain open so learners fill them in.
export type ProgramNode =
  | { id: string; locked?: boolean; kind: 'move'; command: Command }
  | { id: string; locked?: boolean; kind: 'action'; action: Action }
  | { id: string; locked?: boolean; kind: 'loop'; count: number; body: ProgramNode[] }
  | { id: string; locked?: boolean; kind: 'while'; predicate: Predicate; predicateLabel: string; body: ProgramNode[] }
  | {
      id: string
      locked?: boolean
      kind: 'if'
      predicate: Predicate
      predicateLabel: string
      then: ProgramNode[]
      else: ProgramNode[]
    }

// Palette stamps. Containers are empty templates that clone a fresh node on drop.
// `limit` caps how many of this card may be placed (undefined = unlimited).
export type PaletteItem =
  | { key: string; kind: 'move'; command: Command; limit?: number }
  | { key: string; kind: 'action'; action: Action; limit?: number }
  | { key: string; kind: 'loop'; limit?: number }
  | { key: string; kind: 'while'; limit?: number }
  | { key: string; kind: 'if'; limit?: number }

const LABEL: Record<Command, string> = { up: 'Up', down: 'Down', left: 'Left', right: 'Right' }
const ACTION_LABEL: Record<Action, string> = {
  pickup: 'Pick up',
  drop: 'Drop',
  toMiddle: 'Go to middle',
  discardLower: 'Discard lower half',
  discardUpper: 'Discard upper half',
}
const DRAG_THRESHOLD_PX = 6

type Slot = 'body' | 'then' | 'else'
interface Seg {
  id: string
  slot: Slot
}
type NodePath = Seg[]

function pathKey(path: NodePath): string {
  return path.map((seg) => `${seg.id}:${seg.slot}`).join('/')
}

let nodeCounter = 0
function freshId(): string {
  nodeCounter += 1
  return `n${nodeCounter}-${Math.random().toString(36).slice(2, 7)}`
}

// ---- immutable tree helpers ----

function cloneTree(nodes: ProgramNode[]): ProgramNode[] {
  return JSON.parse(JSON.stringify(nodes)) as ProgramNode[]
}

function childListOf(node: ProgramNode, slot: Slot): ProgramNode[] | null {
  if (node.kind === 'loop' && slot === 'body') return node.body
  if (node.kind === 'while' && slot === 'body') return node.body
  if (node.kind === 'if' && slot === 'then') return node.then
  if (node.kind === 'if' && slot === 'else') return node.else
  return null
}

function getListAt(root: ProgramNode[], path: NodePath): ProgramNode[] | null {
  let list: ProgramNode[] = root
  for (const seg of path) {
    const node = list.find((n) => n.id === seg.id)
    if (!node) return null
    const child = childListOf(node, seg.slot)
    if (!child) return null
    list = child
  }
  return list
}

function findById(nodes: ProgramNode[], id: string): ProgramNode | null {
  for (const node of nodes) {
    if (node.id === id) return node
    if (node.kind === 'loop' || node.kind === 'while') {
      const hit = findById(node.body, id)
      if (hit) return hit
    } else if (node.kind === 'if') {
      const hit = findById(node.then, id) ?? findById(node.else, id)
      if (hit) return hit
    }
  }
  return null
}

// Removes a node anywhere in the (mutable) tree, returning it.
// Locked nodes (from initialProgram) cannot be removed.
function spliceById(nodes: ProgramNode[], id: string): ProgramNode | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (node.id === id) {
      if (node.locked) return null
      nodes.splice(i, 1)
      return node
    }
    const lists: ProgramNode[][] =
      node.kind === 'loop' || node.kind === 'while'
        ? [node.body]
        : node.kind === 'if'
          ? [node.then, node.else]
          : []
    for (const list of lists) {
      const hit = spliceById(list, id)
      if (hit) return hit
    }
  }
  return null
}

function insertNodeAt(root: ProgramNode[], path: NodePath, index: number, node: ProgramNode): ProgramNode[] {
  const next = cloneTree(root)
  const list = getListAt(next, path)
  if (!list) return root
  list.splice(Math.max(0, Math.min(index, list.length)), 0, node)
  return next
}

function deleteNode(root: ProgramNode[], id: string): ProgramNode[] {
  const next = cloneTree(root)
  spliceById(next, id)
  return next
}

// `targetIndex` is expressed in coordinates of the list *after* the dragged
// node has been removed (computeTarget skips the dragged node), so no extra
// adjustment is needed once we splice it out below.
function moveNode(root: ProgramNode[], id: string, targetPath: NodePath, targetIndex: number): ProgramNode[] {
  const next = cloneTree(root)
  const node = spliceById(next, id)
  if (!node) return root
  const list = getListAt(next, targetPath)
  if (!list) return root
  list.splice(Math.max(0, Math.min(targetIndex, list.length)), 0, node)
  return next
}

function updateNode(root: ProgramNode[], id: string, patch: (node: ProgramNode) => void): ProgramNode[] {
  const next = cloneTree(root)
  const node = findById(next, id)
  if (node) patch(node)
  return next
}

// Does this placed node correspond to the given palette stamp?
function matchesItem(node: ProgramNode, item: PaletteItem): boolean {
  if (item.kind === 'move') return node.kind === 'move' && node.command === item.command
  if (item.kind === 'action') return node.kind === 'action' && node.action === item.action
  return node.kind === item.kind
}

// How many copies of a palette stamp are currently placed anywhere in the tree.
function countUsage(nodes: ProgramNode[], item: PaletteItem): number {
  let count = 0
  for (const node of nodes) {
    if (matchesItem(node, item)) count += 1
    if (node.kind === 'loop' || node.kind === 'while') count += countUsage(node.body, item)
    else if (node.kind === 'if') count += countUsage(node.then, item) + countUsage(node.else, item)
  }
  return count
}

// ---- component ----

interface CommandSequenceProps {
  palette: PaletteItem[]
  program: ProgramNode[]
  disabled?: boolean
  loopRange?: { min: number; max: number }
  predicateOptions?: PredicateOption[]
  onChange: (next: ProgramNode[]) => void
}

interface PaletteSession {
  kind: 'palette'
  item: PaletteItem
  pointerId: number
  startX: number
  startY: number
  active: boolean
}
interface TreeSession {
  kind: 'tree'
  nodeId: string
  pointerId: number
  startX: number
  startY: number
  active: boolean
}
type DragSession = PaletteSession | TreeSession

type DropTarget = { path: NodePath; index: number } | 'remove' | null

interface GhostState {
  x: number
  y: number
  label: string
  tone: string
}

function MoveLabel({ command }: { command: Command }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text)]">
      <ArrowIcon command={command} className="h-4 w-4 text-accent" />
      {LABEL[command]}
    </span>
  )
}

function ActionIcon({ action, className }: { action: Action; className?: string }) {
  switch (action) {
    case 'pickup':
      return <PickupIcon className={className} />
    case 'drop':
      return <DropIcon className={className} />
    case 'toMiddle':
      return <CompassIcon className={className} />
    case 'discardLower':
      return <ArrowIcon command="right" className={className} />
    case 'discardUpper':
      return <ArrowIcon command="left" className={className} />
  }
}

function ActionLabel({ action }: { action: Action }) {
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text)]">
      <ActionIcon action={action} className="h-4 w-4 text-[var(--color-task)]" />
      {ACTION_LABEL[action]}
    </span>
  )
}

function paletteToneClass(kind: PaletteItem['kind'] | ProgramNode['kind']): string {
  switch (kind) {
    case 'move':
      return 'cmd-card-move'
    case 'action':
      return 'cmd-card-action'
    case 'loop':
      return 'cmd-card-loop'
    case 'while':
      return 'cmd-card-while'
    default:
      return 'cmd-card-cond'
  }
}

function itemLabel(item: PaletteItem): string {
  switch (item.kind) {
    case 'move':
      return LABEL[item.command]
    case 'action':
      return ACTION_LABEL[item.action]
    case 'loop':
      return 'Repeat'
    case 'while':
      return 'While'
    default:
      return 'If / else'
  }
}

export function CommandSequence({
  palette,
  program,
  disabled = false,
  loopRange = { min: 1, max: 9 },
  predicateOptions = [],
  onChange,
}: CommandSequenceProps) {
  const [ghost, setGhost] = useState<GhostState | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const sessionRef = useRef<DragSession | null>(null)
  const programRef = useRef(program)
  const disabledRef = useRef(disabled)
  const dropTargetRef = useRef<DropTarget>(null)
  const zoneRefs = useRef<Map<string, { el: HTMLElement; path: NodePath }>>(new Map())
  const nodeRefs = useRef<Map<string, HTMLElement>>(new Map())
  const paletteAreaRef = useRef<HTMLDivElement>(null)

  programRef.current = program
  disabledRef.current = disabled

  const setTarget = useCallback((t: DropTarget) => {
    dropTargetRef.current = t
    setDropTarget(t)
  }, [])

  const clearDrag = useCallback(() => {
    sessionRef.current = null
    setGhost(null)
    setDraggingId(null)
    setTarget(null)
  }, [setTarget])

  const defaultPredicate = (): PredicateOption =>
    predicateOptions[0] ?? { predicate: { sensor: 'clear', dir: 'right' }, label: 'Right is clear' }

  const defaultCount = (): number => Math.min(Math.max(2, loopRange.min), loopRange.max)

  const makeNode = useCallback(
    (item: PaletteItem): ProgramNode => {
      const id = freshId()
      if (item.kind === 'move') return { id, kind: 'move', command: item.command }
      if (item.kind === 'action') return { id, kind: 'action', action: item.action }
      if (item.kind === 'loop') return { id, kind: 'loop', count: defaultCount(), body: [] }
      const opt = defaultPredicate()
      if (item.kind === 'while')
        return { id, kind: 'while', predicate: opt.predicate, predicateLabel: opt.label, body: [] }
      return { id, kind: 'if', predicate: opt.predicate, predicateLabel: opt.label, then: [], else: [] }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loopRange.min, loopRange.max, predicateOptions],
  )

  const insertIndexInZone = useCallback((path: NodePath, clientY: number, skipId?: string): number => {
    const list = getListAt(programRef.current, path) ?? []
    let index = 0
    for (let i = 0; i < list.length; i++) {
      // The card being dragged still occupies layout; ignore it so the drop
      // index reflects where the card will actually land.
      if (list[i].id === skipId) continue
      const el = nodeRefs.current.get(list[i].id)
      if (!el) {
        index += 1
        continue
      }
      const rect = el.getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) return index
      index += 1
    }
    return index
  }, [])

  const computeTarget = useCallback(
    (clientX: number, clientY: number, session: DragSession): DropTarget => {
      const paletteEl = paletteAreaRef.current
      if (paletteEl) {
        const r = paletteEl.getBoundingClientRect()
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
          return 'remove'
        }
      }
      const skipId = session.kind === 'tree' ? session.nodeId : undefined
      let best: { path: NodePath; depth: number } | null = null
      for (const { el, path } of zoneRefs.current.values()) {
        if (session.kind === 'tree' && path.some((seg) => seg.id === session.nodeId)) continue
        const rect = el.getBoundingClientRect()
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
          if (!best || path.length > best.depth) best = { path, depth: path.length }
        }
      }
      if (!best) return null
      return { path: best.path, index: insertIndexInZone(best.path, clientY, skipId) }
    },
    [insertIndexInZone],
  )

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const session = sessionRef.current
      if (!session || session.pointerId !== event.pointerId || disabledRef.current) return
      if (!session.active) {
        const dx = event.clientX - session.startX
        const dy = event.clientY - session.startY
        if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return
        session.active = true
        setDraggingId(session.kind === 'tree' ? session.nodeId : `palette:${session.item.key}`)
        playSound('pick')
      }
      const label = session.kind === 'palette' ? itemLabel(session.item) : labelForNode(programRef.current, session.nodeId)
      const tone =
        session.kind === 'palette'
          ? paletteToneClass(session.item.kind)
          : paletteToneClass(findById(programRef.current, session.nodeId)?.kind ?? 'move')
      setGhost({ x: event.clientX, y: event.clientY, label, tone })
      setTarget(computeTarget(event.clientX, event.clientY, session))
    }

    function onUp(event: PointerEvent) {
      const session = sessionRef.current
      if (!session || session.pointerId !== event.pointerId || disabledRef.current) return
      const target = dropTargetRef.current

      if (session.kind === 'palette') {
        if (session.active) {
          if (target && target !== 'remove') {
            playSound('place')
            onChange(insertNodeAt(programRef.current, target.path, target.index, makeNode(session.item)))
          }
        } else {
          playSound('place')
          onChange(insertNodeAt(programRef.current, [], programRef.current.length, makeNode(session.item)))
        }
      } else if (session.active) {
        if (target === 'remove' || target === null) {
          playSound('remove')
          onChange(deleteNode(programRef.current, session.nodeId))
        } else {
          playSound('place')
          onChange(moveNode(programRef.current, session.nodeId, target.path, target.index))
        }
      }
      clearDrag()
    }

    function onCancel(event: PointerEvent) {
      if (sessionRef.current?.pointerId === event.pointerId) clearDrag()
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [clearDrag, computeTarget, makeNode, onChange, setTarget])

  // How many more copies of this stamp may be placed (Infinity = unlimited).
  const remainingFor = (item: PaletteItem): number =>
    item.limit === undefined ? Number.POSITIVE_INFINITY : Math.max(0, item.limit - countUsage(program, item))

  function startPalette(event: ReactPointerEvent, item: PaletteItem) {
    if (disabled || remainingFor(item) <= 0) return
    event.preventDefault()
    sessionRef.current = {
      kind: 'palette',
      item,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    }
  }

  function startTree(event: ReactPointerEvent, nodeId: string) {
    if (disabled) return
    if (findById(program, nodeId)?.locked) return
    event.preventDefault()
    event.stopPropagation()
    sessionRef.current = {
      kind: 'tree',
      nodeId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      active: false,
    }
  }

  function registerZone(key: string, value: { el: HTMLElement; path: NodePath } | null) {
    if (value) zoneRefs.current.set(key, value)
    else zoneRefs.current.delete(key)
  }

  function setCount(id: string, value: number) {
    onChange(
      updateNode(program, id, (node) => {
        if (node.kind === 'loop') node.count = Math.max(loopRange.min, Math.min(loopRange.max, value))
      }),
    )
  }

  function setPredicate(id: string, optionIndex: number) {
    const opt = predicateOptions[optionIndex]
    if (!opt) return
    onChange(
      updateNode(program, id, (node) => {
        if (node.kind === 'while' || node.kind === 'if') {
          node.predicate = opt.predicate
          node.predicateLabel = opt.label
        }
      }),
    )
  }

  function removeNode(id: string) {
    playSound('remove')
    onChange(deleteNode(program, id))
  }

  // ---- rendering ----

  function renderDropLine() {
    return <div className="cmd-drop-line h-1 rounded-full shadow-sm" aria-hidden="true" />
  }

  function renderZone(path: NodePath, nodes: ProgramNode[], slotLabel: string | null, emptyHint: string) {
    const key = pathKey(path)
    const active = dropTarget && dropTarget !== 'remove' && pathKey(dropTarget.path) === key
    return (
      <div
        ref={(el) => registerZone(key, el ? { el, path } : null)}
        className={`block-zone ${active ? 'block-zone--active' : ''}`}
      >
        {slotLabel && <span className="block-zone__label">{slotLabel}</span>}
        {nodes.length === 0 && (
          <span className="block-zone__empty">{active ? 'Drop here' : emptyHint}</span>
        )}
        {nodes.map((node, index) => (
          <div key={node.id} className="relative">
            {active && (dropTarget as { index: number }).index === index && renderDropLine()}
            {renderBlock(node, path)}
          </div>
        ))}
        {active && (dropTarget as { index: number }).index === nodes.length && nodes.length > 0 && renderDropLine()}
      </div>
    )
  }

  function predicatePicker(node: Extract<ProgramNode, { kind: 'while' | 'if' }>) {
    if (predicateOptions.length <= 1 || node.locked) {
      return <span className="block-cond">{node.predicateLabel}</span>
    }
    const current = predicateOptions.findIndex((opt) => opt.label === node.predicateLabel)
    return (
      <select
        className="block-select cursor-pointer disabled:cursor-not-allowed"
        value={current < 0 ? 0 : current}
        disabled={disabled}
        onChange={(event) => setPredicate(node.id, Number(event.target.value))}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {predicateOptions.map((opt, index) => (
          <option key={opt.label} value={index}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  }

  function DragHandle({ locked = false }: { locked?: boolean }) {
    return (
      <span
        className={`cmd-handle flex h-7 w-6 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
          locked ? 'cursor-not-allowed opacity-50' : ''
        }`}
        aria-hidden="true"
      >
        {locked ? '⊟' : '⠿'}
      </span>
    )
  }

  function removeButton(nodeId: string) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => removeNode(nodeId)}
        onPointerDown={(event) => event.stopPropagation()}
        className="ml-auto flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-[var(--color-danger-soft)] hover:text-[var(--color-danger)] disabled:opacity-40"
        aria-label="Remove block"
      >
        ×
      </button>
    )
  }

  function renderBlock(node: ProgramNode, parentPath: NodePath) {
    const dim = draggingId === node.id ? 'opacity-40' : ''
    const setRef = (el: HTMLElement | null) => {
      if (el) nodeRefs.current.set(node.id, el)
      else nodeRefs.current.delete(node.id)
    }

    if (node.kind === 'move' || node.kind === 'action') {
      return (
        <div
          ref={setRef}
          onPointerDown={(event) => startTree(event, node.id)}
          className={`block-leaf ${node.locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'} touch-none ${paletteToneClass(node.kind)} ${node.locked ? 'block-leaf--locked' : ''} ${dim}`}
        >
          <DragHandle locked={node.locked} />
          {node.kind === 'move' ? <MoveLabel command={node.command} /> : <ActionLabel action={node.action} />}
          {!node.locked && removeButton(node.id)}
        </div>
      )
    }

    if (node.kind === 'loop') {
      return (
        <div ref={setRef} className={`block-container cmd-card-loop ${node.locked ? 'block-container--locked' : ''} ${dim}`}>
          <div
            className={`block-header ${node.locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'} touch-none`}
            onPointerDown={(event) => startTree(event, node.id)}
          >
            {DragHandle({ locked: node.locked })}
            <span className="block-keyword">Repeat</span>
            <span className="block-stepper" onPointerDown={(event) => event.stopPropagation()}>
              <button type="button" className="cursor-pointer" disabled={disabled || node.count <= loopRange.min} onClick={() => setCount(node.id, node.count - 1)} aria-label="Fewer repeats">
                −
              </button>
              <span className="block-stepper__value">{node.count}</span>
              <button type="button" className="cursor-pointer" disabled={disabled || node.count >= loopRange.max} onClick={() => setCount(node.id, node.count + 1)} aria-label="More repeats">
                +
              </button>
            </span>
            <span className="block-keyword">times</span>
            {!node.locked && removeButton(node.id)}
          </div>
          {renderZone([...parentPath, { id: node.id, slot: 'body' }], node.body, null, 'Drag cards to repeat')}
        </div>
      )
    }

    if (node.kind === 'while') {
      return (
        <div ref={setRef} className={`block-container cmd-card-while ${node.locked ? 'block-container--locked' : ''} ${dim}`}>
          <div
            className={`block-header ${node.locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'} touch-none`}
            onPointerDown={(event) => startTree(event, node.id)}
          >
            {DragHandle({ locked: node.locked })}
            <span className="block-keyword">While</span>
            {predicatePicker(node)}
            <span className="block-keyword">do</span>
            {!node.locked && removeButton(node.id)}
          </div>
          {renderZone([...parentPath, { id: node.id, slot: 'body' }], node.body, null, 'Drag cards to repeat')}
        </div>
      )
    }

    return (
      <div ref={setRef} className={`block-container cmd-card-cond ${node.locked ? 'block-container--locked' : ''} ${dim}`}>
        <div
          className={`block-header ${node.locked ? 'cursor-not-allowed' : 'cursor-grab active:cursor-grabbing'} touch-none`}
          onPointerDown={(event) => startTree(event, node.id)}
        >
          {DragHandle({ locked: node.locked })}
          <span className="block-keyword">If</span>
          {predicatePicker(node)}
          {!node.locked && removeButton(node.id)}
        </div>
        {renderZone([...parentPath, { id: node.id, slot: 'then' }], node.then, 'then', 'Drag cards here')}
        {renderZone([...parentPath, { id: node.id, slot: 'else' }], node.else, 'else', 'Drag cards here')}
      </div>
    )
  }

  return (
    <>
      {ghost && (
        <div
          className="pointer-events-none fixed z-50 opacity-90"
          style={{ left: ghost.x, top: ghost.y, transform: 'translate(-50%, -50%) scale(1.04)' }}
          aria-hidden="true"
        >
          <div className={`rounded-lg border px-3 py-2 shadow-md ring-2 ring-[var(--color-accent)]/30 ${ghost.tone}`}>
            <span className="text-sm font-semibold text-[var(--color-text)]">{ghost.label}</span>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div>
          <h3 className="section-label mb-2">Cards</h3>
          <div
            ref={paletteAreaRef}
            className="palette-scroll flex max-h-56 min-h-16 flex-wrap gap-2 overflow-y-auto rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-panel)] p-3"
          >
            {palette.length === 0 && <span className="text-sm text-muted">No cards for this puzzle</span>}
            {palette.map((item) => {
              const remaining = remainingFor(item)
              const limited = item.limit !== undefined
              const exhausted = remaining <= 0
              const inactive = disabled || exhausted
              return (
                <div
                  key={item.key}
                  role="button"
                  tabIndex={inactive ? -1 : 0}
                  onPointerDown={(event) => startPalette(event, item)}
                  onKeyDown={(event) => {
                    if (inactive || (event.key !== 'Enter' && event.key !== ' ')) return
                    event.preventDefault()
                    playSound('place')
                    onChange(insertNodeAt(program, [], program.length, makeNode(item)))
                  }}
                  className={`palette-card animate-pop-in relative touch-none rounded-lg border px-3 py-2 transition select-none ${
                    exhausted
                      ? 'palette-card--exhausted cursor-not-allowed'
                      : 'cursor-grab active:cursor-grabbing'
                  } ${draggingId === `palette:${item.key}` ? 'opacity-30' : ''} ${paletteToneClass(item.kind)}`}
                  aria-disabled={inactive}
                >
                  {item.kind === 'move' && <MoveLabel command={item.command} />}
                  {item.kind === 'action' && <ActionLabel action={item.action} />}
                  {item.kind === 'loop' && <span className="text-sm font-semibold text-[var(--color-info)]">Repeat …× block</span>}
                  {item.kind === 'while' && <span className="text-sm font-semibold text-[var(--color-while)]">While … block</span>}
                  {item.kind === 'if' && <span className="text-sm font-semibold text-[var(--color-conditional)]">If / else block</span>}
                  {limited && (
                    <span className="palette-card__count" aria-label={`${remaining} left`}>
                      {remaining} left
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-muted">Drag a card back here to remove it. Pinned blocks (⊟) cannot be moved.</p>
        </div>

        <div>
          <h3 className="section-label mb-2">Your program</h3>
          <div className="program-scroll">{renderZone([], program, null, 'Tap or drag a card here')}</div>
        </div>
      </div>
    </>
  )
}

function labelForNode(nodes: ProgramNode[], id: string): string {
  const node = findById(nodes, id)
  if (!node) return 'block'
  if (node.kind === 'move') return LABEL[node.command]
  if (node.kind === 'action') return ACTION_LABEL[node.action]
  if (node.kind === 'loop') return 'Repeat'
  if (node.kind === 'while') return 'While'
  return 'If / else'
}
