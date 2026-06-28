import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { Command, ConditionalStep, Instruction, MapConfig, Position, SequenceStep } from '../types'
import { getLesson, getNextLessonId, registerGeneratedPuzzle } from '../content/registry'
import { useLearner } from '../context/LearnerContext'
import { checkProgram } from '../engine/checker'
import type { ProgramSpec } from '../engine/checker'
import { runInstructions } from '../engine/map'
import type { RunResult } from '../engine/map'
import { resumeStepId } from '../storage/progress'
import { aiExplainOn, aiGenerationOn } from '../ai/config'
import { useAiEnabled } from '../lib/useAiEnabled'
import { getExplanation } from '../ai/explain'
import { ensurePrefetchDepth, PREFETCH_QUEUE_DEPTH } from '../ai/practicePrefetch'
import { generatePuzzle } from '../ai/generation'
import { conceptForLesson, buildPracticeTemplate, toPracticeStep } from '../content/generated'
import { warmSmallerVariant, consumeSmallerVariant, clearSmallerVariant } from '../ai/variantPrefetch'
import { encodePuzzle } from '../content/shareCode'
import { nextDifficultyDirection } from '../adaptivity/difficulty'
import { belowSkilled, belowSkilledTiers, lessonSuccessRate } from '../adaptivity/mastery'
import { MapGrid } from '../components/MapGrid'
import { CommandSequence } from '../components/CommandSequence'
import type { ProgramNode } from '../components/CommandSequence'
import { buildPalette } from '../components/buildPalette'
import { RunStrip } from '../components/RunStrip'
import { ObjectivesChips } from '../components/ObjectivesChips'
import { usePuzzleRun } from '../run/usePuzzleRun'
import { nodeToInstruction, instructionToNode, iterationMap } from '../components/programNodes'
import { BadgeToast } from '../components/BadgeToast'
import { BirdGuide, type BirdMood } from '../components/BirdGuide'
import { FormattedText } from '../components/FormattedText'
import { Confetti } from '../components/Confetti'
import { TreasureChestReward } from '../components/TreasureChestReward'
import { SoundToggle } from '../components/SoundToggle'
import { FlameIcon, CheckCircleIcon, CheckIcon, LightbulbIcon, BadgeIcon, CompassIcon, ChestIcon, ShareIcon } from '../components/icons'
import { pickHint } from '../lib/hints'
import { playSound } from '../lib/sound'
import { BeatPuzzle } from '../components/BeatPuzzle'

const STEP_MS = 260

// Stand-in map for the Run hook on non-play steps (a beat puzzle, or the
// completion screen), where the Run player isn't rendered at all.
const FALLBACK_MAP: MapConfig = { rows: 1, cols: 1, start: { row: 0, col: 0 }, goal: { row: 0, col: 0 } }

function facingBetween(from: Position, to: Position): Command | null {
  if (to.row < from.row) return 'up'
  if (to.row > from.row) return 'down'
  if (to.col < from.col) return 'left'
  if (to.col > from.col) return 'right'
  return null
}

type PlayStep = SequenceStep | ConditionalStep

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
  useAiEnabled() // re-renders on AI Preference change
  const { lessonId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const isReplay = searchParams.get('replay') === '1'
  const {
    ready,
    activeLearner,
    state,
    ensureLesson,
    saveProgram,
    setCurrentStep,
    completeConcept,
    recordResult,
    recordPracticeResult,
  } = useLearner()

  const lesson = useMemo(() => (lessonId ? getLesson(lessonId) : undefined), [lessonId])

  const stateRef = useRef(state)
  stateRef.current = state

  // Background prefetch guard: ensures we only kick off the first practice
  // puzzle generation once per lesson (single-flight at the trigger site).
  const prefetchedLessonRef = useRef<string | null>(null)

  const [stepIndex, setStepIndex] = useState(0)
  const [program, setProgram] = useState<ProgramNode[]>([])
  // Ghost (solution demonstration) is its own concept, separate from a Run: it
  // draws a translucent path overlay and rotates the explorer's facing without
  // moving it. It keeps its own facing so the Run's frame stays authoritative.
  const [ghostPath, setGhostPath] = useState<Position[] | null>(null)
  const [ghostStep, setGhostStep] = useState(0)
  const [ghostPlaying, setGhostPlaying] = useState(false)
  const [ghostFacing, setGhostFacing] = useState<Command>('right')
  const [celebrate, setCelebrate] = useState(false)
  const [manualHintLevel, setManualHintLevel] = useState(0)
  // P0 AI: the last failed attempt, plus the on-demand explanation state.
  const [lastAttempt, setLastAttempt] = useState<{ run: RunResult; instructions: Instruction[] } | null>(null)
  const [explainText, setExplainText] = useState<string | null>(null)
  const [explainLoading, setExplainLoading] = useState(false)
  // #8 iteration UI: per-block loop iteration counts from the last run.
  const [iterations, setIterations] = useState<Map<string, number> | null>(null)
  // #10 share-this-puzzle: transient "copied" acknowledgement.
  const [shareCopied, setShareCopied] = useState(false)
  // #4 "Try a smaller version": the active easier variant (null = main puzzle),
  // a loading flag, a transient fallback notice, the warmed variant's status
  // ('warming' shows a disabled "Preparing…", 'ready' enables the button,
  // 'failed' lets a click re-attempt), and a token bumped to request a fresh one.
  const [variantStep, setVariantStep] = useState<SequenceStep | null>(null)
  const [variantLoading, setVariantLoading] = useState(false)
  const [variantNotice, setVariantNotice] = useState<string | null>(null)
  const [variantStatus, setVariantStatus] = useState<'warming' | 'ready' | 'failed'>('warming')
  const [variantGen, setVariantGen] = useState(0)

  // Elapsed-time anchor for the current step, reset on every step change so a
  // correct run can report how long the learner took (#11 solveMs).
  const stepStartRef = useRef(Date.now())

  const timers = useRef<number[]>([])
  const feedbackRef = useRef<HTMLDivElement>(null)
  const mapColumnRef = useRef<HTMLDivElement>(null)
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }
  useEffect(() => () => clearTimers(), [])

  useEffect(() => {
    if (ready && !activeLearner) navigate('/', { replace: true })
  }, [ready, activeLearner, navigate])

  // Resume the learner at their in-progress step. This must wait for `state` to
  // be loaded: on a hard reload (or reopening the tab) at /lesson/:id the page
  // can mount before the persisted state arrives, and resuming with no state
  // would strand the learner back at step 0. We run it once per lesson (guarded
  // by resumedLessonRef) so it restores progress on entry without overriding
  // the learner's own navigation afterwards.
  const resumedLessonRef = useRef<string | null>(null)
  useEffect(() => {
    if (!lesson || !state) return
    if (resumedLessonRef.current === lesson.id) return
    resumedLessonRef.current = lesson.id
    ensureLesson(lesson)
    if (isReplay) {
      // Replay: start at step 0 with blank editors. lessonProgress is NOT
      // mutated — completedStepIds, status, and completedAt stay intact.
      // Skill stats, streak, and portfolio artifacts are also NOT mutated:
      // recordResult is gated on !isReplay in onSettle, so solving steps
      // during a replay does not count toward mastery or the daily streak.
      setStepIndex(0)
      return
    }
    const completed = state.lessonProgress[lesson.id]?.completedStepIds ?? []
    const allComplete =
      lesson.steps.length > 0 && lesson.steps.every((step) => completed.includes(step.id))
    if (allComplete) {
      // Re-opening a finished lesson (e.g. the course "Review" link) should land
      // on the reward/completion screen, not replay the final step.
      setStepIndex(lesson.steps.length)
      return
    }
    const resumeId = resumeStepId(lesson, completed)
    const index = lesson.steps.findIndex((step) => step.id === resumeId)
    setStepIndex(index < 0 ? 0 : index)
  }, [lesson, state, ensureLesson, isReplay])

  const currentStep = lesson?.steps[stepIndex]
  const playStep =
    currentStep && (currentStep.type === 'sequence' || currentStep.type === 'conditional') ? currentStep : null

  const run = usePuzzleRun({
    map: playStep?.map ?? FALLBACK_MAP,
    stepMs: STEP_MS,
    check: () => checkProgram(specForStep(playStep!), program.map(nodeToInstruction)),
    onStart: () => {
      setExplainText(null)
      setExplainLoading(false)
      setGhostPath(null)
      setGhostStep(0)
      mapColumnRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    },
    onSettle: (outcome) => {
      const step = playStep!
      const instructions = program.map(nodeToInstruction)
      setIterations(iterationMap(program, outcome.run))
      if (outcome.solved) {
        setCelebrate(true)
        const clearCelebrate = window.setTimeout(() => setCelebrate(false), 2000)
        timers.current.push(clearCelebrate)
        setLastAttempt(null)
      } else {
        setLastAttempt({ run: outcome.run, instructions })
      }
      const optimalSolved = outcome.solved && step.type === 'sequence' && step.successRule === 'shortestPath'
      const solveMs = outcome.solved ? Date.now() - stepStartRef.current : 0
      if (!isReplay) {
        recordResult(lesson!, step.id, outcome.solved, outcome.run.executed, {
          program: instructions,
          optimalSolved,
          solveMs,
        })
      }
      if (feedbackRef.current) feedbackRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    },
  })

  useEffect(() => {
    // Run-owned state (explorer, facing, run flags, world progress) is reset by
    // usePuzzleRun when the step's map changes; this effect resets the
    // page-owned state around it.
    clearTimers()
    setManualHintLevel(0)
    setLastAttempt(null)
    setExplainText(null)
    setExplainLoading(false)
    setGhostPath(null)
    setGhostStep(0)
    setGhostPlaying(false)
    setIterations(null)
    setShareCopied(false)
    setVariantStep(null)
    setVariantLoading(false)
    setVariantNotice(null)
    stepStartRef.current = Date.now()
    if (lesson && currentStep && (currentStep.type === 'sequence' || currentStep.type === 'conditional')) {
      if (isReplay) {
        // Replay: skip savedPrograms hydration so editors start blank.
        // Still seed authored initialProgram blocks (locked scaffolding must
        // appear even on replay — the learner can't solve the step without them).
        if (currentStep.initialProgram) {
          setProgram(
            currentStep.initialProgram.map((inst) => instructionToNode(inst, !currentStep.editableInitial)),
          )
        } else {
          setProgram([])
        }
      } else {
        const saved = stateRef.current?.lessonProgress[lesson.id]?.savedPrograms[currentStep.id]
        const restored = restoreProgram(saved)
        if (restored.length === 0 && currentStep.initialProgram) {
          setProgram(
            currentStep.initialProgram.map((inst) => instructionToNode(inst, !currentStep.editableInitial)),
          )
        } else {
          setProgram(restored)
        }
      }
    }
    if (!isReplay && lesson && currentStep) {
      // Replay: do not advance currentStep in lessonProgress so completedAt /
      // status / completedStepIds stay intact for the session.
      setCurrentStep(lesson.id, currentStep.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lesson, stepIndex])

  // Once the learner crosses the halfway point of the lesson, warm up the first
  // "Keep practicing" puzzle in the background so the PracticePage can serve it
  // instantly. Fires at most once per lesson; ensurePrefetchDepth is single-flight
  // and its promise never rejects, so the request function only needs to avoid throwing.
  useEffect(() => {
    if (!lesson || !aiGenerationOn()) return
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

  // #4: warm the lesson's easier "Try a smaller version" puzzle in the
  // background as soon as the learner reaches a play step. The cache
  // (ai/variantPrefetch) is lesson-scoped and single-flight, so this warms once
  // per lesson and is reused across every step. Readiness resolves from the
  // deterministic authored fallback, so the button becomes clickable almost
  // immediately (AI generation, when it lands, upgrades the served puzzle in the
  // background). `failed` only happens for the rare lesson with no authored play
  // step to fall back to — then the affordance is hidden and Rico's demo stands in.
  useEffect(() => {
    if (!lesson || !aiGenerationOn()) return
    if (conceptForLesson(lesson) === null) return
    const step = lesson.steps[stepIndex]
    if (!step || (step.type !== 'sequence' && step.type !== 'conditional')) return
    const pending = warmSmallerVariant(lesson)
    if (!pending) return
    let active = true
    void pending.then((puzzle) => {
      if (!active) return
      setVariantStatus(puzzle ? 'ready' : 'failed')
    })
    return () => {
      active = false
    }
  }, [lesson, stepIndex, variantGen])

  // Back to "warming" when the lesson changes or a fresh variant is requested.
  useEffect(() => {
    setVariantStatus('warming')
  }, [lesson, variantGen])

  // Drop the cached variant when leaving the lesson so a different lesson (or a
  // later return) warms a fresh one instead of reusing a stale puzzle.
  useEffect(() => {
    if (!lesson) return
    const lessonId = lesson.id
    return () => clearSmallerVariant(lessonId)
  }, [lesson])

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
  const hintCount = isPlayStep && currentStep ? currentStep.feedback.hints.length : 0
  // Hints are shown ONLY when the learner asks for one — never auto-revealed on a
  // failed run.
  const activeHint =
    isPlayStep && currentStep && manualHintLevel > 0
      ? pickHint(currentStep.feedback.hints, manualHintLevel - 1)
      : null
  const canAskHint = isPlayStep && manualHintLevel < hintCount
  // Rico's demo + the smaller variant unlock once the learner is clearly stuck:
  // they've worked through every hint, or they've already missed this step.
  const stuckLevel = Math.max(manualHintLevel, run.feedback?.status === 'incorrect' ? priorFails : 0)
  const canShowGhost = !!isPlayStep && stuckLevel >= hintCount
  // #4: an AI-generated easier variant is offered alongside the ghost when the
  // lesson maps to a generator concept and generation is enabled.
  // Offered once the learner is stuck and the lesson supports generation, until
  // generation has conclusively failed (then it's hidden and Rico's demo stands
  // in). While warming the button is shown but disabled ("Preparing…"); it only
  // becomes clickable once a real puzzle is ready, so a click always opens one.
  const canTrySmaller =
    canShowGhost &&
    aiGenerationOn() &&
    !!lesson &&
    conceptForLesson(lesson) !== null &&
    variantStatus !== 'failed'

  function persistProgram(next: ProgramNode[]) {
    if (!lesson || !currentStep || (currentStep.type !== 'sequence' && currentStep.type !== 'conditional')) return
    saveProgram(lesson.id, currentStep.id, next)
  }

  function resetRunState() {
    run.reset()
    setGhostPath(null)
    setGhostStep(0)
    setGhostPlaying(false)
    setCelebrate(false)
    setLastAttempt(null)
    setExplainText(null)
    setExplainLoading(false)
    setIterations(null)
    setShareCopied(false)
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
    if (!playStep || run.animating) return
    const step = playStep
    const ghostRun = runInstructions(step.map, step.solution)
    clearTimers()
    resetRunState()
    setGhostPlaying(true)
    setGhostPath(ghostRun.path)
    setGhostStep(0)
    setGhostFacing('right')
    playSound('runStart')
    ghostRun.path.forEach((pos, index) => {
      const timer = window.setTimeout(() => {
        setGhostStep(index + 1)
        if (index > 0) {
          const dir = facingBetween(ghostRun.path[index - 1], pos)
          if (dir) setGhostFacing(dir)
          playSound('step')
        }
      }, index * STEP_MS)
      timers.current.push(timer)
    })
    const endTimer = window.setTimeout(() => setGhostPlaying(false), ghostRun.path.length * STEP_MS + 80)
    timers.current.push(endTimer)
  }

  function handleHint() {
    if (!canAskHint) return
    playSound('click')
    setManualHintLevel((level) => level + 1)
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

  // #10: copy a self-contained share link for the current puzzle. The payload
  // mirrors ShareablePuzzle; the /share route decodes + re-verifies it.
  async function handleShare() {
    if (!currentStep || (currentStep.type !== 'sequence' && currentStep.type !== 'conditional')) return
    const step = currentStep
    const code = encodePuzzle({
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
    })
    playSound('click')
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/share/${code}`)
      setShareCopied(true)
      const reset = window.setTimeout(() => setShareCopied(false), 1800)
      timers.current.push(reset)
    } catch {
      /* clipboard may be unavailable; fail quietly */
    }
  }

  // #4: enter "smaller variant" mode using the prefetched (or freshly generated)
  // easier puzzle. On failure/abstain, surface a brief notice and fall back to
  // the ghost demo so the learner is never blocked.
  function handleTrySmaller() {
    if (!lesson || variantLoading) return
    playSound('click')
    setVariantLoading(true)
    try {
      // The button is only enabled once a variant is ready, so the freshest
      // puzzle (AI upgrade if it landed, else the authored fallback) is available
      // synchronously from the lesson cache.
      const puzzle = consumeSmallerVariant(lesson.id)
      if (puzzle) {
        const step = toPracticeStep(puzzle, lesson)
        registerGeneratedPuzzle(step.id, puzzle)
        setVariantStep(step)
        setVariantNotice(null)
      } else {
        // Safety net only — readiness gating makes this path rare. Never block
        // the learner: fall back to the ghost demo.
        setVariantNotice('No smaller version right now — watch Rico instead.')
        const clear = window.setTimeout(() => setVariantNotice(null), 2600)
        timers.current.push(clear)
        handleShowGhost()
      }
      // Drop the used variant and request a fresh one (re-tracking readiness) so
      // the next struggle gets a different warm-up, still pre-cached.
      clearSmallerVariant(lesson.id)
      setVariantGen((n) => n + 1)
    } finally {
      setVariantLoading(false)
    }
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
    const showSoftGate = state ? belowSkilled(state, lesson.id) : false
    const weakTiers = state ? belowSkilledTiers(state, lesson.id) : []
    return (
      <div className="animate-float-in mx-auto max-w-md px-4 py-10">
        <BadgeToast />
        <Confetti count={earnedBadge ? 70 : 36} />
        <div className="reward-card p-8 text-center">
          {earnedBadge && lesson.award ? (
            <>
              <div className="reward-stage mx-auto mb-2">
                <TreasureChestReward
                  variant="badge"
                  size={200}
                  fallback={
                    <div className="badge-reveal">
                      <span className="badge-reveal__ring" aria-hidden="true" />
                      <BadgeIcon className="badge-reveal__medal h-16 w-16" />
                    </div>
                  }
                />
              </div>
              <p className="badge-reveal__kicker">Badge earned</p>
              <h1 className="reward-title">{lesson.award.title}</h1>
              <p className="mt-2 text-muted">{lesson.award.blurb}</p>
            </>
          ) : (
            <>
              <div className="reward-stage mx-auto mb-2">
                <TreasureChestReward
                  variant="chest"
                  size={200}
                  fallback={
                    <div className="reward-chest-fallback">
                      <ChestIcon className="h-10 w-10" />
                    </div>
                  }
                />
              </div>
              <h1 className="reward-title">Lesson complete</h1>
              <p className="mt-1 text-muted">You finished "{lesson.title}".</p>
            </>
          )}
          {streak > 0 && (
            <div className="streak-badge mt-4 px-4 py-1.5 text-sm">
              <FlameIcon className="h-4 w-4" /> {streak}-day streak
            </div>
          )}
          {showSoftGate && (
            <div className="soft-gate-nudge mt-5 rounded-lg bg-[var(--color-surface-strong)] px-4 py-3 text-sm text-muted" data-testid="soft-gate-nudge">
              <p className="font-medium text-[var(--color-text)]">Keep sharpening these skills</p>
              <p className="soft-gate-nudge__detail mt-0.5">
                {weakTiers.map((t) => `${t.label}: ${t.tier}`).join(' · ')} — reach Skilled to move on.
              </p>
            </div>
          )}
          <div className="mt-6 flex flex-col gap-2">
            {showSoftGate && (
              <Link to={`/review/lesson/${lesson.id}`} onClick={() => playSound('click')} className="btn-primary" data-testid="soft-gate-review-cta">
                Review skills
              </Link>
            )}
            {nextId ? (
              <Link
                to={`/lesson/${nextId}`}
                onClick={() => playSound('click')}
                className={showSoftGate ? 'btn-ghost' : 'btn-primary'}
                data-testid="next-lesson-link"
              >
                Next lesson
              </Link>
            ) : (
              <p className="text-muted">You completed every lesson. Amazing!</p>
            )}
            <Link to={`/practice/${lesson.id}`} onClick={() => playSound('click')} className="btn-ghost">
              Keep practicing
            </Link>
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
    if (run.feedback?.status === 'correct') {
      return { message: run.feedback.message, mood: 'celebrate' }
    }
    if (run.feedback?.status === 'incorrect') {
      return { message: run.feedback.message, mood: 'oops' }
    }
    return { message: step.prompt, mood: 'explain' }
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

      {isPlayStep && currentStep && (currentStep.type === 'sequence' || currentStep.type === 'conditional') && variantStep && (
        <VariantPlayer
          step={variantStep}
          lessonTitle={lesson.title}
          onExit={() => {
            playSound('click')
            setVariantStep(null)
          }}
          onSolved={(instr) =>
            recordPracticeResult(lesson, variantStep.id, true, { program: instr, solveMs: 0 })
          }
        />
      )}

      {isPlayStep && currentStep && (currentStep.type === 'sequence' || currentStep.type === 'conditional') && !variantStep && (
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
                disabled={!canAskHint || run.animating || ghostPlaying}
                className="btn-hint"
                aria-label={`Get a hint (${manualHintLevel} of ${hintCount} used)`}
              >
                <LightbulbIcon className="h-4 w-4" />
                {canAskHint ? 'Need a hint?' : 'Hints used'}
                {hintCount > 0 && (
                  <span className="hint-count">
                    {Math.min(manualHintLevel, hintCount)}/{hintCount}
                  </span>
                )}
              </button>
              {canShowGhost && (
                <button
                  type="button"
                  onClick={handleShowGhost}
                  disabled={run.animating || ghostPlaying}
                  className="btn-hint"
                  aria-label="Watch Rico show the moves"
                >
                  <CompassIcon className="h-4 w-4" />
                  {ghostPlaying ? 'Watch closely…' : 'Watch Rico show you'}
                </button>
              )}
              {canTrySmaller && (
                <button
                  type="button"
                  onClick={handleTrySmaller}
                  disabled={variantStatus !== 'ready' || variantLoading || run.animating || ghostPlaying}
                  className="btn-hint"
                  aria-label={
                    variantStatus === 'ready'
                      ? 'Try a smaller version of this puzzle'
                      : 'Preparing a smaller version'
                  }
                >
                  <LightbulbIcon className="h-4 w-4" />
                  {variantStatus !== 'ready'
                    ? 'Preparing a smaller version…'
                    : variantLoading
                      ? 'Making one…'
                      : 'Try a smaller version'}
                </button>
              )}
              {aiExplainOn() && run.feedback?.status === 'incorrect' && lastAttempt && (
                <button
                  type="button"
                  onClick={handleExplain}
                  disabled={explainLoading || run.animating || ghostPlaying}
                  className="btn-hint"
                  aria-label="Ask Rico to explain my mistake"
                >
                  <CompassIcon className="h-4 w-4" />
                  {explainLoading ? 'Thinking…' : 'Explain my mistake'}
                </button>
              )}
            </div>
            {variantNotice && (
              <p className="text-sm text-muted" role="status" aria-live="polite">
                {variantNotice}
              </p>
            )}
          </aside>

          <div className="lesson-workspace space-y-4">
            <div className="puzzle-header puzzle-header--compact">
              <p className="section-label">{lesson.title}</p>
              <h1 className="puzzle-goal">{currentStep.goal}</h1>
              <ObjectivesChips map={currentStep.map} />
            </div>

            <div className="lesson-workspace__main">
              <div className="lesson-map-column" ref={mapColumnRef}>
                <MapGrid
                  map={currentStep.map}
                  {...run.frame}
                  facing={ghostPlaying ? ghostFacing : run.frame.facing}
                  crashed={run.crashed}
                  solved={run.solved}
                  loopStuck={run.loopStuck}
                  ghostPath={ghostPath}
                  ghostStep={ghostStep}
                />
              </div>

              <div className="lesson-workspace__controls space-y-4">
                {run.animating && run.chips.length > 0 ? (
                  <RunStrip chips={run.chips} activeIndex={run.frame.activeStepIndex} />
                ) : (
                  <CommandSequence
                    palette={paletteItems}
                    program={program}
                    disabled={run.animating || ghostPlaying}
                    loopRange={currentStep.loopRange}
                    predicateOptions={currentStep.predicateOptions}
                    iterations={iterations ?? undefined}
                    onChange={handleProgramChange}
                  />
                )}

                <div className="action-bar">
                  <button
                    type="button"
                    onClick={run.handleRun}
                    disabled={run.animating || ghostPlaying || program.length === 0}
                    className={`btn-success flex cursor-pointer items-center gap-2 ${run.animating ? 'animate-run-pulse' : ''}`}
                  >
                    <svg viewBox="0 0 24 24" className={`h-4 w-4 ${run.animating ? 'animate-pulse' : ''}`} aria-hidden="true">
                      <path d="M7 5l12 7-12 7z" fill="currentColor" />
                    </svg>
                    {run.animating ? 'Running…' : 'Run program'}
                  </button>
                  <button
                    type="button"
                    onClick={handleReset}
                    disabled={run.animating || ghostPlaying}
                    className="btn-ghost cursor-pointer"
                  >
                    Reset
                  </button>
                  {run.frame.counter !== undefined && (
                    <span className="steps-badge" aria-live="polite">
                      <span className="steps-badge__label">Steps</span>
                      <span className="steps-badge__value">{run.frame.counter}</span>
                    </span>
                  )}
                </div>

                {run.feedback?.status === 'correct' && (
                  <div className="next-bar">
                    <button
                      type="button"
                      onClick={handleShare}
                      className="btn-ghost next-bar__share animate-pop-in inline-flex items-center justify-center"
                      aria-label="Copy a link to share this puzzle"
                    >
                      {shareCopied ? (
                        <>
                          <CheckIcon className="h-4 w-4" /> Link copied!
                        </>
                      ) : (
                        <>
                          <ShareIcon className="h-4 w-4" /> Share this puzzle
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={goNext}
                      className="btn-primary next-bar__primary animate-pop-in"
                    >
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
          onResult={(correct) => { if (!isReplay) recordResult(lesson, currentStep.id, correct, []) }}
          onNext={goNext}
          priorFailCount={state?.stepStats[currentStep.id]?.incorrect ?? 0}
          isLastStep={stepIndex + 1 >= totalSteps}
        />
      )}
    </div>
  )
}

// #4: a self-contained, minimal player for the AI-generated "smaller version".
// It owns its own program/explorer/run state and reuses the same MapGrid +
// CommandSequence + checker as the main step, but never persists a saved program
// (the learner's real puzzle is left untouched). On a correct run it reports the
// solving instructions up to the parent and stays put so the learner can read
// the encouraging feedback and choose to head back.
function VariantPlayer({
  step,
  lessonTitle,
  onExit,
  onSolved,
}: {
  step: SequenceStep
  lessonTitle: string
  onExit: () => void
  onSolved: (instructions: Instruction[]) => void
}) {
  const palette = useMemo(() => buildPalette(step), [step])

  const [program, setProgram] = useState<ProgramNode[]>([])
  const [iterations, setIterations] = useState<Map<string, number> | null>(null)

  const mapColumnRef = useRef<HTMLDivElement>(null)

  const run = usePuzzleRun({
    map: step.map,
    stepMs: STEP_MS,
    check: () => checkProgram(specForStep(step), program.map(nodeToInstruction)),
    onStart: () => mapColumnRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }),
    onSettle: (outcome) => {
      setIterations(iterationMap(program, outcome.run))
      if (outcome.solved) onSolved(program.map(nodeToInstruction))
    },
  })

  function resetRun() {
    run.reset()
    setIterations(null)
  }

  function handleProgramChange(next: ProgramNode[]) {
    setProgram(next)
    resetRun()
  }

  function handleReset() {
    setProgram([])
    resetRun()
  }

  const bird: { message: string; mood: BirdMood } =
    run.feedback?.status === 'correct'
      ? { message: run.feedback.message, mood: 'celebrate' }
      : run.feedback?.status === 'incorrect'
        ? { message: run.feedback.message, mood: 'oops' }
        : { message: step.prompt, mood: 'explain' }

  return (
    <section className="lesson-play-layout">
      <aside className="lesson-guide-panel space-y-3">
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <span className="section-label">Smaller version</span>
          <button type="button" onClick={onExit} disabled={run.animating} className="btn-hint cursor-pointer">
            ← Back to your puzzle
          </button>
        </div>
        <BirdGuide {...bird} variant="sidebar" />
      </aside>

      <div className="lesson-workspace space-y-4">
        <div className="puzzle-header puzzle-header--compact">
          <p className="section-label">{lessonTitle} · warm-up</p>
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
              ghostPath={null}
              ghostStep={0}
            />
          </div>

          <div className="lesson-workspace__controls space-y-4">
            {run.animating && run.chips.length > 0 ? (
              <RunStrip chips={run.chips} activeIndex={run.frame.activeStepIndex} />
            ) : (
              <CommandSequence
                palette={palette}
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
                <svg viewBox="0 0 24 24" className={`h-4 w-4 ${run.animating ? 'animate-pulse' : ''}`} aria-hidden="true">
                  <path d="M7 5l12 7-12 7z" fill="currentColor" />
                </svg>
                {run.animating ? 'Running…' : 'Run program'}
              </button>
              <button type="button" onClick={handleReset} disabled={run.animating} className="btn-ghost cursor-pointer">
                Reset
              </button>
              {run.frame.counter !== undefined && (
                <span className="steps-badge" aria-live="polite">
                  <span className="steps-badge__label">Steps</span>
                  <span className="steps-badge__value">{run.frame.counter}</span>
                </span>
              )}
            </div>

            {run.feedback?.status === 'correct' && (
              <div className="next-bar">
                <button type="button" onClick={onExit} className="btn-primary animate-pop-in">
                  Back to your puzzle
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
