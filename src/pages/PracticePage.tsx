import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Action, Command, Instruction, Position, SequenceStep } from '../types'
import { getLesson, registerGeneratedPuzzle } from '../content/registry'
import { useLearner } from '../context/LearnerContext'
import { checkProgram } from '../engine/checker'
import { carryFrames } from '../engine/map'
import type { RunResult } from '../engine/map'
import { MapGrid } from '../components/MapGrid'
import { CommandSequence } from '../components/CommandSequence'
import type { PaletteItem, ProgramNode } from '../components/CommandSequence'
import { nodeToInstruction, instructionToNode, iterationMap } from '../components/programNodes'
import { BadgeToast } from '../components/BadgeToast'
import { encodePuzzle, type ShareablePuzzle } from '../content/shareCode'
import { BirdGuide, type BirdMood } from '../components/BirdGuide'
import { SoundToggle } from '../components/SoundToggle'
import { SparkleIcon, CompassIcon } from '../components/icons'
import { playSound } from '../lib/sound'
import { aiGenerationEnabled } from '../ai/config'
import { generatePuzzle } from '../ai/generation'
import type { GeneratedPuzzle } from '../ai/generation'
import { getExplanation } from '../ai/explain'
import { toPracticeStep, conceptForLesson, buildPracticeTemplate, clearPracticeSession, recordPracticePuzzle } from '../content/generated'
import { lessonSuccessRate } from '../adaptivity/mastery'
import { nextDifficultyDirection } from '../adaptivity/difficulty'
import { ensurePrefetchDepth, takePrefetched, PREFETCH_QUEUE_DEPTH } from '../ai/practicePrefetch'

const STEP_MS = 240

const DIRECTION_LABEL: Record<'easier' | 'same' | 'harder', string> = {
  easier: 'Easing off',
  same: 'Just right',
  harder: 'Leveling up',
}

function facingBetween(from: Position, to: Position): Command | null {
  if (to.row < from.row) return 'up'
  if (to.row > from.row) return 'down'
  if (to.col < from.col) return 'left'
  if (to.col > from.col) return 'right'
  return null
}

// Builds the editor palette straight from the step's offered cards — mirroring
// the lesson player's buildPalette. Moves-only steps yield only move cards
// (backward compatible); loop steps add Repeat/While/If blocks and predicate
// choices, with per-card `limit`s drawn from the step's cardLimits.
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
  const seenAction = new Set<Action>()
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
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const { ready, activeLearner, state, recordPracticeResult } = useLearner()
  const lesson = useMemo(() => (lessonId ? getLesson(lessonId) : undefined), [lessonId])

  const [step, setStep] = useState<SequenceStep | null>(null)
  const [loading, setLoading] = useState(true)
  const [abstained, setAbstained] = useState(false)
  const [program, setProgram] = useState<ProgramNode[]>([])
  const [explorer, setExplorer] = useState<Position>({ row: 0, col: 0 })
  const [facing, setFacing] = useState<Command>('right')
  const [crashed, setCrashed] = useState(false)
  const [solved, setSolved] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [activeTile, setActiveTile] = useState<Position | null>(null)
  const [feedback, setFeedback] = useState<{ status: 'correct' | 'incorrect'; message: string } | null>(null)
  const [lastAttempt, setLastAttempt] = useState<{ run: RunResult; instructions: Instruction[] } | null>(null)
  const [explainText, setExplainText] = useState<string | null>(null)
  const [explainLoading, setExplainLoading] = useState(false)
  const [direction, setDirection] = useState<'easier' | 'same' | 'harder'>('same')
  // Per-block loop iteration counts from the last run, surfaced on the cards.
  const [iterations, setIterations] = useState<Map<string, number> | null>(null)
  // Whether the last run hit a loop that never made progress (loopStuck).
  const [loopStuck, setLoopStuck] = useState(false)
  // Brief "Link copied!" confirmation after sharing the current puzzle.
  const [shareCopied, setShareCopied] = useState(false)
  // Fetch-and-carry + teleport run animation (generated practice puzzles can
  // include pickup/drop tasks and teleport pads).
  const [taskPicked, setTaskPicked] = useState(0)
  const [taskDropped, setTaskDropped] = useState(0)
  const [isTeleporting, setIsTeleporting] = useState(false)
  const [isDeparting, setIsDeparting] = useState(false)

  // Within-session running success, so difficulty adapts round to round.
  const sessionRef = useRef({ attempts: 0, correct: 0 })
  // When the current puzzle was shown, for measuring solve time.
  const startedAtRef = useRef<number>(Date.now())
  const timers = useRef<number[]>([])
  const isMounted = useRef(true)
  // Single-flight guard: ignore re-entrant loadPuzzle calls while one is running.
  const busyRef = useRef(false)
  // StrictMode-safe load guard: the lessonId we have already kicked off a load
  // for, so the double-invoked mount effect generates once per lesson.
  const loadedLessonRef = useRef<string | null>(null)
  // Small ring buffer of recent puzzle signatures fed to the model as an
  // anti-repetition `avoid` list so consecutive puzzles do not look identical.
  const recentSignaturesRef = useRef<string[]>([])

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

  const loadPuzzle = useCallback(async () => {
    // Single-flight: never run two loads at once (e.g. a fast double "Next" or
    // StrictMode's double-invoked effect) so we don't double-generate or stomp
    // each other's state.
    if (busyRef.current) return
    if (!lesson || !aiGenerationEnabled) {
      setLoading(false)
      setAbstained(!aiGenerationEnabled)
      return
    }
    busyRef.current = true
    try {
      clearTimers()
      setFeedback(null)
      setExplainText(null)
      setExplainLoading(false)
      setLastAttempt(null)
      setCrashed(false)
      setSolved(false)
      setIterations(null)
      setLoopStuck(false)
      setTaskPicked(0)
      setTaskDropped(0)
      setIsTeleporting(false)
      setIsDeparting(false)
      setShareCopied(false)
      setProgram([])

      // Lessons with no matching generator skip AI entirely and abstain to
      // authored practice — never call generatePuzzle with a null concept.
      if (!conceptForLesson(lesson)) {
        setAbstained(true)
        setStep(null)
        setLoading(false)
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
        setAbstained(true)
        setStep(null)
        setLoading(false)
        return
      }
      if (!fromPrefetch) recordPracticePuzzle(lesson.id, puzzle)
      // Remember this layout so subsequent generations are asked to avoid it.
      recentSignaturesRef.current = [...recentSignaturesRef.current, puzzleSignature(puzzle)].slice(-3)
      registerGeneratedPuzzle(`practice-${lesson.id}`, puzzle)
      const practiceStep = toPracticeStep(puzzle, lesson)
      setStep(practiceStep)
      setProgram(initialNodesFor(practiceStep))
      setExplorer(practiceStep.map.start)
      setFacing('right')
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

  const paletteItems = useMemo(() => (step ? buildPracticePalette(step) : []), [step])

  function resetRun() {
    clearTimers()
    if (step) setExplorer(step.map.start)
    setCrashed(false)
    setSolved(false)
    setIterations(null)
    setLoopStuck(false)
    setTaskPicked(0)
    setTaskDropped(0)
    setIsTeleporting(false)
    setIsDeparting(false)
    setShareCopied(false)
    setActiveTile(null)
    setFeedback(null)
    setExplainText(null)
    setExplainLoading(false)
    setLastAttempt(null)
  }

  function handleProgramChange(next: ProgramNode[]) {
    setProgram(next)
    resetRun()
  }

  function handleRun() {
    if (!step || !lesson || animating) return
    const instructions = program.map(nodeToInstruction)
    const result = checkProgram(
      { map: step.map, successRule: step.successRule, optimal: step.optimal, feedback: step.feedback },
      instructions,
    )
    clearTimers()
    setAnimating(true)
    setCrashed(false)
    setSolved(false)
    setLoopStuck(false)
    setIterations(null)
    setShareCopied(false)
    setFeedback(null)
    setExplainText(null)
    setActiveTile(result.run.path[0])
    setExplorer(result.run.path[0])
    setIsTeleporting(false)
    setIsDeparting(false)
    setTaskPicked(0)
    setTaskDropped(0)
    playSound('runStart')

    const frames = carryFrames(result.run.path, result.run.events)
    const worldEvents = result.run.worldEvents
    const teleportSteps = new Set<number>()
    const teleportDepartSteps = new Set<number>()
    for (const ev of worldEvents) {
      if (ev.kind === 'teleport') teleportSteps.add(ev.pathIndex)
      if (ev.kind === 'teleport-depart') teleportDepartSteps.add(ev.pathIndex)
    }

    result.run.path.forEach((pos, index) => {
      const timer = window.setTimeout(() => {
        setExplorer(pos)
        setActiveTile(pos)
        setIsTeleporting(teleportSteps.has(index))
        setIsDeparting(teleportDepartSteps.has(index))
        const frame = frames[index] ?? { picked: 0, dropped: 0 }
        setTaskPicked((prev) => {
          if (frame.picked > prev) playSound('pick')
          return frame.picked
        })
        setTaskDropped((prev) => {
          if (frame.dropped > prev) playSound('place')
          return frame.dropped
        })
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
      setIsTeleporting(false)
      setIsDeparting(false)
      const lastFrame = frames[frames.length - 1] ?? { picked: 0, dropped: 0 }
      setTaskPicked(lastFrame.picked)
      setTaskDropped(lastFrame.dropped)
      if (!result.correct && result.run.status !== 'success') setCrashed(true)
      if (result.correct) setSolved(true)
      setLoopStuck(result.run.status === 'loopStuck')
      setIterations(iterationMap(program, result.run))
      playSound(result.correct ? 'success' : 'error')
      setFeedback({ status: result.correct ? 'correct' : 'incorrect', message: result.message })
      sessionRef.current.attempts += 1
      if (result.correct) sessionRef.current.correct += 1
      else setLastAttempt({ run: result.run, instructions })
      // Persist the attempt to mastery (in addition to the in-session bump above).
      const solveMs = result.correct ? Date.now() - startedAtRef.current : 0
      recordPracticeResult(lesson, step.id, result.correct, {
        program: instructions,
        optimalSolved: false,
        solveMs,
      })
    }, result.run.path.length * STEP_MS + 60)
    timers.current.push(endTimer)
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
    if (feedback?.status === 'correct') return { message: feedback.message, mood: 'celebrate' }
    if (feedback?.status === 'incorrect') return { message: feedback.message, mood: 'oops' }
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

      {!aiGenerationEnabled ? (
        <div className="card-elevated mx-auto max-w-md p-8 text-center">
          <h1 className="font-display text-xl font-bold text-[var(--color-text)]">Practice is turned off</h1>
          <p className="mt-2 text-muted">Endless practice puzzles need AI to be switched on.</p>
          <Link to="/app" className="btn-primary mt-6 inline-block">
            Back to course
          </Link>
        </div>
      ) : loading ? (
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
              {feedback?.status === 'incorrect' && lastAttempt && (
                <button
                  type="button"
                  onClick={handleExplain}
                  disabled={explainLoading || animating}
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
            </div>

            <div className="lesson-workspace__main">
              <div className="lesson-map-column">
                <MapGrid
                  map={step.map}
                  explorer={explorer}
                  crashed={crashed}
                  solved={solved}
                  loopStuck={loopStuck}
                  facing={facing}
                  activeTile={activeTile}
                  taskPicked={taskPicked}
                  taskDropped={taskDropped}
                  isTeleporting={isTeleporting}
                  isDeparting={isDeparting}
                />
              </div>

              <div className="lesson-workspace__controls space-y-4">
                <CommandSequence
                  palette={paletteItems}
                  program={program}
                  disabled={animating}
                  loopRange={step.loopRange}
                  predicateOptions={step.predicateOptions}
                  iterations={iterations ?? undefined}
                  onChange={handleProgramChange}
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
