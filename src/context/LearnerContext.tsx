import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Instruction, Lesson, Step } from '../types'
import type { AiUsage, LearnerProfile, LearnerState } from '../storage/types'
import * as backend from '../storage/backend'
import * as progress from '../storage/progress'
import { evaluateBadges } from '../content/badges'
import type { AwardCtx } from '../content/badges'

export interface RecordResultOpts {
  program?: Instruction[]
  optimalSolved?: boolean
  solveMs?: number
}

interface LearnerContextValue {
  ready: boolean
  learners: LearnerProfile[]
  activeLearner: LearnerProfile | null
  state: LearnerState | null
  pendingBadges: string[]
  saving: boolean
  saveError: string | null
  createLearner: (name: string) => void
  deleteLearner: (id: string) => void
  selectLearner: (id: string) => void
  signOut: () => void
  ensureLesson: (lesson: Lesson) => void
  saveProgram: (lessonId: string, stepId: string, program: unknown) => void
  setCurrentStep: (lessonId: string, stepId: string) => void
  completeConcept: (lesson: Lesson, stepId: string) => void
  recordResult: (
    lesson: Lesson,
    stepId: string,
    correct: boolean,
    commands: Step[],
    opts?: RecordResultOpts,
  ) => void
  recordPracticeResult: (
    lesson: Lesson,
    stepId: string,
    correct: boolean,
    opts?: RecordResultOpts,
  ) => void
  recordReview: (lesson: Lesson, skillId: string, stepId: string, correct: boolean) => void
  tickTimers: () => void
  consumePendingBadges: () => string[]
  clearPendingBadges: () => void
  restartLesson: (lesson: Lesson) => void
}

const LearnerContext = createContext<LearnerContextValue | null>(null)

function mergeAiUsage(current: AiUsage, delta: Partial<AiUsage>): AiUsage {
  return {
    explainRequested: current.explainRequested + (delta.explainRequested ?? 0),
    explainServed: current.explainServed + (delta.explainServed ?? 0),
    explainFallback: current.explainFallback + (delta.explainFallback ?? 0),
    explainLeakBlocked: current.explainLeakBlocked + (delta.explainLeakBlocked ?? 0),
    genServed: current.genServed + (delta.genServed ?? 0),
    genAbstained: current.genAbstained + (delta.genAbstained ?? 0),
  }
}

export function LearnerProvider({ ownerKey, children }: { ownerKey: string; children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [learners, setLearners] = useState<LearnerProfile[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [learnerState, setLearnerState] = useState<LearnerState | null>(null)
  const [pendingBadges, setPendingBadges] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const stateRef = useRef<LearnerState | null>(null)
  const pendingSaveRef = useRef<LearnerState | null>(null)
  const savingRef = useRef(false)
  const ownerVersionRef = useRef(0)

  useEffect(() => {
    stateRef.current = learnerState
  }, [learnerState])

  useEffect(() => {
    ownerVersionRef.current += 1
    pendingSaveRef.current = null
    savingRef.current = false
    setSaving(false)
    setSaveError(null)
  }, [ownerKey])

  const installState = useCallback((loaded: LearnerState) => {
    const migrated = progress.migrate(loaded)
    stateRef.current = migrated
    setLearnerState(migrated)
    return migrated
  }, [])

  // Load this owner's profiles whenever the signed-in parent (ownerKey) changes.
  useEffect(() => {
    let cancelled = false
    setReady(false)
    void (async () => {
      const existing = await backend.listLearners(ownerKey)
      if (cancelled) return
      setLearners(existing)
      const storedActive = backend.getActiveLearnerId(ownerKey)
      if (storedActive && existing.some((profile) => profile.id === storedActive)) {
        const loaded = await backend.loadState(ownerKey, storedActive)
        if (cancelled) return
        setActiveId(storedActive)
        installState(loaded)
      } else {
        setActiveId(null)
        stateRef.current = null
        setLearnerState(null)
      }
      setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [ownerKey, installState])

  const drainSaveQueue = useCallback(() => {
    if (savingRef.current) return
    const next = pendingSaveRef.current
    if (!next) return
    pendingSaveRef.current = null
    savingRef.current = true
    setSaving(true)
    const ownerVersion = ownerVersionRef.current
    void backend.saveState(ownerKey, next)
      .catch((error) => {
        if (ownerVersion !== ownerVersionRef.current) return
        console.error('Failed to save progress', error)
        setSaveError('Progress could not be saved yet. Check your connection, then keep this tab open.')
      })
      .finally(() => {
        if (ownerVersion !== ownerVersionRef.current) return
        savingRef.current = false
        if (pendingSaveRef.current) {
          drainSaveQueue()
        } else {
          setSaving(false)
        }
      })
  }, [ownerKey])

  const queueStateSave = useCallback(
    (next: LearnerState) => {
      pendingSaveRef.current = next
      setSaveError(null)
      drainSaveQueue()
    },
    [drainSaveQueue],
  )

  const persist = useCallback(
    (next: LearnerState) => {
      // Optimistic: update UI immediately, then persist in order. Mobile browsers
      // can resolve whole-state Firestore writes out of order; coalescing while a
      // save is in flight guarantees the final remote write is the latest state
      // (e.g. completed lesson beats older saved-program/current-step writes).
      stateRef.current = next
      setLearnerState(next)
      queueStateSave(next)
    },
    [queueStateSave],
  )

  const mutate = useCallback(
    (fn: (current: LearnerState) => LearnerState) => {
      const current = stateRef.current
      if (!current) return
      persist(fn(current))
    },
    [persist],
  )

  // Awards any newly-earned badges for an attempt context, stashing the new ids
  // in pendingBadges so pages can surface them once.
  const applyBadges = useCallback((next: LearnerState, ctx: AwardCtx): LearnerState => {
    const newIds = evaluateBadges(ctx)
    if (newIds.length === 0) return next
    setPendingBadges((prev) => [...prev, ...newIds.filter((id) => !prev.includes(id))])
    const now = Date.now()
    return {
      ...next,
      badges: [...next.badges, ...newIds],
      badgeAcquiredAt: { ...next.badgeAcquiredAt, ...Object.fromEntries(newIds.map((id) => [id, now])) },
    }
  }, [])

  const createLearner = useCallback(
    (name: string) => {
      void (async () => {
        const profile = await backend.createLearner(ownerKey, name)
        const updated = await backend.listLearners(ownerKey)
        backend.setActiveLearnerId(ownerKey, profile.id)
        setLearners(updated)
        setActiveId(profile.id)
        const loaded = await backend.loadState(ownerKey, profile.id)
        installState(loaded)
      })()
    },
    [ownerKey, installState],
  )

  const deleteLearner = useCallback(
    (id: string) => {
      void (async () => {
        await backend.deleteLearner(ownerKey, id)
        const updated = await backend.listLearners(ownerKey)
        setLearners(updated)
        setActiveId((current) => {
          if (current === id) {
            backend.setActiveLearnerId(ownerKey, null)
            stateRef.current = null
            setLearnerState(null)
            return null
          }
          return current
        })
      })()
    },
    [ownerKey],
  )

  const selectLearner = useCallback(
    (id: string) => {
      backend.setActiveLearnerId(ownerKey, id)
      setActiveId(id)
      void (async () => {
        const loaded = await backend.loadState(ownerKey, id)
        installState(loaded)
      })()
    },
    [ownerKey, installState],
  )

  const flushTelemetry = useCallback(async (): Promise<void> => {
    // The AI telemetry layer owns its own in-memory counters; another agent may
    // expose `snapshotAndReset` to hand back deltas. Dynamic import + `as any`
    // keeps this decoupled: if the export is absent we simply no-op.
    try {
      const current = stateRef.current
      if (!current) return
      const mod = await import('../ai/telemetry')
      const snap = (mod as any).snapshotAndReset?.() as Partial<AiUsage> | undefined
      if (!snap) return
      const merged = { ...current, aiUsage: mergeAiUsage(current.aiUsage, snap) }
      stateRef.current = merged
      setLearnerState(merged)
      queueStateSave(merged)
    } catch {
      /* telemetry is best-effort */
    }
  }, [queueStateSave])

  const signOut = useCallback(() => {
    // Close out running timers and fold in any pending telemetry before we
    // drop the in-memory state.
    const current = stateRef.current
    if (current) {
      const ticked = progress.tickTimers(current)
      queueStateSave(ticked)
      void (async () => {
        try {
          const mod = await import('../ai/telemetry')
          const snap = (mod as any).snapshotAndReset?.() as Partial<AiUsage> | undefined
          if (snap) {
            const merged = { ...ticked, aiUsage: mergeAiUsage(ticked.aiUsage, snap) }
            queueStateSave(merged)
          }
        } catch {
          /* best-effort */
        }
      })()
    }
    backend.setActiveLearnerId(ownerKey, null)
    setActiveId(null)
    stateRef.current = null
    setLearnerState(null)
    setPendingBadges([])
  }, [ownerKey, queueStateSave])

  const ensureLesson = useCallback(
    (lesson: Lesson) => mutate((current) => progress.ensureLesson(current, lesson)),
    [mutate],
  )
  const saveProgram = useCallback(
    (lessonId: string, stepId: string, program: unknown) =>
      mutate((current) => progress.saveProgram(current, lessonId, stepId, program)),
    [mutate],
  )
  const setCurrentStep = useCallback(
    (lessonId: string, stepId: string) => mutate((current) => progress.setCurrentStep(current, lessonId, stepId)),
    [mutate],
  )
  const completeConcept = useCallback(
    (lesson: Lesson, stepId: string) => mutate((current) => progress.completeConcept(current, lesson, stepId)),
    [mutate],
  )
  const recordResult = useCallback(
    (lesson: Lesson, stepId: string, correct: boolean, commands: Step[], opts?: RecordResultOpts) =>
      mutate((current) => {
        const priorIncorrect = current.stepStats[stepId]?.incorrect ?? 0
        const next = progress.recordSequenceResult(current, lesson, stepId, correct, commands)
        const ctx: AwardCtx = {
          state: next,
          lesson,
          stepId,
          correct,
          source: 'lesson',
          program: opts?.program ?? [],
          optimalSolved: opts?.optimalSolved ?? false,
          priorIncorrect,
          solveMs: opts?.solveMs ?? 0,
        }
        return applyBadges(next, ctx)
      }),
    [mutate, applyBadges],
  )
  const recordPracticeResultAction = useCallback(
    (lesson: Lesson, stepId: string, correct: boolean, opts?: RecordResultOpts) =>
      mutate((current) => {
        const priorIncorrect = current.stepStats[stepId]?.incorrect ?? 0
        const next = progress.recordPracticeResult(current, lesson, stepId, correct)
        const ctx: AwardCtx = {
          state: next,
          lesson,
          stepId,
          correct,
          source: 'practice',
          program: opts?.program ?? [],
          optimalSolved: opts?.optimalSolved ?? false,
          priorIncorrect,
          solveMs: opts?.solveMs ?? 0,
        }
        return applyBadges(next, ctx)
      }),
    [mutate, applyBadges],
  )
  const recordReview = useCallback(
    (lesson: Lesson, skillId: string, stepId: string, correct: boolean) =>
      mutate((current) => {
        const priorIncorrect = current.stepStats[stepId]?.incorrect ?? 0
        const next = progress.recordReview(current, lesson, skillId, stepId, correct)
        const ctx: AwardCtx = {
          state: next,
          lesson,
          stepId,
          correct,
          source: 'practice',
          program: [],
          optimalSolved: false,
          priorIncorrect,
          solveMs: 0,
        }
        return applyBadges(next, ctx)
      }),
    [mutate, applyBadges],
  )
  const tickTimersAction = useCallback(() => mutate((current) => progress.tickTimers(current)), [mutate])
  const consumePendingBadges = useCallback(() => {
    const out = pendingBadges
    setPendingBadges([])
    return out
  }, [pendingBadges])
  const clearPendingBadges = useCallback(() => setPendingBadges([]), [])
  const restartLesson = useCallback(
    (lesson: Lesson) => mutate((current) => progress.restartLesson(current, lesson)),
    [mutate],
  )

  const flushLatestProgress = useCallback(() => {
    const current = stateRef.current
    if (!current) return
    const ticked = progress.tickTimers(current)
    stateRef.current = ticked
    setLearnerState(ticked)
    queueStateSave(ticked)
  }, [queueStateSave])

  // Fold AI telemetry deltas into persisted state on a cadence, and flush
  // running step timers when the page is hidden or unloaded.
  useEffect(() => {
    const flush = () => {
      void flushTelemetry()
      flushLatestProgress()
    }
    const interval = setInterval(() => void flushTelemetry(), 5000)
    const onHide = () => flush()
    window.addEventListener('pagehide', onHide)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      clearInterval(interval)
      window.removeEventListener('pagehide', onHide)
      document.removeEventListener('visibilitychange', onHide)
    }
  }, [flushTelemetry, flushLatestProgress])

  const activeLearner = useMemo(
    () => learners.find((profile) => profile.id === activeId) ?? null,
    [learners, activeId],
  )

  const value = useMemo<LearnerContextValue>(
    () => ({
      ready,
      learners,
      activeLearner,
      state: learnerState,
      pendingBadges,
      saving,
      saveError,
      createLearner,
      deleteLearner,
      selectLearner,
      signOut,
      ensureLesson,
      saveProgram,
      setCurrentStep,
      completeConcept,
      recordResult,
      recordPracticeResult: recordPracticeResultAction,
      recordReview,
      tickTimers: tickTimersAction,
      consumePendingBadges,
      clearPendingBadges,
      restartLesson,
    }),
    [
      ready,
      learners,
      activeLearner,
      learnerState,
      pendingBadges,
      saving,
      saveError,
      createLearner,
      deleteLearner,
      selectLearner,
      signOut,
      ensureLesson,
      saveProgram,
      setCurrentStep,
      completeConcept,
      recordResult,
      recordPracticeResultAction,
      recordReview,
      tickTimersAction,
      consumePendingBadges,
      clearPendingBadges,
      restartLesson,
    ],
  )

  return <LearnerContext.Provider value={value}>{children}</LearnerContext.Provider>
}

export function useLearner(): LearnerContextValue {
  const ctx = useContext(LearnerContext)
  if (!ctx) {
    throw new Error('useLearner must be used within a LearnerProvider')
  }
  return ctx
}
