import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { firebaseAuth, isFirebaseEnabled } from '../storage/firebase'

export interface AuthUser {
  uid: string
  email: string | null
  displayName: string | null
}

interface AuthContextValue {
  enabled: boolean
  loading: boolean
  user: AuthUser | null
  // ownerKey scopes a learner's data: a parent uid when signed in, or 'local'
  // when Firebase is disabled. Null means "login required".
  ownerKey: string | null
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signInWithGoogle: () => Promise<void>
  signOutParent: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function friendlyError(code: string): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'That email already has an account. Try signing in instead.'
    case 'auth/invalid-email':
      return "That email address doesn't look right."
    case 'auth/weak-password':
      return 'Please choose a password with at least 6 characters.'
    case 'auth/missing-password':
      return 'Please enter a password.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Email or password is incorrect.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled for this project yet.'
    case 'auth/network-request-failed':
      return 'Network problem reaching Firebase. Check your connection and try again.'
    default:
      return 'Something went wrong. Please try again.'
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(isFirebaseEnabled)
  const [user, setUser] = useState<AuthUser | null>(null)

  useEffect(() => {
    if (!isFirebaseEnabled || !firebaseAuth) {
      setLoading(false)
      return
    }
    const unsubscribe = onAuthStateChanged(firebaseAuth, (firebaseUser) => {
      setUser(
        firebaseUser
          ? { uid: firebaseUser.uid, email: firebaseUser.email, displayName: firebaseUser.displayName }
          : null,
      )
      setLoading(false)
    })
    return unsubscribe
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const ownerKey = !isFirebaseEnabled ? 'local' : user ? user.uid : null

    async function signUp(email: string, password: string, displayName: string) {
      if (!firebaseAuth) throw new Error('Sign-up is unavailable right now.')
      try {
        const credential = await createUserWithEmailAndPassword(firebaseAuth, email.trim(), password)
        if (displayName.trim()) {
          await updateProfile(credential.user, { displayName: displayName.trim() })
          setUser({ uid: credential.user.uid, email: credential.user.email, displayName: displayName.trim() })
        }
      } catch (error) {
        throw new Error(friendlyError((error as { code?: string }).code ?? ''))
      }
    }

    async function signIn(email: string, password: string) {
      if (!firebaseAuth) throw new Error('Sign-in is unavailable right now.')
      try {
        await signInWithEmailAndPassword(firebaseAuth, email.trim(), password)
      } catch (error) {
        throw new Error(friendlyError((error as { code?: string }).code ?? ''))
      }
    }

    async function signInWithGoogle() {
      if (!firebaseAuth) throw new Error('Sign-in is unavailable right now.')
      try {
        await signInWithPopup(firebaseAuth, new GoogleAuthProvider())
      } catch (error) {
        const code = (error as { code?: string }).code ?? ''
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return
        throw new Error(friendlyError(code))
      }
    }

    async function signOutParent() {
      if (!firebaseAuth) return
      await signOut(firebaseAuth)
    }

    return { enabled: isFirebaseEnabled, loading, user, ownerKey, signUp, signIn, signInWithGoogle, signOutParent }
  }, [loading, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
