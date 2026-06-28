import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Instruction, MapConfig, SequenceStep } from '../types'
import { getLesson, registerGeneratedPuzzle } from '../content/registry'
import { useLearner } from '../context/LearnerContext'
import { checkProgram } from '../engine/checker'
import type { RunResult } from '../engine/map'
import { MapGrid } from '../components/MapGrid'
import { CommandSequence } from '../components/CommandSequence'
import type { ProgramNode } from '../components/CommandSequence'
import { buildPalette } from '../components/buildPalette'
import { RunStrip } from '../components/RunStrip'
import { ObjectivesChips } from '../components/ObjectivesChips'
import { usePuzzleRun } from '../run/usePuzzleRun'
import { nodeToInstruction, instructionToNode, iterationMap } from '../components/programNodes'
import { BadgeToast } from '../components/BadgeToast'
import { encodePuzzle, type ShareablePuzzle } from '../content/shareCode'
import { BirdGuide, type BirdMood } from '../components/BirdGuide'
import { SoundToggle } from '../components/SoundToggle'
import { SparkleIcon, CompassIcon } from '../components/icons'
import { playSound } from '../lib/sound'
import { aiGenerationOn } from '../ai/config'
import { useAiEnabled } from '../lib/useAiEnabled'
import { generatePuzzle } from '../ai/generation'
import type { GeneratedPuzzle } from '../ai/generation'
import { getExplanation } from '../ai/explain'
import { toPracticeStep, conceptForLesson, buildPracticeTemplate, clearPracticeSession, recordPracticePuzzle } from '../content/generated'
import { lessonSuccessRate } from '../adaptivity/mastery'
import { nextDifficultyDirection, targetLevelForDirection } from '../adaptivity/difficulty'
import { authoredPracticeFloor } from '../content/puzzleSelector'
import { ensurePrefetchDepth, takePrefetched, PREFETCH_QUEUE_DEPTH } from '../ai/practicePrefetch'

const DIRECTION_LABEL: Record<'easier' | 'same' | 'harder', string> = {
  easier: 'Easing off',
  same: 'Just right',
  harder: 'Leveling up',
}

// Stand-in map for the hook before a puzzle has loaded (the player isn't shown
// until `step` exists, so no Run ever plays on it).
const FALLBACK_MAP: MapConfig = { rows: 1, cols: 1, start: { row: 0, col: 0 }, goal: { row: 0, col: 0 } }


// A step's pre-filled scaffold, if any, expanded into editor nodes.
function initialNodesFor(step: SequenceStep): ProgramNode[] {
  if (!step.initialProgram) return []
  return step.initialProgram.map((inst) => instructionToNode(inst, !step.editableInitial))
}

// A compact, stable signature of a generated puzzle's map, used to tell the
// model which recent layouts to avoid so it does not keep repeating itself.
function puzzleSignature(puzzle: GeneratedPuzzle): string {
  const map = puzzle.map
  if (!map) return ''
  const { start, goal, obstacles } = map
  return JSON.stringify({ start, goal, obstacles: obstacles ?? [] })
}

export function PracticePage() {
  useAiEnabled() // re-renders on AI Preference change
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const { ready, activeLearner, state, recordPracticeResult } = useLearner()
  const lesson = useMemo(() => (lessonId ? getLesson(lessonId) : undefined), [lessonId])

  const [step, setStep] = useState<SequenceStep | null>(null)
  const [loading, setLoading] = useState(true)
  const [abstained, setAbstained] = useState(false)
  const [program, setProgram] = useState<ProgramNode[]>([])
  const [lastAttempt, setLastAttempt] = useState<{ run: RunResult; instructions: Instruction[] } | null>(null)
  const [explainText, setExplainText] = useState<string | null>(null)
  const [explainLoading, setExplainLoading] = useState(false)
  const [direction, setDirection] = useState<'easier' | 'same' | 'harder'>('same')
  // Per-block loop iteration counts from the last run, surfaced on the cards.
  const [iterations, setIterations] = useState<Map<string, number> | null>(null)
  // Brief "Link copied!" confirmation after sharing the current puzzle.
  const [shareCopied, setShareCopied] = useState(false)

  // Within-session running success, so difficulty adapts round to round.
  const sessionRef = useRef({ attempts: 0, correct: 0 })
  // When the current puzzle was shown, for measuring solve time.
  const startedAtRef = useRef<number>(Date.now())
  const timers = useRef<number[]>([])
  const mapColumnRef = useRef<HTMLDivElement>(null)
  const isMounted = useRef(true)
  // Single-flight guard: ignore re-entrant loadPuzzle calls while one is running.
  const busyRef = useRef(false)
  // StrictMode-safe load guard: the lessonId we have already kicked off a load
  // for, so the double-invoked mount effect generates once per lesson.
  const loadedLessonRef = useRef<string | null>(null)
  // Small ring buffer of recent puzzle signatures fed to the model as an
  // anti-repetition `avoid` list so consecutive puzzles do not look identical.
  const recentSignaturesRef = useRef<string[]>([])
  // Ring buffer of recent authored step ids for the AI-off floor, for variety.
  const recentAuthoredRef = useRef<string[]>([])

  const clearTimers = useCallback(() => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }, [])

  useEffect(() => () => clearTimers(), [clearTimers])

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
    }
  }, [])

  useEffect(() => {
    if (ready && !activeLearner) navigate('/', { replace: true })
  }, [ready, activeLearner, navigate])

  const run = usePuzzleRun({
    map: step?.map ?? FALLBACK_MAP,
    check: () =>
      checkProgram(
        { map: step!.map, successRule: step!.successRule, optimal: step!.optimal, feedback: step!.feedback },
        program.map(nodeToInstruction),
      ),
    onStart: () => {
      setShareCopied(false)
      setExplainText(null)
      setIterations(null)
      mapColumnRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    },
    onSettle: (outcome) => {
      const instructions = program.map(nodeToInstruction)
      setIterations(iterationMap(program, outcome.run))
      sessionRef.current.attempts += 1
      if (outcome.solved) sessionRef.current.correct += 1
      else setLastAttempt({ run: outcome.run, instructions })
      const solveMs = outcome.solved ? Date.now() - startedAtRef.current : 0
      recordPracticeResult(lesson!, step!.id, outcome.solved, {
        program: instructions,
        optimalSolved: false,
        solveMs,
      })
    },
  })

  // Reads the adaptive difficulty direction for the current session. Used both
  // to drive generation and to label the round; the prefetched puzzle's band may
  // lag this by one step, which is an accepted tradeoff for instant "Next".
  const currentDirection = useCallback((): 'easier' | 'same' | 'harder' => {
    const session = sessionRef.current
    const rate =
      session.attempts > 0
        ? session.correct / session.attempts
        : state && lesson
          ? lessonSuccessRate(state, lesson.skillIds)
          : null
    return nextDifficultyDirection(rate)
  }, [state, lesson])

  // Kicks off a generation for the active lesson's concept. Returns a promise
  // that resolves to null (no state writes) when the lesson maps to no AI
  // concept, so the caller falls back to the abstain path. Errors resolve to
  // null too, keeping the fire-and-forget prefetch unhandled-rejection free.
  const requestPuzzle = useCallback((): Promise<GeneratedPuzzle | null> => {
    if (!lesson) return Promise.resolve(null)
    const dir = currentDirection()
    const template = buildPracticeTemplate(lesson, {
      direction: dir,
      avoid: recentSignaturesRef.current.slice(),
    })
    if (!template) return Promise.resolve(null)
    return generatePuzzle(template).catch(() => null)
  }, [lesson, currentDirection])

  const serveAuthoredFloor = useCallback(() => {
    if (!lesson) return
    const step = authoredPracticeFloor(
      lesson,
      targetLevelForDirection(currentDirection()),
      new Set(recentAuthoredRef.current),
    )
    if (!step) {
      setAbstained(true)
      setLoading(false)
      return
    }
    recentAuthoredRef.current = [...recentAuthoredRef.current, step.id].slice(-5)
    setStep(step)
    setProgram(initialNodesFor(step))
    startedAtRef.current = Date.now()
    setAbstained(false)
    setLoading(false)
  }, [lesson, currentDirection])

  const loadPuzzle = useCallback(async () => {
    // Single-flight: never run two loads at once (e.g. a fast double "Next" or
    // StrictMode's double-invoked effect) so we don't double-generate or stomp
    // each other's state.
    if (busyRef.current) return
    if (!lesson) return
    if (!aiGenerationOn()) {
      serveAuthoredFloor()
      return
    }
    busyRef.current = true
    try {
      clearTimers()
      // The run resets itself when the new puzzle's map loads (usePuzzleRun's
      // map-change effect); here we only clear the page-owned state around it.
      setExplainText(null)
      setExplainLoading(false)
      setLastAttempt(null)
      setIterations(null)
      setShareCopied(false)
      setProgram([])

      // Lessons with no matching generator skip AI entirely and fall back to
      // authored practice — never call generatePuzzle with a null concept.
      if (!conceptForLesson(lesson)) {
        serveAuthoredFloor()
        return
      }

      setAbstained(false)
      setDirection(currentDirection())

      // Consume the one-ahead prefetch. Serve instantly only when it has already
      // resolved; otherwise show the spinner and await it (reusing the in-flight
      // generation instead of starting a new one). The `loading` branch hides
      // `step`, so the player shows a spinner rather than a stale/empty map.
      const queued = takePrefetched(lesson.id)
      const fromPrefetch = queued !== null
      let pending: Promise<GeneratedPuzzle | null>
      if (queued?.settled) {
        pending = queued.promise
      } else {
        setLoading(true)
        pending = queued ? queued.promise : requestPuzzle()
      }

      const puzzle = await pending
      if (!isMounted.current) return

      // Keep two puzzles warming ahead; chained so each sees prior session history.
      ensurePrefetchDepth(lesson.id, requestPuzzle, PREFETCH_QUEUE_DEPTH)

      if (!puzzle) {
        serveAuthoredFloor()
        return
      }
      if (!fromPrefetch) recordPracticePuzzle(lesson.id, puzzle)
      // Remember this layout so subsequent generations are asked to avoid it.
      recentSignaturesRef.current = [...recentSignaturesRef.current, puzzleSignature(puzzle)].slice(-3)
      registerGeneratedPuzzle(`practice-${lesson.id}`, puzzle)
      const practiceStep = toPracticeStep(puzzle, lesson)
      setStep(practiceStep)
      setProgram(initialNodesFor(practiceStep))
      // Start the solve-time clock now that a fresh puzzle is on screen.
      startedAtRef.current = Date.now()
      setLoading(false)
    } finally {
      busyRef.current = false
    }
  }, [lesson, clearTimers, currentDirection, requestPuzzle])

  useEffect(() => {
    if (!lessonId) return
    // StrictMode double-invokes effects; guard so we load once per lessonId and
    // don't kick off a duplicate generation on the immediate remount.
    if (loadedLessonRef.current === lessonId) return
    loadedLessonRef.current = lessonId
    // Reset per-lesson context. Do NOT clear the shared prefetch — the LessonPage
    // may have seeded it and we want to consume it instantly here.
    recentSignaturesRef.current = []
    clearPracticeSession(lessonId)
    void loadPuzzle()
    // The ref guard (not the dep array) controls when we reload; loadPuzzle is
    // intentionally omitted to avoid re-running on its identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId])

  const paletteItems = useMemo(() => (step ? buildPalette(step) : []), [step])

  function resetRun() {
    run.reset()
    setShareCopied(false)
    setIterations(null)
    setExplainText(null)
    setExplainLoading(false)
    setLastAttempt(null)
  }

  function handleProgramChange(next: ProgramNode[]) {
    setProgram(next)
    resetRun()
  }

  async function handleExplain() {
    if (!step || !lastAttempt || explainLoading) return
    setExplainLoading(true)
    playSound('click')
    try {
      const res = await getExplanation({
        stepId: step.id,
        goal: step.goal,
        map: step.map,
        successRule: step.successRule,
        optimal: step.optimal,
        instructions: lastAttempt.instructions,
        run: lastAttempt.run,
        solution: step.solution,
        authoredHints: step.feedback.hints,
        priorFailCount: 0,
      })
      setExplainText(res.text)
    } finally {
      setExplainLoading(false)
    }
  }

  function handleShare() {
    if (!step) return
    playSound('click')
    const payload: ShareablePuzzle = {
      map: step.map,
      availableCommands: step.availableCommands,
      availableActions: step.availableActions,
      blocks: step.blocks,
      predicateOptions: step.predicateOptions,
      loopRange: step.loopRange,
      cardLimits: step.cardLimits,
      solution: step.solution,
      goal: step.goal,
      prompt: step.prompt,
      feedback: step.feedback,
    }
    const url = `${window.location.origin}/share/${encodePuzzle(payload)}`
    void navigator.clipboard?.writeText(url).catch(() => {})
    setShareCopied(true)
    const reset = window.setTimeout(() => {
      if (isMounted.current) setShareCopied(false)
    }, 1800)
    timers.current.push(reset)
  }

  function bird(): { message: string; mood: BirdMood } {
    if (explainLoading) return { message: 'Hmm, let me look at the moves you used…', mood: 'explain' }
    if (explainText) return { message: explainText, mood: 'oops' }
    if (run.feedback?.status === 'correct') return { message: run.feedback.message, mood: 'celebrate' }
    if (run.feedback?.status === 'incorrect') return { message: run.feedback.message, mood: 'oops' }
    if (step) return { message: step.prompt, mood: 'explain' }
    return { message: 'Let me build you a fresh puzzle…', mood: 'explain' }
  }

  if (!lesson) {
    return (
      <div className="mx-auto max-w-md p-6 text-center">
        <p className="text-muted">That lesson could not be found.</p>
        <Link to="/app" className="link-accent mt-4 inline-block">
          Back to lessons
        </Link>
      </div>
    )
  }

  const backLink = (
    <Link to="/app" className="btn-back">
      ← Course
    </Link>
  )

  return (
    <div className="lesson-shell mx-auto px-4 pb-20 pt-6 lg:pb-8">
      <BadgeToast />
      <header className="lesson-header mb-4 lg:mb-5">
        {backLink}
        <div className="flex items-center gap-3">
          <span className="step-badge inline-flex items-center gap-1">
            <SparkleIcon className="h-3.5 w-3.5" /> Practice
          </span>
          <SoundToggle />
        </div>
      </header>

      {loading ? (
        <div className="card-elevated mx-auto max-w-md p-8 text-center">
          <BirdGuide message="Let me build you a fresh puzzle…" mood="explain" typewriter={false} />
        </div>
      ) : abstained || !step ? (
        <div className="card-elevated mx-auto max-w-md p-8 text-center">
          <h1 className="font-display text-xl font-bold text-[var(--color-text)]">No new puzzle right now</h1>
          <p className="mt-2 text-muted">Rico couldn't make a fresh one this time. Try again in a moment.</p>
          <div className="mt-6 flex flex-col gap-2">
            <button type="button" onClick={() => void loadPuzzle()} className="btn-primary">
              Try again
            </button>
            <Link to="/app" className="btn-ghost">
              Back to course
            </Link>
          </div>
        </div>
      ) : (
        <section className="lesson-play-layout">
          <aside className="lesson-guide-panel space-y-3">
            <BirdGuide {...bird()} variant="sidebar" />
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
              <span className="step-badge" aria-live="polite">
                {DIRECTION_LABEL[direction]}
              </span>
              {run.feedback?.status === 'incorrect' && lastAttempt && (
                <button
                  type="button"
                  onClick={handleExplain}
                  disabled={explainLoading || run.animating}
                  className="btn-hint"
                  aria-label="Ask Rico to explain my mistake"
                >
                  <CompassIcon className="h-4 w-4" />
                  {explainLoading ? 'Thinking…' : 'Explain my mistake'}
                </button>
              )}
            </div>
          </aside>

          <div className="lesson-workspace space-y-4">
            <div className="puzzle-header puzzle-header--compact">
              <p className="section-label inline-flex items-center gap-1">
                <SparkleIcon className="h-3.5 w-3.5" /> Fresh puzzle
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
                  iterations={iterations ?? undefined}
                  onChange={handleProgramChange}
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
                  <Link to="/app" className="btn-ghost ml-auto inline-flex items-center gap-1">
                    Exit
                  </Link>
                </div>

                {run.feedback?.status === 'correct' && (
                  <div className="next-bar">
                    <button type="button" onClick={() => void loadPuzzle()} className="btn-primary animate-pop-in">
                      Next puzzle
                    </button>
                    <button type="button" onClick={handleShare} className="btn-ghost cursor-pointer">
                      {shareCopied ? 'Link copied!' : 'Share this puzzle'}
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
