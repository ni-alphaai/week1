import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Command, Lesson, Position, SequenceStep } from '../types'
import { useLearner } from '../context/LearnerContext'
import { getLesson, registerGeneratedPuzzle } from '../content/registry'
import { checkProgram } from '../engine/checker'
import { MapGrid } from '../components/MapGrid'
import { CommandSequence } from '../components/CommandSequence'
import type { PaletteItem, ProgramNode } from '../components/CommandSequence'
import { nodeToInstruction, instructionToNode, iterationMap } from '../components/programNodes'
import { BirdGuide, type BirdMood } from '../components/BirdGuide'
import { SoundToggle } from '../components/SoundToggle'
import { SparkleIcon } from '../components/icons'
import { playSound } from '../lib/sound'
import { aiGenerationEnabled } from '../ai/config'
import { generatePuzzle } from '../ai/generation'
import { buildPracticeTemplate, toPracticeStep, conceptForLesson } from '../content/generated'
import { lessonSuccessRate } from '../adaptivity/mastery'
import { nextDifficultyDirection } from '../adaptivity/difficulty'

// Copied from PracticePage (its helpers are not exported and that file must not
// be edited): the animation step duration, the facing helper, the palette
// builder, and the scaffold expander.
const STEP_MS = 240

function facingBetween(from: Position, to: Position): Command | null {
  if (to.row < from.row) return 'up'
  if (to.row > from.row) return 'down'
  if (to.col < from.col) return 'left'
  if (to.col > from.col) return 'right'
  return null
}

function buildPracticePalette(step: SequenceStep): PaletteItem[] {
  const limits = step.cardLimits ?? {}
  const moves: PaletteItem[] = []
  const seenMove = new Set<Command>()
  for (const command of step.availableCommands) {
    if (seenMove.has(command)) continue
    seenMove.add(command)
    moves.push({ key: `m-${command}`, kind: 'move', command, limit: limits[command] })
  }
  const actions: PaletteItem[] = []
  const seenAction = new Set<string>()
  for (const action of step.availableActions ?? []) {
    if (seenAction.has(action)) continue
    seenAction.add(action)
    actions.push({ key: `a-${action}`, kind: 'action', action, limit: limits[action] })
  }
  const blocks: PaletteItem[] = (step.blocks ?? []).map((kind) => ({
    key: `b-${kind}`,
    kind,
    limit: limits[kind],
  }))
  return [...moves, ...actions, ...blocks]
}

function initialNodesFor(step: SequenceStep): ProgramNode[] {
  if (!step.initialProgram) return []
  return step.initialProgram.map((inst) => instructionToNode(inst, !step.editableInitial))
}

export function ReviewPage() {
  const { ready, activeLearner, state, recordReview } = useLearner()

  // Snapshot the due queue once: recordReview replaces the state object, but the
  // queue itself only changes on the once-a-day refresh, so advancing through a
  // captured copy keeps the session stable.
  const queueRef = useRef<string[] | null>(null)
  if (queueRef.current === null && state) {
    queueRef.current = [...(state.review?.dueQueue ?? [])]
  }
  const queue = queueRef.current ?? []

  const [index, setIndex] = useState(0)
  const [step, setStep] = useState<SequenceStep | null>(null)
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)
  const [completedCount, setCompletedCount] = useState(0)

  const [program, setProgram] = useState<ProgramNode[]>([])
  const [explorer, setExplorer] = useState<Position>({ row: 0, col: 0 })
  const [facing, setFacing] = useState<Command>('right')
  const [crashed, setCrashed] = useState(false)
  const [solved, setSolved] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [activeTile, setActiveTile] = useState<Position | null>(null)
  const [iterations, setIterations] = useState<Map<string, number> | null>(null)
  const [feedback, setFeedback] = useState<{ status: 'correct' | 'incorrect'; message: string } | null>(null)

  const timers = useRef<number[]>([])
  const busyRef = useRef(false)
  const loadedRef = useRef(false)
  const isMounted = useRef(true)
  // The lesson backing the puzzle currently on screen, for recordReview on solve.
  const currentLessonRef = useRef<Lesson | null>(null)
  const startedAtRef = useRef<number>(Date.now())
  // Keep a live handle on state so the difficulty read isn't stale in the loader.
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }, [])

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      timers.current.forEach((id) => window.clearTimeout(id))
    }
  }, [])

  const resetPlayState = useCallback(() => {
    clearTimers()
    setCrashed(false)
    setSolved(false)
    setIterations(null)
    setActiveTile(null)
    setFeedback(null)
    setProgram([])
  }, [clearTimers])

  // Loads the next reviewable puzzle, starting at queue position `start`. Walks
  // forward over lessons with no generator concept or that abstain, so a single
  // dud doesn't strand the learner. When nothing is left, shows "all caught up".
  const loadReview = useCallback(
    async (start: number) => {
      if (busyRef.current) return
      busyRef.current = true
      try {
        const q = queueRef.current ?? []
        setLoading(true)
        setStep(null)
        resetPlayState()

        let cursor = start
        while (cursor < q.length) {
          const lesson = getLesson(q[cursor])
          if (!lesson || conceptForLesson(lesson) === null) {
            cursor += 1
            continue
          }
          const st = stateRef.current
          const rate = st ? lessonSuccessRate(st, lesson.skillIds) : null
          const template = buildPracticeTemplate(lesson, { direction: nextDifficultyDirection(rate) })
          if (!template) {
            cursor += 1
            continue
          }
          const puzzle = await generatePuzzle(template).catch(() => null)
          if (!isMounted.current) return
          if (!puzzle) {
            cursor += 1
            continue
          }
          // Register for the leak guard, mirroring PracticePage.
          registerGeneratedPuzzle(`review-${lesson.id}`, puzzle)
          const practiceStep = toPracticeStep(puzzle, lesson)
          currentLessonRef.current = lesson
          setStep(practiceStep)
          setProgram(initialNodesFor(practiceStep))
          setExplorer(practiceStep.map.start)
          setFacing('right')
          startedAtRef.current = Date.now()
          setIndex(cursor)
          setLoading(false)
          return
        }

        // Exhausted the queue (or every remaining lesson abstained).
        setIndex(q.length)
        setDone(true)
        setLoading(false)
      } finally {
        busyRef.current = false
      }
    },
    [resetPlayState],
  )

  useEffect(() => {
    if (!ready || !activeLearner) return
    if (!aiGenerationEnabled) return
    if (loadedRef.current) return
    loadedRef.current = true
    if (queue.length === 0) {
      setDone(true)
      setLoading(false)
      return
    }
    void loadReview(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, activeLearner, queue.length])

  const paletteItems = useMemo(() => (step ? buildPracticePalette(step) : []), [step])

  function resetRun() {
    clearTimers()
    if (step) setExplorer(step.map.start)
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
    if (!step || animating) return
    const lesson = currentLessonRef.current
    const instructions = program.map(nodeToInstruction)
    const result = checkProgram(
      { map: step.map, successRule: step.successRule, optimal: step.optimal, feedback: step.feedback },
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

    result.run.path.forEach((pos, idx) => {
      const timer = window.setTimeout(() => {
        setExplorer(pos)
        setActiveTile(pos)
        if (idx > 0) {
          const dir = facingBetween(result.run.path[idx - 1], pos)
          if (dir) setFacing(dir)
          playSound('step')
        }
      }, idx * STEP_MS)
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
      if (result.correct && lesson) {
        recordReview(lesson, lesson.skillIds[0], step.id, true)
        setCompletedCount((c) => c + 1)
      }
    }, result.run.path.length * STEP_MS + 60)
    timers.current.push(endTimer)
  }

  function bird(): { message: string; mood: BirdMood } {
    if (feedback?.status === 'correct') return { message: feedback.message, mood: 'celebrate' }
    if (feedback?.status === 'incorrect') return { message: feedback.message, mood: 'oops' }
    if (step) return { message: step.prompt, mood: 'explain' }
    return { message: 'Let me pull up something to review…', mood: 'explain' }
  }

  const backLink = (
    <Link to="/app" className="btn-back">
      ← Home
    </Link>
  )

  const header = (
    <header className="lesson-header mb-4 lg:mb-5">
      {backLink}
      <div className="flex items-center gap-3">
        <span className="step-badge inline-flex items-center gap-1">
          <SparkleIcon className="h-3.5 w-3.5" /> Daily review
        </span>
        <SoundToggle />
      </div>
    </header>
  )

  if (!ready) {
    return <div className="flex min-h-full items-center justify-center text-muted">Loading…</div>
  }

  if (!activeLearner || !state) {
    return (
      <div className="mx-auto max-w-md px-6 py-12 text-center">
        <p className="text-muted">Pick an explorer first to start reviewing.</p>
        <Link to="/" className="link-accent mt-4 inline-block">
          Go to start
        </Link>
      </div>
    )
  }

  if (!aiGenerationEnabled) {
    return (
      <div className="lesson-shell mx-auto px-4 pb-20 pt-6 lg:pb-8">
        {header}
        <div className="card-elevated mx-auto max-w-md p-8 text-center">
          <h1 className="font-display text-xl font-bold text-[var(--color-text)]">Review is turned off</h1>
          <p className="mt-2 text-muted">Daily review puzzles need AI to be switched on.</p>
          <Link to="/app" className="btn-primary mt-6 inline-block">
            Back home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="lesson-shell mx-auto px-4 pb-20 pt-6 lg:pb-8">
      {header}

      {loading ? (
        <div className="card-elevated mx-auto max-w-md p-8 text-center">
          <BirdGuide message="Let me pull up something to review…" mood="explain" typewriter={false} />
        </div>
      ) : done || !step ? (
        <div className="card-elevated mx-auto max-w-md p-8 text-center">
          <h1 className="font-display text-xl font-bold text-[var(--color-text)]">All caught up!</h1>
          <p className="mt-2 text-muted">
            {completedCount > 0
              ? `Nice reviewing — you finished ${completedCount} review${completedCount === 1 ? '' : 's'} today.`
              : 'Nothing to review today. Come back tomorrow!'}
          </p>
          <Link to="/app" className="btn-primary mt-6 inline-block">
            Back home
          </Link>
        </div>
      ) : (
        <section className="lesson-play-layout">
          <aside className="lesson-guide-panel space-y-3">
            <BirdGuide {...bird()} variant="sidebar" />
          </aside>

          <div className="lesson-workspace space-y-4">
            <div className="puzzle-header puzzle-header--compact">
              <p className="section-label inline-flex items-center gap-1">
                <SparkleIcon className="h-3.5 w-3.5" /> Review puzzle
              </p>
              <h1 className="puzzle-goal">{step.goal}</h1>
            </div>

            <div className="lesson-workspace__main">
              <div className="lesson-map-column">
                <MapGrid
                  map={step.map}
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
                  loopRange={step.loopRange}
                  predicateOptions={step.predicateOptions}
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
                  <Link to="/app" className="btn-ghost ml-auto inline-flex items-center gap-1">
                    Exit
                  </Link>
                </div>

                {feedback?.status === 'correct' && (
                  <div className="next-bar">
                    <button
                      type="button"
                      onClick={() => void loadReview(index + 1)}
                      className="btn-primary animate-pop-in"
                    >
                      {index + 1 < queue.length ? 'Next review' : 'Finish review'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
