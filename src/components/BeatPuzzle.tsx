import { useEffect, useMemo, useRef, useState } from 'react'
import type { BeatAction, BeatStep, Command, Instruction } from '../types'
import { isAction } from '../types'
import { checkBeatProgram, expectedActions } from '../engine/beat'
import type { BeatCheckResult } from '../engine/beat'
import { CommandSequence } from './CommandSequence'
import type { PaletteItem, ProgramNode } from './CommandSequence'
import { BeatLane } from './BeatLane'
import { BirdGuide, type BirdMood } from './BirdGuide'
import { LightbulbIcon, CompassIcon } from './icons'
import { pickHint } from '../lib/hints'
import { playSound } from '../lib/sound'
import { aiExplainOn } from '../ai/config'
import { useAiEnabled } from '../lib/useAiEnabled'
import { explainBeatMistake } from '../ai/explainBeat'

const STEP_MS = 260

function nodeToInstruction(node: ProgramNode): Instruction {
  if (node.kind === 'move') return node.command
  if (node.kind === 'action') return node.action
  if (node.kind === 'loop') {
    return { kind: 'loop', count: node.count, body: node.body.map(nodeToInstruction), label: `Repeat ${node.count}×` }
  }
  if (node.kind === 'while') {
    return { kind: 'while', predicate: node.predicate, body: node.body.map(nodeToInstruction), label: node.predicateLabel }
  }
  return {
    kind: 'conditional',
    predicate: node.predicate,
    then: node.then.map(nodeToInstruction),
    else: node.else.map(nodeToInstruction),
    label: node.predicateLabel,
  }
}

function isProgramNodeArray(value: unknown): value is ProgramNode[] {
  return (
    Array.isArray(value) &&
    value.every((node) => !!node && typeof node === 'object' && 'kind' in (node as object) && 'id' in (node as object))
  )
}

function instructionToNode(inst: Instruction): ProgramNode {
  const id = Math.random().toString(36).slice(2)
  if (typeof inst === 'string') {
    if (isAction(inst)) return { id, kind: 'action', action: inst }
    return { id, kind: 'move', command: inst as Command }
  }
  if (inst.kind === 'loop') {
    return { id, kind: 'loop', count: inst.count, body: inst.body.map(instructionToNode) }
  }
  if (inst.kind === 'while') {
    return { id, kind: 'while', predicate: inst.predicate, predicateLabel: inst.label, body: inst.body.map(instructionToNode) }
  }
  return {
    id,
    kind: 'if',
    predicate: inst.predicate,
    predicateLabel: inst.label,
    then: inst.then.map(instructionToNode),
    else: inst.else.map(instructionToNode),
  }
}

// A restored program is only valid for a beat step if every leaf is one of the
// step's beat actions. This discards stale saved programs from the old
// board-based FizzBuzz (which contained move cards like Right/Up).
function isBeatProgramValid(nodes: ProgramNode[], allowed: Set<string>): boolean {
  for (const node of nodes) {
    if (node.kind === 'move') return false
    if (node.kind === 'action' && !allowed.has(node.action)) return false
    if (node.kind === 'loop' || node.kind === 'while') {
      if (!isBeatProgramValid(node.body, allowed)) return false
    }
    if (node.kind === 'if') {
      if (!isBeatProgramValid(node.then, allowed) || !isBeatProgramValid(node.else, allowed)) return false
    }
  }
  return true
}

function buildPalette(step: BeatStep): PaletteItem[] {
  const limits = step.cardLimits ?? {}
  const actions: PaletteItem[] = step.availableActions.map((action) => ({
    key: `a-${action}`,
    kind: 'action',
    action,
    limit: limits[action],
  }))
  const blocks: PaletteItem[] = (step.blocks ?? []).map((kind) => ({ key: `b-${kind}`, kind, limit: limits[kind] }))
  return [...actions, ...blocks]
}

interface BeatPuzzleProps {
  step: BeatStep
  savedProgram?: unknown
  onProgramChange?: (program: ProgramNode[]) => void
  onResult: (correct: boolean) => void
  onNext: () => void
  isLastStep: boolean
}

export function BeatPuzzle({
  step,
  savedProgram,
  onProgramChange,
  onResult,
  onNext,
  isLastStep,
}: BeatPuzzleProps) {
  useAiEnabled() // re-renders on AI Preference change
  const [program, setProgram] = useState<ProgramNode[]>([])
  const [playedActions, setPlayedActions] = useState<(BeatAction | undefined)[]>([])
  const [activeBeat, setActiveBeat] = useState<number | null>(null)
  const [check, setCheck] = useState<BeatCheckResult | null>(null)
  const [playing, setPlaying] = useState(false)
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null)
  const [manualHintLevel, setManualHintLevel] = useState(0)
  const [explainText, setExplainText] = useState<string | null>(null)
  const [explainLoading, setExplainLoading] = useState(false)
  const [demoBeat, setDemoBeat] = useState<number | null>(null)
  const timers = useRef<number[]>([])

  // The hazard incoming on each beat (the engine's ground truth), shown on the
  // lane so kids can see what they are dashing/shielding against.
  const threats = useMemo(() => expectedActions(step), [step])

  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id))
    timers.current = []
  }

  // Reset everything when the step changes.
  useEffect(() => {
    clearTimers()
    const allowed = new Set<string>(step.availableActions)
    const restored = isProgramNodeArray(savedProgram) ? savedProgram : null
    const validRestored = restored && restored.length > 0 && isBeatProgramValid(restored, allowed)
    if (validRestored) setProgram(restored)
    else if (step.initialProgram) setProgram(step.initialProgram.map(instructionToNode))
    else {
      setProgram([])
      // Clear a stale saved program (e.g. from the old board FizzBuzz).
      if (restored) onProgramChange?.([])
    }
    setPlayedActions([])
    setActiveBeat(null)
    setCheck(null)
    setPlaying(false)
    setFeedback(null)
    setManualHintLevel(0)
    setExplainText(null)
    setExplainLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id])

  useEffect(() => () => clearTimers(), [])

  // Idle demo: keep the beat visibly running so the hazards read as "incoming".
  // Pauses during a real run and once solved; respects reduced motion.
  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (playing || feedback === 'correct' || reduced) {
      setDemoBeat(null)
      return
    }
    let beat = 0
    setDemoBeat(0)
    const id = window.setInterval(() => {
      beat = (beat + 1) % step.count
      setDemoBeat(beat)
    }, 380)
    return () => window.clearInterval(id)
  }, [playing, feedback, step.id, step.count])

  const firstWrongBeat = feedback ? (check?.firstWrongBeat ?? null) : null
  const hintCount = step.feedback.hints.length
  // Hints appear ONLY when the learner asks for one — never auto-revealed on a
  // failed run. Matches LessonPage's click-only hint behavior.
  const hintLevel = manualHintLevel
  const activeHint = hintLevel > 0 ? pickHint(step.feedback.hints, hintLevel - 1) : null
  const canAskHint = hintLevel < hintCount

  function resetRun() {
    clearTimers()
    setPlayedActions([])
    setActiveBeat(null)
    setCheck(null)
    setPlaying(false)
    setFeedback(null)
    setExplainText(null)
    setExplainLoading(false)
  }

  function handleProgramChange(next: ProgramNode[]) {
    setProgram(next)
    onProgramChange?.(next)
    resetRun()
  }

  function handlePlay() {
    if (playing) return
    const instructions = program.map(nodeToInstruction)
    const result = checkBeatProgram(step, instructions)
    clearTimers()
    setCheck(result)
    setPlaying(true)
    setFeedback(null)
    setExplainText(null)
    setPlayedActions([])
    playSound('runStart')

    const stopAt = result.firstWrongBeat ?? step.count - 1
    for (let beat = 0; beat <= stopAt; beat++) {
      const timer = window.setTimeout(() => {
        setActiveBeat(beat)
        setPlayedActions((prev) => {
          const next = prev.slice()
          next[beat] = result.got[beat]
          return next
        })
        playSound('step')
      }, beat * STEP_MS)
      timers.current.push(timer)
    }

    const endTimer = window.setTimeout(
      () => {
        setActiveBeat(null)
        setPlaying(false)
        setFeedback(result.correct ? 'correct' : 'incorrect')
        playSound(result.correct ? 'success' : 'error')
        onResult(result.correct)
      },
      (stopAt + 1) * STEP_MS + 60,
    )
    timers.current.push(endTimer)
  }

  function handleHint() {
    if (!canAskHint) return
    playSound('click')
    setManualHintLevel(hintLevel + 1)
  }

  async function handleExplain() {
    if (feedback !== 'incorrect' || check?.firstWrongBeat == null || explainLoading) return
    const beat = check.firstWrongBeat
    setExplainLoading(true)
    playSound('click')
    try {
      const res = await explainBeatMistake(step, beat, check.got[beat])
      setExplainText(res.text)
    } finally {
      setExplainLoading(false)
    }
  }

  function bird(): { message: string; mood: BirdMood } {
    if (explainLoading) return { message: 'Hmm, let me look at that beat…', mood: 'explain' }
    if (explainText) return { message: explainText, mood: 'oops' }
    if (feedback === 'correct') return { message: step.feedback.correct, mood: 'celebrate' }
    if (feedback === 'incorrect' && check?.firstWrongBeat != null) {
      return { message: `Rico got clipped on beat ${check.firstWrongBeat}. Look at what your rule did there.`, mood: 'oops' }
    }
    return { message: step.prompt, mood: 'explain' }
  }

  const laneMood = feedback === 'correct' ? 'celebrate' : feedback === 'incorrect' ? 'oops' : 'explain'

  return (
    <section className="lesson-play-layout">
      <aside className="lesson-guide-panel space-y-3">
        <BirdGuide {...bird()} variant="sidebar" />
        {activeHint && (
          <div className="hint-panel animate-pop-in">
            <div className="hint-panel__icon" aria-hidden="true">
              <LightbulbIcon className="h-4 w-4" />
            </div>
            <p className="hint-panel__text">{activeHint}</p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
          <button
            type="button"
            onClick={handleHint}
            disabled={!canAskHint || playing}
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
          {aiExplainOn() && feedback === 'incorrect' && check?.firstWrongBeat != null && (
            <button
              type="button"
              onClick={handleExplain}
              disabled={explainLoading || playing}
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
          <p className="section-label">Dodge the Beat</p>
          <h1 className="puzzle-goal">{step.goal}</h1>
        </div>

        <BeatLane
          step={step}
          threats={threats}
          playedActions={playedActions}
          activeBeat={activeBeat}
          demoBeat={playing || feedback ? null : demoBeat}
          firstWrongBeat={firstWrongBeat}
          mood={laneMood}
        />

        <CommandSequence
          palette={buildPalette(step)}
          program={program}
          disabled={playing}
          loopRange={step.loopRange}
          predicateOptions={step.predicateOptions}
          onChange={handleProgramChange}
        />

        <div className="action-bar">
          <button
            type="button"
            onClick={handlePlay}
            disabled={playing || program.length === 0}
            className={`btn-success flex cursor-pointer items-center gap-2 ${playing ? 'animate-run-pulse' : ''}`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
              <path d="M7 5l12 7-12 7z" fill="currentColor" />
            </svg>
            {playing ? 'Playing…' : 'Play the beat'}
          </button>
          <button type="button" onClick={resetRun} disabled={playing} className="btn-ghost cursor-pointer">
            Reset
          </button>
        </div>

        {feedback === 'correct' && (
          <div className="next-bar">
            <button type="button" onClick={onNext} className="btn-primary animate-pop-in">
              {isLastStep ? 'Finish' : 'Next'}
            </button>
          </div>
        )}
      </div>
    </section>
  )
}
