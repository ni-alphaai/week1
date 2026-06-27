import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { MapConfig, StepFeedback } from '../types'
import { checkProgram } from '../engine/checker'
import { MapGrid } from '../components/MapGrid'
import { CommandSequence } from '../components/CommandSequence'
import type { ProgramNode } from '../components/CommandSequence'
import { buildPalette } from '../components/buildPalette'
import { RunStrip } from '../components/RunStrip'
import { ObjectivesChips } from '../components/ObjectivesChips'
import { nodeToInstruction, iterationMap } from '../components/programNodes'
import { BirdGuide, type BirdMood } from '../components/BirdGuide'
import { SoundToggle } from '../components/SoundToggle'
import { SparkleIcon } from '../components/icons'
import { usePuzzleRun } from '../run/usePuzzleRun'
import { decodePuzzle } from '../content/shareCode'

// Authored fallback used when a shared puzzle omits feedback, so the checker
// always has a success line and the player never shows an empty message.
const FALLBACK_FEEDBACK: StepFeedback = {
  correct: 'You did it! Nice solving.',
  hints: ['Look at where the treasure is and move toward it one step at a time.'],
}

// Stand-in map for the hook while a broken link resolves to no puzzle (the
// component renders the error state instead of ever playing a Run on it).
const FALLBACK_MAP: MapConfig = { rows: 1, cols: 1, start: { row: 0, col: 0 }, goal: { row: 0, col: 0 } }


export function SharePage() {
  const { code } = useParams()
  const puzzle = useMemo(() => (code ? decodePuzzle(code) : null), [code])

  const [program, setProgram] = useState<ProgramNode[]>([])
  const [iterations, setIterations] = useState<Map<string, number> | null>(null)
  const mapColumnRef = useRef<HTMLDivElement>(null)

  const run = usePuzzleRun({
    map: puzzle?.map ?? FALLBACK_MAP,
    check: () =>
      checkProgram(
        { map: puzzle!.map, successRule: 'reachGoal', feedback: puzzle!.feedback ?? FALLBACK_FEEDBACK },
        program.map(nodeToInstruction),
      ),
    onStart: () => {
      setIterations(null)
      mapColumnRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    },
    onSettle: (outcome) => setIterations(iterationMap(program, outcome.run)),
  })

  const paletteItems = useMemo(() => (puzzle ? buildPalette(puzzle) : []), [puzzle])

  function resetRun() {
    run.reset()
    setIterations(null)
  }

  function handleProgramChange(next: ProgramNode[]) {
    setProgram(next)
    resetRun()
  }

  function bird(): { message: string; mood: BirdMood } {
    if (run.feedback?.status === 'correct') return { message: run.feedback.message, mood: 'celebrate' }
    if (run.feedback?.status === 'incorrect') return { message: run.feedback.message, mood: 'oops' }
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
            <ObjectivesChips map={puzzle.map} />
          </div>

          <div className="lesson-workspace__main">
            <div className="lesson-map-column" ref={mapColumnRef}>
              <MapGrid map={puzzle.map} {...run.frame} crashed={run.crashed} solved={run.solved} />
            </div>

            <div className="lesson-workspace__controls space-y-4">
              {run.animating && run.chips.length > 0 ? (
                <RunStrip chips={run.chips} activeIndex={run.frame.activeStepIndex} />
              ) : (
                <CommandSequence
                  palette={paletteItems}
                  program={program}
                  disabled={run.animating}
                  loopRange={puzzle.loopRange}
                  predicateOptions={puzzle.predicateOptions}
                  onChange={handleProgramChange}
                  iterations={iterations ?? undefined}
                />
              )}

              <div className="action-bar">
                <button
                  type="button"
                  onClick={run.handleRun}
                  disabled={run.animating || program.length === 0}
                  className={`btn-success flex cursor-pointer items-center gap-2 ${run.animating ? 'animate-run-pulse' : ''}`}
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
                    <path d="M7 5l12 7-12 7z" fill="currentColor" />
                  </svg>
                  {run.animating ? 'Running…' : 'Run program'}
                </button>
                <button type="button" onClick={resetRun} disabled={run.animating} className="btn-ghost cursor-pointer">
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
