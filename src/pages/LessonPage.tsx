import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Action, Command, ConditionalStep, Instruction, Position, SequenceStep } from '../types'
import { getLesson, getNextLessonId } from '../content/registry'
import { useLearner } from '../context/LearnerContext'
import { checkProgram } from '../engine/checker'
import type { ProgramSpec } from '../engine/checker'
import { checkpointsVisitedInOrder, carryFrames, runInstructions, gateStatesAt, keysCollectedAt } from '../engine/map'
import type { SearchWindow, RunResult } from '../engine/map'
import { resumeStepId } from '../storage/progress'
import { aiExplainEnabled, aiGenerationEnabled } from '../ai/config'
import { getExplanation } from '../ai/explain'
import { ensurePrefetchDepth, PREFETCH_QUEUE_DEPTH } from '../ai/practicePrefetch'
import { generatePuzzle } from '../ai/generation'
import { conceptForLesson, buildPracticeTemplate } from '../content/generated'
import { nextDifficultyDirection } from '../adaptivity/difficulty'
import { lessonSuccessRate } from '../adaptivity/mastery'
import { MapGrid } from '../components/MapGrid'
import { CommandSequence } from '../components/CommandSequence'
import type { ProgramNode, PaletteItem } from '../components/CommandSequence'
import { nodeToInstruction, instructionToNode } from '../components/programNodes'
import { BirdGuide, type BirdMood } from '../components/BirdGuide'
import { FormattedText } from '../components/FormattedText'
import { Confetti } from '../components/Confetti'
import { SoundToggle } from '../components/SoundToggle'
import { FlameIcon, CheckCircleIcon, LightbulbIcon, BadgeIcon, CompassIcon } from '../components/icons'
import { pickHint } from '../lib/hints'
import { playSound } from '../lib/sound'
import { BeatPuzzle } from '../components/BeatPuzzle'

const STEP_MS = 260

function facingBetween(from: Position, to: Position): Command | null {
  if (to.row < from.row) return 'up'
  if (to.row > from.row) return 'down'
  if (to.col < from.col) return 'left'
  if (to.col > from.col) return 'right'
  return null
}

type PlayStep = SequenceStep | ConditionalStep

// Palette stamps offered for a step: unique move/action cards plus any
// composable container blocks. Stamps are reusable (cloned on drop), but a
// per-card `limit` can cap how many copies a learner may place.
function buildPalette(step: PlayStep): PaletteItem[] {
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

function isProgramNodeArray(value: unknown): value is ProgramNode[] {
  return (
    Array.isArray(value) &&
    value.every((node) => !!node && typeof node === 'object' && 'kind' in (node as object) && 'id' in (node as object))
  )
}

function restoreProgram(saved: unknown): ProgramNode[] {
  return isProgramNodeArray(saved) ? (saved as ProgramNode[]) : []
}

function specForStep(step: PlayStep): ProgramSpec {
  if (step.type === 'sequence') {
    return { map: step.map, successRule: step.successRule, optimal: step.optimal, feedback: step.feedback }
  }
  return {
    map: step.map,
    successRule: 'reachGoal',
    feedback: step.feedback,
    requiresConditional: step.requiresConditional ?? true,
  }
}

export function LessonPage() {
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const { ready, activeLearner, state, ensureLesson, saveProgram, setCurrentStep, completeConcept, recordResult } =
    useLearner()

  const lesson = useMemo(() => (lessonId ? getLesson(lessonId) : undefined), [lessonId])

  const stateRef = useRef(state)
  stateRef.current = state

  // Background prefetch guard: ensures we only kick off the first practice
  // puzzle generation once per lesson (single-flight at the trigger site).
  const prefetchedLessonRef = useRef<string | null>(null)

  const [stepIndex, setStepIndex] = useState(0)
  const [program, setProgram] = useState<ProgramNode[]>([])
  const [explorer, setExplorer] = useState<Position>({ row: 0, col: 0 })
  const [facing, setFacing] = useState<Command>('right')
  const [crashed, setCrashed] = useState(false)
  const [solved, setSolved] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [activeTile, setActiveTile] = useState<Position | null>(null)
  const [checkpointsDelivered, setCheckpointsDelivered] = useState(0)
  const [taskPicked, setTaskPicked] = useState(0)
  const [taskDropped, setTaskDropped] = useState(0)
  const [gateState, setGateState] = useState<Record<string, boolean>>({})
  const [keysCollected, setKeysCollected] = useState(0)
  const [ghostPath, setGhostPath] = useState<Position[] | null>(null)
  const [ghostStep, setGhostStep] = useState(0)
  const [ghostPlaying, setGhostPlaying] = useState(false)
  const [isTeleporting, setIsTeleporting] = useState(false)
  const [isDeparting, setIsDeparting] = useState(false)
  const [counter, setCounter] = useState<number | undefined>(undefined)
  const [searchWindow, setSearchWindow] = useState<SearchWindow | null>(null)
  const [celebrate, setCelebrate] = useState(false)
  const [manualHintLevel, setManualHintLevel] = useState(0)
  const [feedback, setFeedback] = useState<{
    status: 'correct' | 'incorrect'
    message: string
  } | null>(null)
  // P0 AI: the last failed attempt, plus the on-demand explanation state.
  const [lastAttempt, setLastAttempt] = useState<{ run: RunResult; instructions: Instruction[] } | null>(null)
  const [explainText, setExplainText] = useState<string | null>(null)
  const [explainLoading, setExplainLoading] = useState(false)

  const timers = useRef<number[]>([])
  const feedbackRef = useRef<HTMLDivElement>(null)
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }
  useEffect(() => () => clearTimers(), [])

  useEffect(() => {
    if (ready && !activeLearner) navigate('/', { replace: true })
  }, [ready, activeLearner, navigate])

  useEffect(() => {
    if (!lesson) return
    ensureLesson(lesson)
    const completed = stateRef.current?.lessonProgress[lesson.id]?.completedStepIds ?? []
    const resumeId = resumeStepId(lesson, completed)
    const index = lesson.steps.findIndex((step) => step.id === resumeId)
    setStepIndex(index < 0 ? 0 : index)
  }, [lesson, ensureLesson])

  const currentStep = lesson?.steps[stepIndex]

  useEffect(() => {
    clearTimers()
    setAnimating(false)
    setActiveTile(null)
    setCrashed(false)
    setSolved(false)
    setFacing('right')
    setFeedback(null)
    setManualHintLevel(0)
    setLastAttempt(null)
    setExplainText(null)
    setExplainLoading(false)
    setCheckpointsDelivered(0)
    setTaskPicked(0)
    setTaskDropped(0)
    setKeysCollected(0)
    setGhostPath(null)
    setGhostStep(0)
    setGhostPlaying(false)
    setIsTeleporting(false)
    setIsDeparting(false)
    setCounter(undefined)
    setSearchWindow(null)
    if (lesson && currentStep && (currentStep.type === 'sequence' || currentStep.type === 'conditional')) {
      const saved = stateRef.current?.lessonProgress[lesson.id]?.savedPrograms[currentStep.id]
      const restored = restoreProgram(saved)
      if (restored.length === 0 && currentStep.initialProgram) {
        setProgram(
          currentStep.initialProgram.map((inst) => instructionToNode(inst, !currentStep.editableInitial)),
        )
      } else {
        setProgram(restored)
      }
      setExplorer(currentStep.map.start)
      setGateState({})
    }
    if (lesson && currentStep) {
      setCurrentStep(lesson.id, currentStep.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, stepIndex])

  // Once the learner crosses the halfway point of the lesson, warm up the first
  // "Keep practicing" puzzle in the background so the PracticePage can serve it
  // instantly. Fires at most once per lesson; ensurePrefetch is single-flight and
  // its promise never rejects, so the request function only needs to avoid throwing.
  useEffect(() => {
    if (!lesson || !aiGenerationEnabled) return
    if (conceptForLesson(lesson) === null) return
    if (stepIndex < Math.floor(lesson.steps.length / 2)) return
    if (prefetchedLessonRef.current === lesson.id) return
    prefetchedLessonRef.current = lesson.id
    ensurePrefetchDepth(lesson.id, () => {
      const learnerState = state ?? stateRef.current
      const rate = learnerState ? lessonSuccessRate(learnerState, lesson.skillIds) : null
      const direction = nextDifficultyDirection(rate)
      const template = buildPracticeTemplate(lesson, { direction })
      return template ? generatePuzzle(template) : Promise.resolve(null)
    }, PREFETCH_QUEUE_DEPTH)
    // Fire once per lesson when halfway is crossed; `state` is read fresh inside
    // and intentionally excluded so this does not re-run on every state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, stepIndex])

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

  const totalSteps = lesson.steps.length
  const onDone = stepIndex >= totalSteps
  const isPlayStep = currentStep && (currentStep.type === 'sequence' || currentStep.type === 'conditional')
  const paletteItems = isPlayStep && currentStep ? buildPalette(currentStep) : []

  const priorFails =
    isPlayStep && currentStep ? (state?.stepStats[currentStep.id]?.incorrect ?? 0) : 0
  const autoHintLevel = feedback?.status === 'incorrect' ? priorFails : 0
  const hintLevel = Math.max(manualHintLevel, autoHintLevel)
  const hintCount = isPlayStep && currentStep ? currentStep.feedback.hints.length : 0
  const activeHint =
    isPlayStep && currentStep && hintLevel > 0
      ? pickHint(currentStep.feedback.hints, hintLevel - 1)
      : null
  const canAskHint = isPlayStep && hintLevel < hintCount
  // Once the text hints are exhausted, Rico can demonstrate the solution.
  const canShowGhost = !!isPlayStep && !canAskHint

  function persistProgram(next: ProgramNode[]) {
    if (!lesson || !currentStep || (currentStep.type !== 'sequence' && currentStep.type !== 'conditional')) return
    saveProgram(lesson.id, currentStep.id, next)
  }

  function resetRunState() {
    if (currentStep && (currentStep.type === 'sequence' || currentStep.type === 'conditional')) {
      setExplorer(currentStep.map.start)
    }
    setCrashed(false)
    setSolved(false)
    setActiveTile(null)
    setCheckpointsDelivered(0)
    setTaskPicked(0)
    setTaskDropped(0)
    setGateState({})
    setKeysCollected(0)
    setGhostPath(null)
    setGhostStep(0)
    setGhostPlaying(false)
    setIsTeleporting(false)
    setIsDeparting(false)
    setCounter(undefined)
    setSearchWindow(null)
    setCelebrate(false)
    setFeedback(null)
    setLastAttempt(null)
    setExplainText(null)
    setExplainLoading(false)
  }

  function handleProgramChange(next: ProgramNode[]) {
    setProgram(next)
    persistProgram(next)
    resetRunState()
  }

  function handleReset() {
    if (!currentStep || (currentStep.type !== 'sequence' && currentStep.type !== 'conditional')) return
    if (currentStep.initialProgram) {
      const initial = currentStep.initialProgram.map((inst) => instructionToNode(inst, !currentStep.editableInitial))
      setProgram(initial)
      persistProgram(initial)
    } else {
      setProgram([])
      persistProgram([])
    }
    resetRunState()
  }

  function handleShowGhost() {
    if (!currentStep || (currentStep.type !== 'sequence' && currentStep.type !== 'conditional') || animating) return
    const step = currentStep
    const run = runInstructions(step.map, step.solution)
    clearTimers()
    resetRunState()
    setGhostPlaying(true)
    setGhostPath(run.path)
    setGhostStep(0)
    setFacing('right')
    playSound('runStart')
    run.path.forEach((pos, index) => {
      const timer = window.setTimeout(() => {
        setGhostStep(index + 1)
        if (index > 0) {
          const dir = facingBetween(run.path[index - 1], pos)
          if (dir) setFacing(dir)
          playSound('step')
        }
      }, index * STEP_MS)
      timers.current.push(timer)
    })
    const endTimer = window.setTimeout(() => setGhostPlaying(false), run.path.length * STEP_MS + 80)
    timers.current.push(endTimer)
  }

  function handleHint() {
    if (!canAskHint) return
    playSound('click')
    setManualHintLevel(hintLevel + 1)
    if (feedbackRef.current) {
      feedbackRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  async function handleExplain() {
    if (!currentStep || (currentStep.type !== 'sequence' && currentStep.type !== 'conditional')) return
    if (!lastAttempt || explainLoading) return
    const step = currentStep
    const spec = specForStep(step)
    setExplainLoading(true)
    playSound('click')
    try {
      const res = await getExplanation({
        stepId: step.id,
        goal: step.goal,
        map: step.map,
        successRule: spec.successRule,
        optimal: spec.optimal,
        instructions: lastAttempt.instructions,
        run: lastAttempt.run,
        solution: step.solution,
        authoredHints: step.feedback.hints,
        priorFailCount: priorFails,
      })
      setExplainText(res.text)
    } finally {
      setExplainLoading(false)
    }
    if (feedbackRef.current) {
      feedbackRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }

  function handleRun() {
    if (!currentStep || (currentStep.type !== 'sequence' && currentStep.type !== 'conditional') || animating) return
    const step = currentStep
    const instructions = program.map(nodeToInstruction)
    const result = checkProgram(specForStep(step), instructions)
    clearTimers()
    setAnimating(true)
    setCrashed(false)
    setSolved(false)
    setFeedback(null)
    setExplainText(null)
    setExplainLoading(false)
    setGhostPath(null)
    setGhostStep(0)
    setActiveTile(result.run.path[0])
    setExplorer(result.run.path[0])
    playSound('runStart')

    const bridge = step.map.bridge
    const checkpoints = step.map.checkpoints ?? []
    const frames = carryFrames(result.run.path, result.run.events)
    const worldEvents = result.run.worldEvents
    const counterAtPath = result.run.counterAtPath
    const searchWindows = result.run.searchWindows
    const teleportSteps = new Set<number>()
    const teleportDepartSteps = new Set<number>()
    for (const ev of worldEvents) {
      if (ev.kind === 'teleport') teleportSteps.add(ev.pathIndex)
      if (ev.kind === 'teleport-depart') teleportDepartSteps.add(ev.pathIndex)
    }
    setIsTeleporting(false)
    setIsDeparting(false)
    setCounter(counterAtPath ? counterAtPath[0] : undefined)
    setSearchWindow(searchWindows ? searchWindows[0] : null)

    result.run.path.forEach((pos, index) => {
      const timer = window.setTimeout(() => {
        setExplorer(pos)
        setActiveTile(pos)
        setCheckpointsDelivered(checkpointsVisitedInOrder(result.run.path.slice(0, index + 1), checkpoints))
        setGateState(gateStatesAt(step.map, worldEvents, index))
        setKeysCollected(keysCollectedAt(worldEvents, index))
        setCounter(counterAtPath ? counterAtPath[index] : undefined)
        setSearchWindow(searchWindows ? searchWindows[index] : null)
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
          if (bridge && pos.row === bridge.row && pos.col === bridge.col) {
            playSound('bridge')
          } else {
            playSound('step')
          }
        }
      }, index * STEP_MS)
      timers.current.push(timer)
    })

    const endTimer = window.setTimeout(
      () => {
        setAnimating(false)
        setActiveTile(null)
        setIsTeleporting(false)
        setIsDeparting(false)
        if (counterAtPath && counterAtPath.length > 0) {
          setCounter(counterAtPath[counterAtPath.length - 1])
        }
        if (searchWindows && searchWindows.length > 0) {
          setSearchWindow(searchWindows[searchWindows.length - 1])
        }
        setCheckpointsDelivered(
          result.correct ? checkpoints.length : checkpointsVisitedInOrder(result.run.path, checkpoints),
        )
        const lastFrame = frames[frames.length - 1] ?? { picked: 0, dropped: 0 }
        setTaskPicked(lastFrame.picked)
        setTaskDropped(lastFrame.dropped)
        setGateState(gateStatesAt(step.map, worldEvents, result.run.path.length))
        setKeysCollected(keysCollectedAt(worldEvents, result.run.path.length))
        if (!result.correct && result.run.status !== 'success') setCrashed(true)
        if (result.correct) {
          setSolved(true)
          setCelebrate(true)
          const clearCelebrate = window.setTimeout(() => setCelebrate(false), 2000)
          timers.current.push(clearCelebrate)
        }
        playSound(result.correct ? 'success' : 'error')
        if (result.correct) {
          setFeedback({ status: 'correct', message: result.message })
          setLastAttempt(null)
        } else {
          setFeedback({ status: 'incorrect', message: result.message })
          setLastAttempt({ run: result.run, instructions })
        }
        recordResult(lesson, step.id, result.correct, result.run.executed)
        if (feedbackRef.current) {
          feedbackRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
        }
      },
      result.run.path.length * STEP_MS + 60,
    )
    timers.current.push(endTimer)
  }

  function goNext() {
    setStepIndex((index) => {
      const next = index + 1
      if (next >= totalSteps) {
        playSound('complete')
        playSound('streak')
      }
      return next
    })
  }

  function handleConceptContinue() {
    if (!currentStep) return
    playSound('click')
    completeConcept(lesson, currentStep.id)
    goNext()
  }

  if (onDone) {
    const nextId = getNextLessonId(lesson.id)
    const streak = state?.streak.current ?? 0
    const earnedBadge = lesson.award && (state?.badges?.includes(lesson.award.id) ?? false)
    return (
      <div className="animate-float-in mx-auto max-w-md px-4 py-10">
        <Confetti count={earnedBadge ? 70 : 36} />
        <div className="card-elevated p-8 text-center">
          {earnedBadge && lesson.award ? (
            <>
              <div className="badge-reveal mx-auto mb-4">
                <span className="badge-reveal__ring" aria-hidden="true" />
                <BadgeIcon className="badge-reveal__medal h-16 w-16" />
              </div>
              <p className="badge-reveal__kicker">Badge earned</p>
              <h1 className="font-display text-2xl font-bold text-[var(--color-text)]">{lesson.award.title}</h1>
              <p className="mt-2 text-muted">{lesson.award.blurb}</p>
            </>
          ) : (
            <>
              <div className="complete-icon-wrap mx-auto mb-4">
                <CheckCircleIcon className="animate-goal-pop h-9 w-9" />
              </div>
              <h1 className="font-display text-2xl font-bold text-[var(--color-text)]">Lesson complete</h1>
              <p className="mt-1 text-muted">You finished “{lesson.title}”.</p>
            </>
          )}
          {streak > 0 && (
            <div className="streak-badge mt-4 px-4 py-1.5 text-sm">
              <FlameIcon className="h-4 w-4" /> {streak}-day streak
            </div>
          )}
          <div className="mt-6 flex flex-col gap-2">
            {nextId ? (
              <Link to={`/lesson/${nextId}`} onClick={() => playSound('click')} className="btn-primary">
                Next lesson
              </Link>
            ) : (
              <p className="text-muted">You completed every lesson. Amazing!</p>
            )}
            {aiGenerationEnabled && (
              <Link to={`/practice/${lesson.id}`} onClick={() => playSound('click')} className="btn-ghost">
                Keep practicing
              </Link>
            )}
            <Link to="/app" onClick={() => playSound('click')} className="btn-ghost">
              Back to course
            </Link>
          </div>
        </div>
      </div>
    )
  }

  function birdForPlayStep(step: PlayStep): { message: string; mood: BirdMood } {
    // Rico himself delivers the AI explanation: a brief "thinking" line while it
    // loads, then the tailored explanation in his speech bubble.
    if (explainLoading) {
      return { message: 'Hmm, let me look at the moves you used…', mood: 'explain' }
    }
    if (explainText) {
      return { message: explainText, mood: 'oops' }
    }
    if (feedback?.status === 'correct') {
      return { message: feedback.message, mood: 'celebrate' }
    }
    if (feedback?.status === 'incorrect') {
      return { message: feedback.message, mood: 'oops' }
    }
    return { message: step.prompt, mood: 'explain' }
  }

  return (
    <div className="lesson-shell mx-auto px-4 pb-20 pt-6 lg:pb-8">
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
      <header className="lesson-header mb-4 lg:mb-5">
        <Link to="/app" className="btn-back">
          ← Course
        </Link>
        <div className="flex items-center gap-3">
          <span className="step-badge">
            Step {stepIndex + 1} of {totalSteps}
          </span>
          <SoundToggle />
        </div>
      </header>

      <div className="progress-track mb-4 lg:mb-5">
        <div
          className="progress-fill"
          style={{ width: `${((stepIndex + 1) / totalSteps) * 100}%` }}
        />
      </div>

      {currentStep && currentStep.type === 'concept' && (
        <section className="lesson-concept-layout">
          <aside className="lesson-guide-panel">
            <BirdGuide message={currentStep.body} mood="explain" variant="sidebar" />
          </aside>
          <div className="card-elevated animate-pop-in p-6">
            <p className="section-label">{lesson.title}</p>
            <h1 className="font-display mt-1 text-2xl font-bold tracking-tight text-[var(--color-text)] lg:text-3xl">
              {currentStep.title}
            </h1>
            <p className="mt-4 whitespace-pre-line text-muted lg:hidden">
              <FormattedText text={currentStep.body} />
            </p>
            <button type="button" onClick={handleConceptContinue} className="btn-primary mt-6 w-full lg:mt-8">
              Continue
            </button>
          </div>
        </section>
      )}

      {isPlayStep && currentStep && (currentStep.type === 'sequence' || currentStep.type === 'conditional') && (
        <section className="lesson-play-layout">
          <aside ref={feedbackRef} className="lesson-guide-panel space-y-3">
            <BirdGuide {...birdForPlayStep(currentStep)} variant="sidebar" />
            {activeHint && (
              <div className="hint-panel animate-pop-in">
                <div className="hint-panel__icon" aria-hidden="true">
                  <LightbulbIcon className="h-4 w-4" />
                </div>
                <p className="hint-panel__text">
                  <FormattedText text={activeHint} />
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
              <button
                type="button"
                onClick={handleHint}
                disabled={!canAskHint || animating || ghostPlaying}
                className="btn-hint"
                aria-label={`Get a hint (${hintLevel} of ${hintCount} used)`}
              >
                <LightbulbIcon className="h-4 w-4" />
                {canAskHint ? 'Need a hint?' : 'Hints used'}
                {hintCount > 0 && (
                  <span className="hint-count">
                    {Math.min(hintLevel, hintCount)}/{hintCount}
                  </span>
                )}
              </button>
              {canShowGhost && (
                <button
                  type="button"
                  onClick={handleShowGhost}
                  disabled={animating || ghostPlaying}
                  className="btn-hint"
                  aria-label="Watch Rico show the moves"
                >
                  <CompassIcon className="h-4 w-4" />
                  {ghostPlaying ? 'Watch closely…' : 'Watch Rico show you'}
                </button>
              )}
              {aiExplainEnabled && feedback?.status === 'incorrect' && lastAttempt && (
                <button
                  type="button"
                  onClick={handleExplain}
                  disabled={explainLoading || animating || ghostPlaying}
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
              <p className="section-label">{lesson.title}</p>
              <h1 className="puzzle-goal">{currentStep.goal}</h1>
            </div>

            <div className="lesson-workspace__main">
              <div className="lesson-map-column">
                <MapGrid
                  map={currentStep.map}
                  explorer={explorer}
                  crashed={crashed}
                  solved={solved}
                  facing={facing}
                  activeTile={activeTile}
                  checkpointsDelivered={checkpointsDelivered}
                  taskPicked={taskPicked}
                  taskDropped={taskDropped}
                  gateState={gateState}
                  keysCollected={keysCollected}
                  ghostPath={ghostPath}
                  ghostStep={ghostStep}
                  isTeleporting={isTeleporting}
                  isDeparting={isDeparting}
                  searchWindow={searchWindow}
                />
              </div>

              <div className="lesson-workspace__controls space-y-4">
                <CommandSequence
                  palette={paletteItems}
                  program={program}
                  disabled={animating || ghostPlaying}
                  loopRange={currentStep.loopRange}
                  predicateOptions={currentStep.predicateOptions}
                  onChange={handleProgramChange}
                />

                <div className="action-bar">
                  <button
                    type="button"
                    onClick={handleRun}
                    disabled={animating || ghostPlaying || program.length === 0}
                    className={`btn-success flex cursor-pointer items-center gap-2 ${animating ? 'animate-run-pulse' : ''}`}
                  >
                    <svg viewBox="0 0 24 24" className={`h-4 w-4 ${animating ? 'animate-pulse' : ''}`} aria-hidden="true">
                      <path d="M7 5l12 7-12 7z" fill="currentColor" />
                    </svg>
                    {animating ? 'Running…' : 'Run program'}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={animating || ghostPlaying}
                    className="btn-ghost cursor-pointer"
                  >
                    Reset
                  </button>
                  {counter !== undefined && (
                    <span className="steps-badge" aria-live="polite">
                      <span className="steps-badge__label">Steps</span>
                      <span className="steps-badge__value">{counter}</span>
                    </span>
                  )}
                </div>

                {feedback?.status === 'correct' && (
                  <div className="next-bar">
                    <button type="button" onClick={goNext} className="btn-primary animate-pop-in">
                      {stepIndex + 1 >= totalSteps ? 'Finish' : 'Next'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {currentStep && currentStep.type === 'beat' && (
        <BeatPuzzle
          step={currentStep}
          savedProgram={state?.lessonProgress[lesson.id]?.savedPrograms[currentStep.id]}
          onProgramChange={(p) => saveProgram(lesson.id, currentStep.id, p)}
          onResult={(correct) => recordResult(lesson, currentStep.id, correct, [])}
          onNext={goNext}
          priorFailCount={state?.stepStats[currentStep.id]?.incorrect ?? 0}
          isLastStep={stepIndex + 1 >= totalSteps}
        />
      )}
    </div>
  )
}
