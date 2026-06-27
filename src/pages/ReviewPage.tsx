import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Lesson, MapConfig } from '../types'
import { useLearner } from '../context/LearnerContext'
import { registerGeneratedPuzzle } from '../content/registry'
import { listLessons } from '../content/registry'
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
import { dueSkills } from '../adaptivity/mastery'
import { reviewItemForSkill } from '../content/reviewItems'
import type { ReviewItem } from '../content/reviewItems'
import { supportLevel, difficultyForBox } from '../adaptivity/leitner'
import type { Box } from '../adaptivity/leitner'
import { masteryTier } from '../storage/progress'
import type { SequenceStep, ConditionalStep } from '../types'
import { isSequenceStep, isConditionalStep } from '../types'

// Stand-in map for the hook before a review puzzle has loaded (the player isn't
// shown until `step` exists, so no Run ever plays on it).
const FALLBACK_MAP: MapConfig = { rows: 1, cols: 1, start: { row: 0, col: 0 }, goal: { row: 0, col: 0 } }

// Per-skill recap entry: captured at session start (before boxes mutate).
interface RecapEntry {
  skillId: string
  beforeBox: Box
}

// Resolve the backing lesson for a skill id — same scan as authoredItemForSkill.
function lessonForSkill(skillId: string): Lesson | null {
  for (const lesson of listLessons()) {
    if (lesson.skillIds.includes(skillId)) return lesson
  }
  return null
}

// Convert an authored ReviewItem puzzle into a playable SequenceStep shape,
// honouring blankEditor: always start with an empty program.
function puzzleToStep(item: ReviewItem): SequenceStep | ConditionalStep {
  return item.puzzle
}

function initialNodesFor(step: SequenceStep | ConditionalStep): ProgramNode[] {
  // blankEditor: always start empty regardless of any initialProgram.
  return []
}

// Convert difficultyForBox's absolute level (3/4/5) to a DifficultyDirection
// for buildPracticeTemplate.
function boxToDirection(box: Box): 'easier' | 'same' | 'harder' {
  const level = difficultyForBox(box)
  if (level <= 3) return 'easier'
  if (level === 4) return 'same'
  return 'harder'
}

export function ReviewPage() {
  useAiEnabled() // re-renders on AI Preference change
  const { ready, activeLearner, state, recordReview } = useLearner()

  // Snapshot the due-skills queue once per session (computed from dueSkills at
  // mount time). Using a ref prevents the session from reshuffling mid-play when
  // recordReview mutates state (which would recompute dueSkills).
  const queueRef = useRef<string[] | null>(null)
  // Capture per-skill box before any recording, for the recap end screen.
  const recapRef = useRef<RecapEntry[] | null>(null)

  if (queueRef.current === null && state) {
    const now = Date.now()
    const skills = dueSkills(state, now)
    queueRef.current = skills
    recapRef.current = skills.map((skillId) => ({
      skillId,
      beforeBox: (state.review?.boxes?.[skillId]?.box ?? 1) as Box,
    }))
  }

  const queue = queueRef.current ?? []

  const [index, setIndex] = useState(0)
  const [currentItem, setCurrentItem] = useState<ReviewItem | null>(null)
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null)
  const [loading, setLoading] = useState(true)
  const [done, setDone] = useState(false)
  const [completedCount, setCompletedCount] = useState(0)
  // outcome tracks the terminal result for the current item (null = not settled yet).
  const [outcome, setOutcome] = useState<'solved' | 'failed' | null>(null)

  const [program, setProgram] = useState<ProgramNode[]>([])
  const [iterations, setIterations] = useState<Map<string, number> | null>(null)
  const [celebrate, setCelebrate] = useState(false)

  const timers = useRef<number[]>([])
  const mapColumnRef = useRef<HTMLDivElement>(null)
  const busyRef = useRef(false)
  const loadedRef = useRef(false)
  const isMounted = useRef(true)
  // Guards one-time outcome recording per item — reset on each load.
  const recordedRef = useRef(false)
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

  // The step we pass to the engine — derived from currentItem.
  const step = currentItem ? puzzleToStep(currentItem) : null

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
    onSettle: (settleOutcome) => {
      setIterations(iterationMap(program, settleOutcome.run))

      // Record the terminal outcome exactly once per item (first settle wins).
      // This covers both correct and incorrect — wrong runs record box reset,
      // correct runs record box promote. Subsequent retries after a fail are
      // cosmetic-only (no re-record).
      if (!recordedRef.current && currentItem && currentLesson) {
        recordedRef.current = true
        const solved = settleOutcome.solved

        // Record review (both outcomes: correct and incorrect).
        recordReview(currentLesson, currentItem.skillId, currentItem.puzzle.id, solved)

        if (solved) {
          setCelebrate(true)
          const clearCelebrate = window.setTimeout(() => setCelebrate(false), 2000)
          timers.current.push(clearCelebrate)
          setCompletedCount((c) => c + 1)
          setOutcome('solved')
          clearReview(currentLesson.id)
        } else {
          setOutcome('failed')
        }
      }
    },
  })

  const resetPlayState = useCallback(() => {
    clearTimers()
    setIterations(null)
    setCelebrate(false)
    setProgram([])
    setOutcome(null)
  }, [clearTimers])

  // Keep the next few review lessons warming in the background (AI path only).
  const warmAhead = useCallback((q: string[], from: number) => {
    if (!aiGenerationOn()) return
    // Map skill ids back to lesson ids for the prefetch API.
    const lessonQueue = q.map((skillId) => lessonForSkill(skillId)?.id ?? '').filter(Boolean)
    warmReviewAhead(lessonQueue, from, stateRef.current)
  }, [])

  // Load the review item at queue position `start`.
  // Authored path: always uses reviewItemForSkill. AI upgrade: only when aiGenerationOn().
  const loadReview = useCallback(
    async (start: number) => {
      if (busyRef.current) return
      busyRef.current = true
      try {
        const q = queueRef.current ?? []
        setLoading(true)
        setCurrentItem(null)
        setCurrentLesson(null)
        resetPlayState()

        let cursor = start

        while (cursor < q.length) {
          const skillId = q[cursor]
          const boxEntry = stateRef.current?.review?.boxes?.[skillId] ?? null
          const box: Box = (boxEntry?.box ?? 1) as Box
          const lesson = lessonForSkill(skillId)

          if (!lesson) {
            cursor += 1
            continue
          }

          let item: ReviewItem
          try {
            item = reviewItemForSkill(skillId, box)
          } catch {
            // No authored puzzle for this skill — skip it.
            cursor += 1
            continue
          }

          // AI upgrade: when generation is on, swap in a generated variant at
          // box-appropriate difficulty. Falls back to authored if generation
          // abstains or fails.
          if (aiGenerationOn() && conceptForLesson(lesson) !== null) {
            try {
              // warmReview uses the per-lesson cache from reviewPrefetch.
              const generated = await warmReview(lesson, stateRef.current, box)
              if (!isMounted.current) return
              if (generated) {
                registerGeneratedPuzzle(`review-${lesson.id}`, generated)
                const practiceStep = toPracticeStep(generated, lesson)
                if (practiceStep && (isSequenceStep(practiceStep as any) || isConditionalStep(practiceStep as any))) {
                  item = {
                    skillId,
                    box,
                    puzzle: practiceStep as unknown as SequenceStep,
                    source: 'generated',
                    blankEditor: true,
                  }
                }
              }
            } catch {
              // Generation failed — keep the authored item.
            }
          }

          if (!isMounted.current) return

          recordedRef.current = false
          setCurrentItem(item)
          setCurrentLesson(lesson)
          setProgram(initialNodesFor(item.puzzle))
          setIndex(cursor)
          warmAhead(q, cursor + 1)
          return
        }

        // Exhausted all items.
        setIndex(q.length)
        setDone(true)
      } catch {
        if (isMounted.current) setDone(true)
      } finally {
        if (isMounted.current) setLoading(false)
        busyRef.current = false
      }
    },
    [resetPlayState, warmAhead, recordReview],
  )

  useEffect(() => {
    if (!ready || !activeLearner || !state) return
    if (loadedRef.current) return
    loadedRef.current = true
    // queue is snapshotted from state above (queueRef); by the time this effect
    // runs with a non-null state, queueRef.current is already populated.
    const q = queueRef.current ?? []
    if (q.length === 0) {
      setDone(true)
      setLoading(false)
      return
    }
    void loadReview(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, activeLearner, state])

  const paletteItems = useMemo(() => (step ? buildPalette(step) : []), [step])

  function resetRun() {
    clearTimers()
    run.reset()
    setIterations(null)
    setCelebrate(false)
  }

  // Reset clears the placed blocks back to empty (blankEditor).
  function handleReset() {
    setProgram([])
    resetRun()
    // Allow re-recording if the user resets after a wrong run — they get another
    // attempt without re-recording.
    // NOTE: We do NOT reset recordedRef here: if outcome was already recorded we
    // don't want to double-count. The "faded" re-attempt after fail is purely
    // cosmetic. For consistent UX, keep the outcome locked once recorded.
  }

  function handleProgramChange(next: ProgramNode[]) {
    setProgram(next)
    resetRun()
  }

  // Scaffolding level from the item's Leitner box.
  const scaffold = currentItem ? supportLevel(currentItem.box) : null

  function bird(): { message: string; mood: BirdMood } {
    if (run.feedback?.status === 'correct') return { message: run.feedback.message, mood: 'celebrate' }
    if (run.feedback?.status === 'incorrect') {
      // For 'faded' items, only show explain after a wrong run (not up-front).
      return { message: run.feedback.message, mood: 'oops' }
    }
    if (step) {
      // For 'supported': show hints up-front in the prompt.
      if (scaffold === 'supported' && step.feedback?.hints?.length) {
        return { message: `${step.prompt} Hint: ${step.feedback.hints[0]}`, mood: 'explain' }
      }
      return { message: step.prompt, mood: 'explain' }
    }
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
          <BirdGuide message="Give me a sec — I'm pulling up your next review…" mood="explain" typewriter={false} />
        </div>
      ) : done || (!currentItem && !loading) ? (
        // Session end: show mastery recap if we reviewed anything, or "All caught up".
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
          {recapRef.current && recapRef.current.length > 0 ? (
            <>
              {completedCount > 0 && (
                <p className="mt-2 text-muted">
                  Nice reviewing — you finished {completedCount} review{completedCount === 1 ? '' : 's'} today.
                </p>
              )}
              {/* Mastery recap: per-skill box change and tier — shown for all sessions
                  (solved OR failed) so box resets are always visible. */}
              <div className="mt-4 space-y-2 text-left" data-testid="mastery-recap">
                {recapRef.current.map(({ skillId, beforeBox }) => {
                  const skillStat = state.skillStats[skillId]
                  const tier = masteryTier(skillStat)
                  const afterBox = state.review?.boxes?.[skillId]?.box ?? beforeBox
                  const boxChanged = afterBox !== beforeBox
                  const promoted = afterBox > beforeBox
                  return (
                    <div key={skillId} className="flex items-center justify-between rounded-lg bg-surface-alt px-3 py-2">
                      <span className="font-medium capitalize">{skillId}</span>
                      <span className="flex items-center gap-2 text-sm text-muted">
                        {boxChanged ? (
                          <span>
                            Box {beforeBox}→{afterBox} {promoted ? '↑' : '↓'}
                          </span>
                        ) : (
                          <span>Box {beforeBox}</span>
                        )}
                        <span className="step-badge">{tier}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <p className="mt-2 text-muted">Nothing to review today. Come back tomorrow!</p>
          )}
          <Link to="/app" className="btn-primary mt-6 inline-block">
            Back home
          </Link>
        </div>
      ) : (
        <section className="lesson-play-layout">
          <aside className="lesson-guide-panel space-y-3">
            <BirdGuide {...bird()} variant="sidebar" />
            {/* Neutral: show hints on request (below the bird) */}
            {scaffold === 'neutral' && step?.feedback?.hints && step.feedback.hints.length > 0 && !run.solved && !outcome && (
              <details className="rounded-lg border border-border px-3 py-2 text-sm">
                <summary className="cursor-pointer text-muted">Need a hint?</summary>
                <ul className="mt-2 space-y-1 text-muted">
                  {step.feedback.hints.map((h, i) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              </details>
            )}
          </aside>

          <div className="lesson-workspace space-y-4">
            <div className="puzzle-header puzzle-header--compact">
              <p className="section-label inline-flex items-center gap-1">
                <SparkleIcon className="h-3.5 w-3.5" /> Review puzzle
                {currentItem && (
                  <span className="ml-1 text-xs text-muted">
                    · Box {currentItem.box} · {scaffold === 'supported' ? 'Guided' : scaffold === 'neutral' ? 'Standard' : 'Challenge'}
                  </span>
                )}
              </p>
              <h1 className="puzzle-goal">{step?.goal}</h1>
              {step && <ObjectivesChips map={step.map} />}
            </div>

            <div className="lesson-workspace__main">
              <div className="lesson-map-column" ref={mapColumnRef}>
                <MapGrid
                  map={step?.map ?? FALLBACK_MAP}
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
                    loopRange={step?.loopRange}
                    predicateOptions={step?.predicateOptions}
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

                {/* Advance affordances */}
                {outcome === 'solved' && (
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
                {outcome === 'failed' && (
                  <div className="next-bar flex gap-2">
                    {/* Faded: explain after wrong run */}
                    {scaffold === 'faded' && step?.feedback?.hints && step.feedback.hints.length > 0 && (
                      <details className="rounded-lg border border-border px-3 py-2 text-sm">
                        <summary className="cursor-pointer text-muted">See hint</summary>
                        <ul className="mt-1 space-y-1 text-muted">
                          {step.feedback.hints.map((h, i) => (
                            <li key={i}>{h}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <button
                      type="button"
                      onClick={() => void loadReview(index + 1)}
                      className="btn-secondary animate-pop-in"
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
