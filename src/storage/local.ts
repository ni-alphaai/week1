import type { LearnerProfile, LearnerState } from './types'
import { emptyLearnerState } from './types'

// localStorage-backed persistence, scoped per owner (a parent uid, or 'local'
// when Firebase auth is disabled). The Firestore backend will mirror this surface.
function learnersKey(owner: string): string {
  return `brillant:${owner}:learners`
}
function activeKey(owner: string): string {
  return `brillant:${owner}:active`
}
function stateKey(owner: string, learnerId: string): string {
  return `brillant:${owner}:state:${learnerId}`
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage unavailable or full; the app keeps working on in-memory state.
  }
}

export function listLearners(owner: string): LearnerProfile[] {
  return read<LearnerProfile[]>(learnersKey(owner), [])
}

export function createLearner(owner: string, displayName: string): LearnerProfile {
  const profile: LearnerProfile = {
    id: `learner_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    displayName: displayName.trim() || 'Explorer',
    createdAt: Date.now(),
  }
  const all = listLearners(owner)
  all.push(profile)
  write(learnersKey(owner), all)
  write(stateKey(owner, profile.id), emptyLearnerState(profile.id))
  return profile
}

export function deleteLearner(owner: string, learnerId: string): void {
  const remaining = listLearners(owner).filter((profile) => profile.id !== learnerId)
  write(learnersKey(owner), remaining)
  try {
    localStorage.removeItem(stateKey(owner, learnerId))
  } catch {
    // Storage unavailable; nothing more to clean up.
  }
  if (getActiveLearnerId(owner) === learnerId) {
    setActiveLearnerId(owner, null)
  }
}

export function getActiveLearnerId(owner: string): string | null {
  return read<string | null>(activeKey(owner), null)
}

export function setActiveLearnerId(owner: string, id: string | null): void {
  write(activeKey(owner), id)
}

export function loadState(owner: string, learnerId: string): LearnerState {
  const state = read<LearnerState>(stateKey(owner, learnerId), emptyLearnerState(learnerId))
  return { ...emptyLearnerState(learnerId), ...state }
}

export function saveState(owner: string, state: LearnerState): void {
  write(stateKey(owner, state.learnerId), state)
}
