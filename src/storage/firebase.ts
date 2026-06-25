import { initializeApp } from 'firebase/app'
import type { FirebaseApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import type { Auth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'

// Firebase is optional in Phase 1. When the VITE_FIREBASE_* env vars are present
// the app can use Auth + Firestore for real accounts and cross-device sync.
// Otherwise it runs entirely on the local persistence backend.
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseEnabled = Boolean(config.apiKey && config.projectId)

let firebaseApp: FirebaseApp | null = null
let firebaseAuth: Auth | null = null
let firestoreDb: Firestore | null = null

if (isFirebaseEnabled) {
  firebaseApp = initializeApp(config)
  firebaseAuth = getAuth(firebaseApp)
  firestoreDb = getFirestore(firebaseApp)
}

export { firebaseApp, firebaseAuth, firestoreDb }
