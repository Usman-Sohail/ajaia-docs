import { Loader2 } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import { ToastProvider } from './components/Toaster'
import { AuthProvider, useAuth } from './lib/auth'
import { missingEnv } from './lib/supabase'
import { LoginPage } from './pages/LoginPage'

// The editor (TipTap/ProseMirror) is the bulk of the bundle; keep it off the sign-in page.
const WorkspacePage = lazy(() => import('./pages/WorkspacePage').then((m) => ({ default: m.WorkspacePage })))

function Loading() {
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted" role="status">
      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Loading…
    </div>
  )
}

function RequireAuth() {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  // Keyed by user so switching accounts never reuses another user's state.
  return (
    <Suspense fallback={<Loading />}>
      <WorkspacePage key={user.id} userId={user.id} email={user.email ?? ''} />
    </Suspense>
  )
}

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <RequireAuth /> },
  { path: '/d/:docId', element: <RequireAuth /> },
  { path: '*', element: <Navigate to="/" replace /> },
])

function MissingConfig() {
  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-lg font-semibold">Configuration required</h1>
      <p className="mt-2 text-sm text-muted">
        Set these environment variables (see <code>.env.example</code> and the README), then rebuild:
      </p>
      <ul className="mt-3 list-disc pl-5 font-mono text-sm">
        {missingEnv.map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
    </main>
  )
}

export default function App() {
  if (missingEnv.length) return <MissingConfig />
  return (
    <AuthProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AuthProvider>
  )
}
