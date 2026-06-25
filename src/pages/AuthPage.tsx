import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { CompassIcon } from '../components/icons'

export function AuthPage() {
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const isSignup = mode === 'signup'

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (isSignup) {
        await signUp(email, password, displayName)
      } else {
        await signIn(email, password)
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    setError(null)
    setBusy(true)
    try {
      await signInWithGoogle()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-12">
      <div className="animate-float-in mb-8 text-center">
        <div className="brand-mark">
          <CompassIcon className="h-8 w-8" />
        </div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-[var(--color-text)]">Brillant</h1>
        <p className="mt-1 text-sm text-muted">A grown-up sets up the account. Kids learn by doing.</p>
      </div>

      <form onSubmit={handleSubmit} className="card animate-float-in p-6">
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg bg-[var(--color-panel)] p-1">
          <button
            type="button"
            onClick={() => {
              setMode('signin')
              setError(null)
            }}
            className={`rounded-md py-2 text-sm font-medium transition ${!isSignup ? 'bg-[var(--color-surface-strong)] text-[var(--color-text)] shadow-sm' : 'text-muted'}`}
          >
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('signup')
              setError(null)
            }}
            className={`rounded-md py-2 text-sm font-medium transition ${isSignup ? 'bg-[var(--color-surface-strong)] text-[var(--color-text)] shadow-sm' : 'text-muted'}`}
          >
            Create account
          </button>
        </div>

        {isSignup && (
          <label className="mb-3 block">
            <span className="text-sm font-medium text-muted">Your name</span>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} autoComplete="name" className="input mt-1" />
          </label>
        )}

        <label className="mb-3 block">
          <span className="text-sm font-medium text-muted">Email</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" className="input mt-1" />
        </label>

        <label className="block">
          <span className="text-sm font-medium text-muted">Password</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            className="input mt-1"
          />
        </label>

        {error && <p className="mt-3 rounded-lg bg-[var(--color-danger-soft)] px-3 py-2 text-sm text-[var(--color-danger)]">{error}</p>}

        <button type="submit" disabled={busy} className="btn-primary mt-5 w-full disabled:opacity-60">
          {busy ? 'Please wait…' : isSignup ? 'Create account' : 'Sign in'}
        </button>

        <div className="my-4 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-[var(--color-border)]" />
          or
          <span className="h-px flex-1 bg-[var(--color-border)]" />
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={busy}
          className="btn-ghost flex w-full items-center justify-center gap-2 disabled:opacity-60"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
            <path fill="#4285F4" d="M21.6 12.2c0-.6-.1-1.2-.2-1.8H12v3.5h5.4a4.6 4.6 0 01-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.2z" />
            <path fill="#34A853" d="M12 22c2.7 0 4.9-.9 6.6-2.4l-3.2-2.5c-.9.6-2 .9-3.4.9-2.6 0-4.8-1.7-5.6-4.1H3.1v2.6A10 10 0 0012 22z" />
            <path fill="#FBBC05" d="M6.4 13.9a6 6 0 010-3.8V7.5H3.1a10 10 0 000 9z" />
            <path fill="#EA4335" d="M12 6.1c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 003.1 7.5l3.3 2.6C7.2 7.8 9.4 6.1 12 6.1z" />
          </svg>
          Continue with Google
        </button>
      </form>
    </div>
  )
}
