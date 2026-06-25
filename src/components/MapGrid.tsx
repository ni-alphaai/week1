import type { Command, MapConfig, Position } from '../types'
import { samePos, initialGateStates } from '../engine/map'
import type { SearchWindow } from '../engine/map'
import {
  BridgeIcon,
  ChestIcon,
  CheckIcon,
  DoorIcon,
  FlagIcon,
  GateIcon,
  GemIcon,
  IceIcon,
  KeyIcon,
  PackageIcon,
  PlateIcon,
  RockIcon,
  TeleportIcon,
  WaterIcon,
} from './icons'

interface MapGridProps {
  map: MapConfig
  explorer: Position
  crashed?: boolean
  solved?: boolean
  facing?: Command
  activeTile?: Position | null
  /** How many checkpoints have been delivered so far (for run animation). */
  checkpointsDelivered?: number
  /** Fetch-and-carry progress: items picked up / dropped off so far. */
  taskPicked?: number
  taskDropped?: number
  /** Live gate open/closed state during a run (keyed by gate id). */
  gateState?: Record<string, boolean>
  /** How many keys have been collected so far (for run animation). */
  keysCollected?: number
  /** A translucent "ghost" path to demonstrate the solution. */
  ghostPath?: Position[] | null
  /** How many tiles of the ghost path have been revealed. */
  ghostStep?: number
  /** True for the single step where the explorer warps via a teleport pad. */
  isTeleporting?: boolean
  /** True for the step where the explorer departs from the source teleport pad. */
  isDeparting?: boolean
  /** Live binary-search window; number tiles outside it dim out as discarded. */
  searchWindow?: SearchWindow | null
}

const TOKEN_TILE_RATIO = 0.58

const EYE_SHIFT: Record<Command, { x: string; y: string }> = {
  up: { x: '0', y: '-18%' },
  down: { x: '0', y: '18%' },
  left: { x: '-22%', y: '0' },
  right: { x: '22%', y: '0' },
}

function Explorer({
  crashed,
  solved,
  facing,
  carrying,
}: {
  crashed: boolean
  solved: boolean
  facing: Command
  carrying: boolean
}) {
  const shift = EYE_SHIFT[facing]
  const tone = crashed ? 'explorer-token--crashed' : solved ? 'explorer-token--solved' : ''
  return (
    <div className="relative h-full w-full">
      {carrying && !crashed && (
        <span className="explorer-carry" aria-label="Carrying an item">
          <GemIcon className="h-full w-full text-[var(--color-task)]" />
        </span>
      )}
      <div className={`explorer-token absolute inset-0 rounded-full ${tone}`}>
        {crashed ? (
          <span className="absolute left-1/2 top-1/2 h-0.5 w-3/5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-full bg-white/90" />
        ) : (
          <span
            className="absolute left-1/2 top-1/2 flex h-1/3 w-1/2 -translate-x-1/2 -translate-y-1/2 items-center justify-between transition-transform duration-150"
            style={{ transform: `translate(calc(-50% + ${shift.x}), calc(-50% + ${shift.y}))` }}
          >
            <span className="h-1/2 w-1/4 rounded-full bg-white/90" />
            <span className="h-1/2 w-1/4 rounded-full bg-white/90" />
          </span>
        )}
        {crashed && (
          <span className="absolute left-1/2 top-1/2 h-0.5 w-3/5 -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded-full bg-white/90" />
        )}
      </div>
    </div>
  )
}

export function MapGrid({
  map,
  explorer,
  crashed = false,
  solved = false,
  facing = 'right',
  activeTile = null,
  checkpointsDelivered = 0,
  taskPicked = 0,
  taskDropped = 0,
  gateState,
  keysCollected = 0,
  ghostPath = null,
  ghostStep = 0,
  isTeleporting = false,
  isDeparting = false,
  searchWindow = null,
}: MapGridProps) {
  const checkpoints = map.checkpoints ?? []
  const tasks = map.tasks ?? []
  const teleports = map.teleports ?? []
  const gates = map.gates ?? []
  const plates = map.plates ?? []
  const ice = map.ice ?? []
  const keys = map.keys ?? []
  const doors = map.doors ?? []
  const counterTiles = map.counterTiles ?? []
  const numberTiles = map.numberTiles ?? []
  const isSearch = map.targetValue !== undefined
  const liveGates = gateState ?? initialGateStates(map)
  const carrying = taskPicked > taskDropped
  const tiles = []
  for (let row = 0; row < map.rows; row++) {
    for (let col = 0; col < map.cols; col++) {
      const pos: Position = { row, col }
      const isRock = (map.obstacles ?? []).some((o) => samePos(o, pos))
      const isGoal = samePos(map.goal, pos)
      const isStart = samePos(map.start, pos)
      const checkpointIndex = checkpoints.findIndex((checkpoint) => samePos(checkpoint, pos))
      const isCheckpoint = checkpointIndex >= 0
      const pickupIndex = tasks.findIndex((task) => samePos(task.from, pos))
      const dropIndex = tasks.findIndex((task) => samePos(task.to, pos))
      const isPickup = pickupIndex >= 0
      const isDrop = dropIndex >= 0
      const isBridge = map.bridge ? samePos(map.bridge, pos) : false
      const isActive = activeTile ? samePos(activeTile, pos) : false

      const teleportIndex = teleports.findIndex((t) => samePos(t.a, pos) || samePos(t.b, pos))
      const gate = gates.find((g) => samePos(g.at, pos))
      const isPlate = plates.some((p) => samePos(p.at, pos))
      const isIce = ice.some((tile) => samePos(tile, pos))
      const keyIndex = keys.findIndex((k) => samePos(k, pos))
      const isKey = keyIndex >= 0
      const isDoor = doors.some((d) => samePos(d, pos))
      const counterIndex = counterTiles.findIndex((c) => samePos(c.at, pos))
      const isCounter = counterIndex >= 0
      const counterBonus = isCounter ? counterTiles[counterIndex].bonus ?? 1 : 0
      const numberIndex = numberTiles.findIndex((t) => samePos(t.at, pos))
      const isNumber = numberIndex >= 0
      // In a search puzzle the target tile is hidden, so it renders like a plain
      // number tile rather than a visible chest.
      const goalVisible = isGoal && !isSearch
      const gateOpen = gate ? liveGates[gate.id] ?? gate.open : false

      let tileClass = 'map-tile map-tile--field'
      let content: React.ReactNode = null

      if (isRock) {
        tileClass = 'map-tile map-tile--rock'
        content = <RockIcon className="h-2/3 w-2/3 text-soft" />
      } else if (isBridge) {
        tileClass = map.bridge?.open
          ? 'map-tile map-tile--bridge-open'
          : 'map-tile map-tile--bridge-closed animate-water-ripple'
        content = map.bridge?.open ? (
          <BridgeIcon className="h-2/3 w-2/3 text-[var(--color-accent)]" />
        ) : (
          <WaterIcon className="h-2/3 w-2/3 text-[var(--color-info)]" />
        )
      } else if (gate) {
        tileClass = gateOpen ? 'map-tile map-tile--gate-open' : 'map-tile map-tile--gate-closed'
        content = (
          <GateIcon
            open={gateOpen}
            className={`h-2/3 w-2/3 ${gateOpen ? 'text-[var(--color-accent)]' : 'text-[var(--color-danger)]'}`}
          />
        )
      } else if (isDoor) {
        tileClass = 'map-tile map-tile--door'
        content = <DoorIcon className="h-3/5 w-3/5 text-[var(--color-while)]" />
      } else if (goalVisible) {
        tileClass = 'map-tile map-tile--goal'
      } else if (isNumber) {
        const eliminated =
          searchWindow !== null && (pos.col < searchWindow.lo || pos.col > searchWindow.hi)
        tileClass = `map-tile map-tile--number${eliminated ? ' map-tile--eliminated' : ''}`
      } else if (isCheckpoint) {
        tileClass =
          checkpointIndex < checkpointsDelivered
            ? 'map-tile map-tile--checkpoint map-tile--checkpoint-done'
            : 'map-tile map-tile--checkpoint'
      } else if (isPickup) {
        tileClass =
          pickupIndex < taskPicked
            ? 'map-tile map-tile--pickup map-tile--task-done'
            : 'map-tile map-tile--pickup'
      } else if (isDrop) {
        tileClass =
          dropIndex < taskDropped
            ? 'map-tile map-tile--drop map-tile--task-done'
            : 'map-tile map-tile--drop'
      } else if (teleportIndex >= 0) {
        tileClass = 'map-tile map-tile--teleport'
        content = <TeleportIcon className="h-2/3 w-2/3 text-[var(--color-while)]" />
      } else if (isPlate) {
        tileClass = 'map-tile map-tile--plate'
        content = <PlateIcon className="h-2/3 w-2/3 text-[var(--color-info)]" />
      } else if (isIce) {
        tileClass = 'map-tile map-tile--ice'
        content = <IceIcon className="h-2/3 w-2/3 text-[var(--color-info)]" />
      } else if (isKey) {
        tileClass = 'map-tile map-tile--key'
      } else if (isCounter) {
        tileClass = 'map-tile map-tile--counter'
      }

      // The explorer's live tile drives two flashes during playback: a warp
      // flash on the teleport pad it just arrived on, and a counter pop when it
      // lands on a counter tile.
      const teleportFlash = isTeleporting && teleportIndex >= 0 && samePos(pos, explorer)
      const teleportDepart = isDeparting && samePos(pos, explorer)
      const counterHit = isCounter && activeTile != null && samePos(pos, activeTile)
      const stateClasses = [
        isActive ? 'animate-tile-glow z-10' : '',
        teleportFlash ? 'map-tile--teleport-active map-tile--teleport-arriving' : '',
        teleportDepart ? 'map-tile--teleport-depart-flash' : '',
        counterHit ? 'map-tile--counter-hit' : '',
      ]
        .filter(Boolean)
        .join(' ')

      tiles.push(
        <div
          key={`${row}-${col}`}
          className={`${tileClass} ${stateClasses}`}
        >
          {goalVisible && (
            <ChestIcon
              className={`h-3/4 w-3/4 text-[var(--color-goal)] ${solved ? 'animate-goal-pop' : 'animate-pulse-goal'}`}
            />
          )}
          {isNumber && (
            <span className="map-number" aria-label={`Number ${numberTiles[numberIndex].value}`}>
              {numberTiles[numberIndex].value}
            </span>
          )}
          {isCheckpoint && (
            <div className="map-checkpoint" aria-label={`Delivery stop ${checkpointIndex + 1}`}>
              {checkpointIndex < checkpointsDelivered ? (
                <CheckIcon className="h-3/5 w-3/5" />
              ) : (
                <>
                  <PackageIcon className="h-3/5 w-3/5" />
                  <span className="map-checkpoint__num">{checkpointIndex + 1}</span>
                </>
              )}
            </div>
          )}
          {isPickup && !isCheckpoint && (
            <div className="map-task" aria-label={`Pick up item ${pickupIndex + 1}`}>
              {pickupIndex < taskPicked ? (
                <span className="map-task__empty" aria-hidden="true" />
              ) : (
                <>
                  <GemIcon className="h-3/5 w-3/5 text-[var(--color-task)]" />
                  <span className="map-task__num">{pickupIndex + 1}</span>
                </>
              )}
            </div>
          )}
          {isDrop && !isCheckpoint && (
            <div className="map-task" aria-label={`Drop-off ${dropIndex + 1}`}>
              {dropIndex < taskDropped ? (
                <CheckIcon className="h-3/5 w-3/5 text-[var(--color-task)]" />
              ) : (
                <>
                  <FlagIcon className="h-3/5 w-3/5 text-[var(--color-task-soft)]" />
                  <span className="map-task__num">{dropIndex + 1}</span>
                </>
              )}
            </div>
          )}
          {isKey && (
            <div className="map-task" aria-label={`Key ${keyIndex + 1}`}>
              {keyIndex < keysCollected ? (
                <span className="map-task__empty" aria-hidden="true" />
              ) : (
                <KeyIcon className="h-3/5 w-3/5 text-[var(--color-task)]" />
              )}
            </div>
          )}
          {isCounter && (
            <span className="map-counter-bonus" aria-label={`Adds ${counterBonus} to the counter`}>
              +{counterBonus}
            </span>
          )}
          {!isGoal && content}
          {isStart &&
            !isGoal &&
            !isRock &&
            !isBridge &&
            !isCheckpoint &&
            !gate &&
            !isDoor &&
            teleportIndex < 0 &&
            !isPlate &&
            !isIce &&
            !isKey &&
            !isCounter &&
            !isNumber && <span className="map-label">start</span>}
        </div>,
      )
    }
  }

  const leftPct = ((explorer.col + 0.5) / map.cols) * 100
  const topPct = ((explorer.row + 0.5) / map.rows) * 100
  const tokenPct = TOKEN_TILE_RATIO * 100
  const tokenWidth = `${(tokenPct / map.cols).toFixed(3)}%`
  const tokenHeight = `${(tokenPct / map.rows).toFixed(3)}%`
  const explorerMotion = crashed ? 'animate-shake' : solved ? 'animate-bob' : ''

  const ghostActive = !!ghostPath && ghostPath.length > 0 && ghostStep > 0
  const ghostPos = ghostActive ? ghostPath![Math.min(ghostStep, ghostPath!.length) - 1] : null
  const ghostTrail = ghostActive ? ghostPath!.slice(0, Math.min(ghostStep, ghostPath!.length)) : []

  return (
    <div className="flex flex-col gap-2">
      {isSearch && (
        <div className="map-find-banner" aria-label={`Find the number ${map.targetValue}`}>
          <span className="map-find-banner__label">Find</span>
          <span className="map-find-banner__value">{map.targetValue}</span>
        </div>
      )}
      <div
        className="map-grid-wrap"
        style={
          {
            aspectRatio: `${map.cols} / ${map.rows}`,
            '--map-cols': map.cols,
            '--map-rows': map.rows,
          } as React.CSSProperties
        }
      >
        <div
          className="map-frame relative grid h-full w-full gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${map.cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${map.rows}, minmax(0, 1fr))`,
          }}
        >
          {tiles}
          {ghostTrail.map((pos, index) => (
            <span
              key={`ghost-trail-${index}`}
              className="ghost-trail pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${((pos.col + 0.5) / map.cols) * 100}%`,
                top: `${((pos.row + 0.5) / map.rows) * 100}%`,
                width: `${(22 / map.cols).toFixed(3)}%`,
                height: `${(22 / map.rows).toFixed(3)}%`,
              }}
              aria-hidden="true"
            />
          ))}
          {ghostPos && (
            <div
              className="ghost-token pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2 transition-all duration-200 ease-out"
              style={{
                left: `${((ghostPos.col + 0.5) / map.cols) * 100}%`,
                top: `${((ghostPos.row + 0.5) / map.rows) * 100}%`,
                width: tokenWidth,
                height: tokenHeight,
              }}
              aria-label="Rico showing the way"
            >
              <Explorer crashed={false} solved={false} facing={facing} carrying={false} />
            </div>
          )}
          <div
            className={`pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-1/2 ${
              isTeleporting
                ? 'animate-teleport-arrive'
                : isDeparting
                  ? 'animate-teleport-depart'
                  : 'transition-all duration-200 ease-out'
            } ${explorerMotion}`}
            style={{ left: `${leftPct}%`, top: `${topPct}%`, width: tokenWidth, height: tokenHeight }}
          >
            <Explorer crashed={crashed} solved={solved} facing={facing} carrying={carrying} />
          </div>
        </div>
      </div>
    </div>
  )
}