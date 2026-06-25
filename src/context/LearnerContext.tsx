import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Lesson, Step } from '../types'
import type { LearnerProfile, LearnerState } from '../storage/types'
import * as backend from '../storage/backend'
import * as progress from '../storage/progress'

interface LearnerContextValue {
  ready: boolean
  learners: LearnerProfile[]
  activeLearner: LearnerProfile | null
  state: LearnerState | null
  createLearner: (name: string) => void
  deleteLearner: (id: string) => void
  selectLearner: (id: string) => void
  signOut: () => void
  ensureLesson: (lesson: Lesson) => void
  saveProgram: (lessonId: string, stepId: string, program: unknown) => void
  setCurrentStep: (lessonId: string, stepId: string) => void
  completeConcept: (lesson: Lesson, stepId: string) => void
  recordResult: (lesson: Lesson, stepId: string, correct: boolean, commands: Step[]) => void
  restartLesson: (lesson: Lesson) => void
}

const LearnerContext = createContext<LearnerContextValue | null>(null)

export function LearnerProvider({ ownerKey, children }: { ownerKey: string; children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [learners, setLearners] = useState<LearnerProfile[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [learnerState, setLearnerState] = useState<LearnerState | null>(null)
  const stateRef = useRef<LearnerState | null>(null)

  useEffect(() => {
    stateRef.current = learnerState
  }, [learnerState])

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
        stateRef.current = loaded
        setLearnerState(loaded)
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
  }, [ownerKey])

  const persist = useCallback(
    (next: LearnerState) => {
      // Optimistic: update UI immediately, then write asynchronously (best-effort).
      stateRef.current = next
      setLearnerState(next)
      void backend.saveState(ownerKey, next).catch((error) => {
        console.error('Failed to save progress', error)
      })
    },
    [ownerKey],
  )

  const mutate = useCallback(
    (fn: (current: LearnerState) => LearnerState) => {
      const current = stateRef.current
      if (!current) return
      persist(fn(current))
    },
    [persist],
  )

  const createLearner = useCallback(
    (name: string) => {
      void (async () => {
        const profile = await backend.createLearner(ownerKey, name)
        const updated = await backend.listLearners(ownerKey)
        backend.setActiveLearnerId(ownerKey, profile.id)
        setLearners(updated)
        setActiveId(profile.id)
        const loaded = await backend.loadState(ownerKey, profile.id)
        stateRef.current = loaded
        setLearnerState(loaded)
      })()
    },
    [ownerKey],
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
        stateRef.current = loaded
        setLearnerState(loaded)
      })()
    },
    [ownerKey],
  )

  const signOut = useCallback(() => {
    backend.setActiveLearnerId(ownerKey, null)
    setActiveId(null)
    stateRef.current = null
    setLearnerState(null)
  }, [ownerKey])

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
    (lesson: Lesson, stepId: string, correct: boolean, commands: Step[]) =>
      mutate((current) => progress.recordSequenceResult(current, lesson, stepId, correct, commands)),
    [mutate],
  )
  const restartLesson = useCallback(
    (lesson: Lesson) => mutate((current) => progress.restartLesson(current, lesson)),
    [mutate],
  )

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
      createLearner,
      deleteLearner,
      selectLearner,
      signOut,
      ensureLesson,
      saveProgram,
      setCurrentStep,
      completeConcept,
      recordResult,
      restartLesson,
    }),
    [
      ready,
      learners,
      activeLearner,
      learnerState,
      createLearner,
      deleteLearner,
      selectLearner,
      signOut,
      ensureLesson,
      saveProgram,
      setCurrentStep,
      completeConcept,
      recordResult,
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
