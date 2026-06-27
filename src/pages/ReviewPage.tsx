import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Lesson, MapConfig, SequenceStep } from '../types'
import { useLearner } from '../context/LearnerContext'
import { getLesson, registerGeneratedPuzzle } from '../content/registry'
import { checkProgram } from '../engine/checker'
import { MapGrid } from '../components/MapGrid'
import { CommandSequence } from '../components/CommandSequence'
import type { ProgramNode } from '../components/CommandSequence'
import { buildPalette } from '../components/buildPalette'
import { RunStrip } from '../components/RunStrip'
import { ObjectivesChips } from '../components/ObjectivesChips'
import { usePuzzleRun } from '../run/usePuzzleRun'
import { nodeToInstruction, instructionToNode, iterationMap } from '../components/programNodes'
import { BirdGuide, type BirdMood } from '../components/BirdGuide'
import { BadgeToast } from '../components/BadgeToast'
import { Confetti } from '../components/Confetti'
import { TreasureChestReward } from '../components/TreasureChestReward'
import { SoundToggle } from '../components/SoundToggle'
import { SparkleIcon, CheckCircleIcon, ChestIcon } from '../components/icons'
import { aiGenerationOn } from '../ai/config'
import { useAiEnabled } from '../lib/useAiEnabled'
import { toPracticeStep, conceptForLesson } from '../content/generated'
import { warmReview, warmReviewAhead, clearReview } from '../ai/reviewPrefetch'

// Stand-in map for the hook before a review puzzle has loaded (the player isn't
// shown until `step` exists, so no Run ever plays on it).
const FALLBACK_MAP: MapConfig = { rows: 1, cols: 1, start: { row: 0, col: 0 }, goal: { row: 0, col: 0 } }


function initialNodesFor(step: SequenceStep): ProgramNode[] {
  if (!step.initialProgram) return []
  return step.initialProgram.map((inst) => instructionToNode(inst, !step.editableInitial))
}

export function ReviewPage() {
  useAiEnabled() // re-renders on AI Preference change
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
  const [iterations, setIterations] = useState<Map<string, number> | null>(null)
  const [celebrate, setCelebrate] = useState(false)

  const timers = useRef<number[]>([])
  const mapColumnRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)
  const loadedRef = useRef(false)
  const isMounted = useRef(true)
  // Guards the one-time success side effects (record, count, celebrate) so a
  // re-run of an already-solved puzzle can't double count. Reset on each load.
  const recordedRef = useRef(false)
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

  const run = usePuzzleRun({
    map: step?.map ?? FALLBACK_MAP,
    check: () =>
      checkProgram(
        { map: step!.map, successRule: step!.successRule, optimal: step!.optimal, feedback: step!.feedback },
        program.map(nodeToInstruction),
      ),
    onStart: () => {
      setIterations(null)
      setCelebrate(false)
      mapColumnRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    },
    onSettle: (outcome) => {
      setIterations(iterationMap(program, outcome.run))
      if (!outcome.solved) return
      setCelebrate(true)
      const clearCelebrate = window.setTimeout(() => setCelebrate(false), 2000)
      timers.current.push(clearCelebrate)
      // Record/count only on the first correct solve of this puzzle, so a re-run
      // of an already-solved puzzle can't double count.
      const lesson = currentLessonRef.current
      if (lesson && step && !recordedRef.current) {
        recordedRef.current = true
        recordReview(lesson, lesson.skillIds[0], step.id, true)
        setCompletedCount((c) => c + 1)
        clearReview(lesson.id)
      }
    },
  })

  const resetPlayState = useCallback(() => {
    // The run resets itself when the new puzzle's map loads (usePuzzleRun's
    // map-change effect); here we only clear the page-owned state around it.
    clearTimers()
    setIterations(null)
    setCelebrate(false)
    setProgram([])
  }, [clearTimers])

  // Keep the next few reviewable lessons warming in the background so advancing
  // through the queue stays instant.
  const warmAhead = useCallback((q: string[], from: number) => {
    warmReviewAhead(q, from, stateRef.current)
  }, [])

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
          // Consume the background-prefetched puzzle (warmReview is idempotent,
          // so this resolves instantly when Home already warmed it).
          const puzzle = await warmReview(lesson, stateRef.current)
          if (!isMounted.current) return
          if (!puzzle) {
            clearReview(lesson.id)
            cursor += 1
            continue
          }
          // Register for the leak guard, mirroring PracticePage.
          registerGeneratedPuzzle(`review-${lesson.id}`, puzzle)
          const practiceStep = toPracticeStep(puzzle, lesson)
          currentLessonRef.current = lesson
          recordedRef.current = false
          setStep(practiceStep)
          setProgram(initialNodesFor(practiceStep))
          startedAtRef.current = Date.now()
          setIndex(cursor)
          // Keep the next few reviewable lessons warm so advancing feels instant.
          warmAhead(q, cursor + 1)
          return
        }

        // Exhausted the queue (or every remaining lesson abstained).
        setIndex(q.length)
        setDone(true)
      } catch {
        // An unexpected failure (e.g. a generator throwing) must not strand the
        // learner on an endless spinner — fall back to the "all caught up"
        // terminal screen so the Exit path stays reachable.
        if (isMounted.current) setDone(true)
      } finally {
        if (isMounted.current) setLoading(false)
        busyRef.current = false
      }
    },
    [resetPlayState, warmAhead],
  )

  useEffect(() => {
    if (!ready || !activeLearner) return
    if (!aiGenerationOn()) return
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

  const paletteItems = useMemo(() => (step ? buildPalette(step) : []), [step])

  function resetRun() {
    clearTimers()
    run.reset()
    setIterations(null)
    setCelebrate(false)
  }

  // Reset clears the placed blocks back to the puzzle's starting program (not
  // just the run visuals), so the kid gets a clean slate to try again.
  function handleReset() {
    if (step) setProgram(initialNodesFor(step))
    resetRun()
  }

  function handleProgramChange(next: ProgramNode[]) {
    setProgram(next)
    resetRun()
  }

  function bird(): { message: string; mood: BirdMood } {
    if (run.feedback?.status === 'correct') return { message: run.feedback.message, mood: 'celebrate' }
    if (run.feedback?.status === 'incorrect') return { message: run.feedback.message, mood: 'oops' }
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

  if (!aiGenerationOn()) {
    return (
      <div className="lesson-shell mx-auto px-4 pb-20 pt-6 lg:pb-8">
        {header}
        <div className="reward-card mx-auto max-w-md p-8 text-center">
          <h1 className="page-title">Review is turned off</h1>
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
      <BadgeToast />
      {celebrate && (
        <>
          <Confetti count={48} />
          <div className="success-burst" aria-hidden="true">
            <div className="success-burst__ring" />
            <div className="success-burst__badge">
              <CheckCircleIcon className="h-10 w-10" />
            </div>
          </div>
        </>
      )}
      {header}

      {loading ? (
        <div className="reward-card mx-auto max-w-md p-8 text-center">
          <BirdGuide message="Give me a sec — I'm dreaming up a fresh puzzle just for you…" mood="explain" typewriter={false} />
        </div>
      ) : done || !step ? (
        <div className="reward-card mx-auto max-w-md p-8 text-center">
          <div className="reward-stage reward-stage--sm mx-auto mb-1">
            <TreasureChestReward
              variant="chest"
              size={160}
              fallback={
                <div className="reward-chest-fallback">
                  <ChestIcon className="h-9 w-9" />
                </div>
              }
            />
          </div>
          <h1 className="page-title">All caught up!</h1>
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
              <ObjectivesChips map={step.map} />
            </div>

            <div className="lesson-workspace__main">
              <div className="lesson-map-column" ref={mapColumnRef}>
                <MapGrid
                  map={step.map}
                  {...run.frame}
                  crashed={run.crashed}
                  solved={run.solved}
                  loopStuck={run.loopStuck}
                />
              </div>

              <div className="lesson-workspace__controls space-y-4">
                {run.animating && run.chips.length > 0 ? (
                  <RunStrip chips={run.chips} activeIndex={run.frame.activeStepIndex} />
                ) : (
                <CommandSequence
                  palette={paletteItems}
                  program={program}
                  disabled={run.animating}
                  loopRange={step.loopRange}
                  predicateOptions={step.predicateOptions}
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
                  <button type="button" onClick={handleReset} disabled={run.animating} className="btn-ghost cursor-pointer">
                    Reset
                  </button>
                  <Link to="/app" className="btn-ghost ml-auto inline-flex items-center gap-1">
                    Exit
                  </Link>
                </div>

                {run.feedback?.status === 'correct' && (
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
