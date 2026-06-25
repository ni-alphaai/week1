import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'
import type { LearnerProfile, LearnerState } from './types'
import { emptyLearnerState } from './types'
import { firestoreDb } from './firebase'

// Firestore-backed persistence, scoped under the signed-in parent (family = uid):
//   users/{uid}/learners/{learnerId}        -> learner profile
//   users/{uid}/learnerStates/{learnerId}   -> that learner's progress blob
function db() {
  if (!firestoreDb) throw new Error('Firestore is not initialized')
  return firestoreDb
}

export async function listLearners(uid: string): Promise<LearnerProfile[]> {
  const snapshot = await getDocs(collection(db(), 'users', uid, 'learners'))
  return snapshot.docs
    .map((entry) => {
      const data = entry.data() as { displayName?: string; createdAt?: number }
      return {
        id: entry.id,
        displayName: data.displayName ?? 'Explorer',
        createdAt: data.createdAt ?? 0,
      }
    })
    .sort((a, b) => a.createdAt - b.createdAt)
}

export async function createLearner(uid: string, displayName: string): Promise<LearnerProfile> {
  const id = `learner_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  const profile: LearnerProfile = {
    id,
    displayName: displayName.trim() || 'Explorer',
    createdAt: Date.now(),
  }
  await setDoc(doc(db(), 'users', uid, 'learners', id), {
    displayName: profile.displayName,
    createdAt: profile.createdAt,
  })
  await setDoc(doc(db(), 'users', uid, 'learnerStates', id), emptyLearnerState(id))
  return profile
}

export async function deleteLearner(uid: string, learnerId: string): Promise<void> {
  await Promise.all([
    deleteDoc(doc(db(), 'users', uid, 'learners', learnerId)),
    deleteDoc(doc(db(), 'users', uid, 'learnerStates', learnerId)),
  ])
}

export async function loadState(uid: string, learnerId: string): Promise<LearnerState> {
  const snapshot = await getDoc(doc(db(), 'users', uid, 'learnerStates', learnerId))
  if (!snapshot.exists()) {
    return emptyLearnerState(learnerId)
  }
  return { ...emptyLearnerState(learnerId), ...(snapshot.data() as LearnerState) }
}

export async function saveState(uid: string, state: LearnerState): Promise<void> {
  await setDoc(doc(db(), 'users', uid, 'learnerStates', state.learnerId), state)
}
