import { FileText, Loader2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router'
import { useAuth } from '../lib/auth'
import { errorMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'

type Mode = 'sign-in' | 'sign-up'

export function LoginPage() {
  const { user, loading } = useAuth()
  const [mode, setMode] = useState<Mode>('sign-in')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  if (!loading && user) return <Navigate to="/" replace />

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      if (mode === 'sign-in') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        // With email confirmation enabled, Supabase returns no session until the link is clicked.
        if (!data.session) {
          setNotice('Account created. Check your inbox for a confirmation link, then sign in.')
          setMode('sign-in')
        }
      }
    } catch (err) {
      setError(errorMessage(err, 'Could not sign in'))
    } finally {
      setSubmitting(false)
    }
  }

  const isSignIn = mode === 'sign-in'

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-white">
            <FileText className="size-5" aria-hidden />
          </span>
          <span className="text-xl font-semibold tracking-tight">Ajaia Docs</span>
        </div>

        <div className="rounded-xl border border-line bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h1 className="text-lg font-semibold">{isSignIn ? 'Sign in' : 'Create your account'}</h1>
          <p className="mt-1 text-sm text-muted">
            {isSignIn ? 'Welcome back. Pick up where you left off.' : 'Start writing and sharing documents.'}
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate={false}>
            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete={isSignIn ? 'current-password' : 'new-password'}
                required
                minLength={isSignIn ? undefined : 8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/20"
              />
              {!isSignIn && <p className="mt-1.5 text-xs text-muted">At least 8 characters.</p>}
            </div>

            {error && (
              <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
            {notice && (
              <p role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {notice}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
            >
              {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {isSignIn ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-muted">
          {isSignIn ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(isSignIn ? 'sign-up' : 'sign-in')
              setError(null)
            }}
            className="font-medium text-accent hover:underline"
          >
            {isSignIn ? 'Create one' : 'Sign in'}
          </button>
        </p>
      </div>
    </main>
  )
}
