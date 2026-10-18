import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'

type ToastTone = 'success' | 'error' | 'info'
interface Toast {
  id: number
  tone: ToastTone
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

const toneStyles: Record<ToastTone, string> = {
  success: 'border-emerald-200 bg-white text-ink [&_[data-dot]]:bg-emerald-500',
  error: 'border-red-200 bg-red-50 text-red-900 [&_[data-dot]]:bg-red-500',
  info: 'border-line bg-white text-ink [&_[data-dot]]:bg-accent',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])

  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++
      setToasts((all) => [...all.slice(-3), { id, tone, message }])
      setTimeout(() => dismiss(id), tone === 'error' ? 8000 : 4000)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:items-end">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex max-w-sm items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm shadow-sm ${toneStyles[toast.tone]}`}
          >
            <span data-dot className="mt-1.5 size-1.5 shrink-0 rounded-full" />
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="-mr-1 rounded px-1 text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>')
  return ctx
}
