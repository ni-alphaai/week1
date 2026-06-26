import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Action, BlockKind, Command, Position, StepFeedback } from '../types'
import { checkProgram } from '../engine/checker'
import { MapGrid } from '../components/MapGrid'
import { CommandSequence } from '../components/CommandSequence'
import type { PaletteItem, ProgramNode } from '../components/CommandSequence'
import { nodeToInstruction, iterationMap } from '../components/programNodes'
import { BirdGuide, type BirdMood } from '../components/BirdGuide'
import { SoundToggle } from '../components/SoundToggle'
import { SparkleIcon } from '../components/icons'
import { playSound } from '../lib/sound'
import { decodePuzzle, type ShareablePuzzle } from '../content/shareCode'

// Copied from PracticePage (its helpers are not exported and that file must not
// be edited): the animation step duration and the facing helper.
const STEP_MS = 240

function facingBetween(from: Position, to: Position): Command | null {
  if (to.row < from.row) return 'up'
  if (to.row > from.row) return 'down'
  if (to.col < from.col) return 'left'
  if (to.col > from.col) return 'right'
  return null
}

// Authored fallback used when a shared puzzle omits feedback, so the checker
// always has a success line and the player never shows an empty message.
const FALLBACK_FEEDBACK: StepFeedback = {
  correct: 'You did it! Nice solving.',
  hints: ['Look at where the treasure is and move toward it one step at a time.'],
}

// Builds the editor palette straight from the shared puzzle's offered cards —
// the same shape PracticePage's buildPracticePalette produces from a step.
function buildSharePalette(puzzle: ShareablePuzzle): PaletteItem[] {
  const limits = puzzle.cardLimits ?? {}
  const moves: PaletteItem[] = []
  const seenMove = new Set<Command>()
  for (const command of puzzle.availableCommands) {
    if (seenMove.has(command)) continue
    seenMove.add(command)
    moves.push({ key: `m-${command}`, kind: 'move', command, limit: limits[command] })
  }
  const actions: PaletteItem[] = []
  const seenAction = new Set<Action>()
  for (const action of puzzle.availableActions ?? []) {
    if (seenAction.has(action)) continue
    seenAction.add(action)
    actions.push({ key: `a-${action}`, kind: 'action', action, limit: limits[action] })
  }
  const blocks: PaletteItem[] = (puzzle.blocks ?? []).map((kind: BlockKind) => ({
    key: `b-${kind}`,
    kind,
    limit: limits[kind],
  }))
  return [...moves, ...actions, ...blocks]
}

export function SharePage() {
  const { code } = useParams()
  const puzzle = useMemo(() => (code ? decodePuzzle(code) : null), [code])

  const [program, setProgram] = useState<ProgramNode[]>([])
  const [explorer, setExplorer] = useState<Position>(puzzle ? puzzle.map.start : { row: 0, col: 0 })
  const [facing, setFacing] = useState<Command>('right')
  const [crashed, setCrashed] = useState(false)
  const [solved, setSolved] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [activeTile, setActiveTile] = useState<Position | null>(null)
  const [iterations, setIterations] = useState<Map<string, number> | null>(null)
  const [feedback, setFeedback] = useState<{ status: 'correct' | 'incorrect'; message: string } | null>(null)

  const timers = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }, [])

  useEffect(() => () => clearTimers(), [clearTimers])

  const paletteItems = useMemo(() => (puzzle ? buildSharePalette(puzzle) : []), [puzzle])

  function resetRun() {
    clearTimers()
    if (puzzle) setExplorer(puzzle.map.start)
    setCrashed(false)
    setSolved(false)
    setIterations(null)
    setActiveTile(null)
    setFeedback(null)
  }

  function handleProgramChange(next: ProgramNode[]) {
    setProgram(next)
    resetRun()
  }

  function handleRun() {
    if (!puzzle || animating) return
    const instructions = program.map(nodeToInstruction)
    const result = checkProgram(
      { map: puzzle.map, successRule: 'reachGoal', feedback: puzzle.feedback ?? FALLBACK_FEEDBACK },
      instructions,
    )
    clearTimers()
    setAnimating(true)
    setCrashed(false)
    setSolved(false)
    setIterations(null)
    setFeedback(null)
    setActiveTile(result.run.path[0])
    setExplorer(result.run.path[0])
    playSound('runStart')

    result.run.path.forEach((pos, index) => {
      const timer = window.setTimeout(() => {
        setExplorer(pos)
        setActiveTile(pos)
        if (index > 0) {
          const dir = facingBetween(result.run.path[index - 1], pos)
          if (dir) setFacing(dir)
          playSound('step')
        }
      }, index * STEP_MS)
      timers.current.push(timer)
    })

    const endTimer = window.setTimeout(() => {
      setAnimating(false)
      setActiveTile(null)
      if (!result.correct && result.run.status !== 'success') setCrashed(true)
      if (result.correct) setSolved(true)
      setIterations(iterationMap(program, result.run))
      playSound(result.correct ? 'success' : 'error')
      setFeedback({ status: result.correct ? 'correct' : 'incorrect', message: result.message })
    }, result.run.path.length * STEP_MS + 60)
    timers.current.push(endTimer)
  }

  function bird(): { message: string; mood: BirdMood } {
    if (feedback?.status === 'correct') return { message: feedback.message, mood: 'celebrate' }
    if (feedback?.status === 'incorrect') return { message: feedback.message, mood: 'oops' }
    if (puzzle?.prompt) return { message: puzzle.prompt, mood: 'explain' }
    return { message: 'Someone shared this puzzle with you. Can you solve it?', mood: 'explain' }
  }

  if (!puzzle) {
    return (
      <div className="lesson-shell mx-auto px-4 pb-20 pt-6 lg:pb-8">
        <header className="lesson-header mb-4 lg:mb-5">
          <Link to="/" className="btn-back">
            ← Home
          </Link>
          <span className="step-badge inline-flex items-center gap-1">
            <SparkleIcon className="h-3.5 w-3.5" /> Shared puzzle
          </span>
        </header>
        <div className="card-elevated mx-auto max-w-md p-8 text-center">
          <h1 className="font-display text-xl font-bold text-[var(--color-text)]">This puzzle link is broken</h1>
          <p className="mt-2 text-muted">
            The shared puzzle couldn&apos;t be opened — the link may be incomplete or out of date.
          </p>
          <Link to="/" className="btn-primary mt-6 inline-block">
            Go to Brillant
          </Link>
        </div>
      </div>
    )
  }

  const goal = puzzle.goal ?? 'Guide the explorer to the treasure!'

  return (
    <div className="lesson-shell mx-auto px-4 pb-20 pt-6 lg:pb-8">
      <header className="lesson-header mb-4 lg:mb-5">
        <Link to="/" className="btn-back">
          ← Home
        </Link>
        <div className="flex items-center gap-3">
          <span className="step-badge inline-flex items-center gap-1">
            <SparkleIcon className="h-3.5 w-3.5" /> Shared puzzle
          </span>
          <SoundToggle />
        </div>
      </header>

      <section className="lesson-play-layout">
        <aside className="lesson-guide-panel space-y-3">
          <BirdGuide {...bird()} variant="sidebar" />
        </aside>

        <div className="lesson-workspace space-y-4">
          <div className="puzzle-header puzzle-header--compact">
            <p className="section-label inline-flex items-center gap-1">
              <SparkleIcon className="h-3.5 w-3.5" /> Shared puzzle
            </p>
            <h1 className="puzzle-goal">{goal}</h1>
          </div>

          <div className="lesson-workspace__main">
            <div className="lesson-map-column">
              <MapGrid
                map={puzzle.map}
                explorer={explorer}
                crashed={crashed}
                solved={solved}
                facing={facing}
                activeTile={activeTile}
              />
            </div>

            <div className="lesson-workspace__controls space-y-4">
              <CommandSequence
                palette={paletteItems}
                program={program}
                disabled={animating}
                loopRange={puzzle.loopRange}
                predicateOptions={puzzle.predicateOptions}
                onChange={handleProgramChange}
                iterations={iterations ?? undefined}
              />

              <div className="action-bar">
                <button
                  type="button"
                  onClick={handleRun}
                  disabled={animating || program.length === 0}
                  className={`btn-success flex cursor-pointer items-center gap-2 ${animating ? 'animate-run-pulse' : ''}`}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                    <path d="M7 5l12 7-12 7z" fill="currentColor" />
                  </svg>
                  {animating ? 'Running…' : 'Run program'}
                </button>
                <button type="button" onClick={resetRun} disabled={animating} className="btn-ghost cursor-pointer">
                  Reset
                </button>
                <Link to="/" className="btn-ghost ml-auto inline-flex items-center gap-1">
                  Exit
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
