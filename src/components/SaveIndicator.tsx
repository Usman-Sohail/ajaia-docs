import { AlertCircle, Check, CloudOff, Loader2 } from 'lucide-react'
import type { SaveState } from '../lib/autosave'

interface Props {
  state: SaveState
  readOnly?: boolean
  onRetry?: () => void
}

export function SaveIndicator({ state, readOnly, onRetry }: Props) {
  if (readOnly) return <span className="text-xs text-muted">View only</span>

  const base = 'flex items-center gap-1.5 text-xs whitespace-nowrap'
  switch (state.status) {
    case 'saving':
      return (
        <span role="status" className={`${base} text-muted`}>
          <Loader2 className="size-3.5 animate-spin" aria-hidden /> Saving…
        </span>
      )
    case 'unsaved':
      return (
        <span role="status" className={`${base} text-muted`}>
          <span className="size-1.5 rounded-full bg-amber-500" aria-hidden /> Unsaved changes
        </span>
      )
    case 'saved':
      return (
        <span role="status" className={`${base} text-muted`}>
          <Check className="size-3.5 text-emerald-600" aria-hidden /> Saved
        </span>
      )
    case 'conflict':
      return (
        <span role="alert" className={`${base} text-amber-700`} title={state.message}>
          <AlertCircle className="size-3.5" aria-hidden /> Not saved (conflict)
        </span>
      )
    case 'error':
      return (
        <span role="alert" className={`${base} text-red-700`} title={state.message}>
          <CloudOff className="size-3.5" aria-hidden /> Save failed
          {onRetry && (
            <button type="button" onClick={onRetry} className="font-medium underline underline-offset-2 hover:text-red-900">
              Retry
            </button>
          )}
        </span>
      )
  }
}
