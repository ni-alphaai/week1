import type { LearnerProfile, LearnerState } from './types'
import { isFirebaseEnabled } from './firebase'
import * as local from './local'
import * as remote from './firestoreStore'

// Unified async persistence surface. Uses Firestore when Firebase is configured,
// otherwise localStorage. Components/context only talk to this facade.
export function listLearners(owner: string): Promise<LearnerProfile[]> {
  return isFirebaseEnabled ? remote.listLearners(owner) : Promise.resolve(local.listLearners(owner))
}

export function createLearner(owner: string, name: string): Promise<LearnerProfile> {
  return isFirebaseEnabled ? remote.createLearner(owner, name) : Promise.resolve(local.createLearner(owner, name))
}

export function deleteLearner(owner: string, learnerId: string): Promise<void> {
  if (isFirebaseEnabled) {
    return remote.deleteLearner(owner, learnerId)
  }
  local.deleteLearner(owner, learnerId)
  return Promise.resolve()
}

// Backfills fields added in newer versions so older saved states stay valid.
function normalizeState(state: LearnerState): LearnerState {
  const next = Array.isArray(state.badges) ? state : { ...state, badges: [] }
  // badgeAcquiredAt was added after initial release; legacy stored states lack it.
  if (!(next as { badgeAcquiredAt?: unknown }).badgeAcquiredAt) next.badgeAcquiredAt = {}
  // Drop legacy saved programs (the old card-id string[] format) so the new
  // composable editor never tries to restore an incompatible shape.
  for (const progress of Object.values(next.lessonProgress ?? {})) {
    const saved = progress.savedPrograms ?? {}
    for (const [stepId, value] of Object.entries(saved)) {
      const isNodeTree =
        Array.isArray(value) &&
        value.every((node) => !!node && typeof node === 'object' && 'kind' in (node as object))
      if (!isNodeTree) delete saved[stepId]
    }
    progress.savedPrograms = saved
  }
  return next
}

export async function loadState(owner: string, learnerId: string): Promise<LearnerState> {
  const loaded = isFirebaseEnabled
    ? await remote.loadState(owner, learnerId)
    : local.loadState(owner, learnerId)
  return normalizeState(loaded)
}

export function saveState(owner: string, state: LearnerState): Promise<void> {
  if (isFirebaseEnabled) {
    return remote.saveState(owner, state)
  }
  local.saveState(owner, state)
  return Promise.resolve()
}

// The active learner selection is device-local UI state in both modes.
export { getActiveLearnerId, setActiveLearnerId } from './local'
