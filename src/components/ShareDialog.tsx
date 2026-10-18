import { Loader2, Trash2, Users, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import {
  listShares,
  removeShare,
  shareDocument,
  updateSharePermission,
  type DocumentShare,
  type SharePermission,
} from '../lib/documents'
import { errorMessage } from '../lib/errors'
import { useToast } from './Toaster'

interface Props {
  documentId: string
  documentTitle: string
  open: boolean
  onClose: () => void
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ShareDialog({ documentId, documentTitle, open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const toast = useToast()
  const [shares, setShares] = useState<DocumentShare[]>([])
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState('')
  const [permission, setPermission] = useState<SharePermission>('editor')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyShareId, setBusyShareId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setShares(await listShares(documentId))
    } catch (err) {
      setFormError(errorMessage(err, 'Could not load who has access'))
    } finally {
      setLoading(false)
    }
  }, [documentId])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      setFormError(null)
      void load()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open, load])

  async function handleShare(event: FormEvent) {
    event.preventDefault()
    const trimmed = email.trim()
    if (!EMAIL_PATTERN.test(trimmed)) {
      setFormError('Enter a valid email address.')
      return
    }
    setSubmitting(true)
    setFormError(null)
    try {
      await shareDocument(documentId, trimmed, permission)
      toast.success(`Shared with ${trimmed.toLowerCase()} as ${permission}`)
      setEmail('')
      await load()
    } catch (err) {
      setFormError(errorMessage(err, 'Could not share the document'))
    } finally {
      setSubmitting(false)
    }
  }

  async function handlePermissionChange(share: DocumentShare, next: SharePermission) {
    setBusyShareId(share.id)
    try {
      await updateSharePermission(share.id, next)
      setShares((all) => all.map((s) => (s.id === share.id ? { ...s, permission: next } : s)))
    } catch (err) {
      toast.error(errorMessage(err, 'Could not change access'))
    } finally {
      setBusyShareId(null)
    }
  }

  async function handleRemove(share: DocumentShare) {
    setBusyShareId(share.id)
    try {
      await removeShare(share.id)
      setShares((all) => all.filter((s) => s.id !== share.id))
      toast.success(`Removed access for ${share.email ?? 'user'}`)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not remove access'))
    } finally {
      setBusyShareId(null)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="share-title"
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border border-line bg-white p-0 text-ink shadow-xl backdrop:bg-black/25"
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h2 id="share-title" className="text-base font-semibold">
            Share document
          </h2>
          <p className="truncate text-sm text-muted">{documentTitle}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-md p-1 text-muted hover:bg-black/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <form onSubmit={handleShare} className="space-y-3 px-5 py-4" noValidate>
        <label htmlFor="share-email" className="block text-sm font-medium">
          Add people by email
        </label>
        <div className="flex gap-2">
          <input
            id="share-email"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            aria-describedby="share-help"
            aria-invalid={formError ? true : undefined}
          />
          <select
            aria-label="Permission"
            value={permission}
            onChange={(e) => setPermission(e.target.value as SharePermission)}
            className="rounded-md border border-line bg-white px-2 py-2 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          >
            <option value="editor">Can edit</option>
            <option value="viewer">Can view</option>
          </select>
        </div>
        <p id="share-help" className="text-xs text-muted">
          They need an Ajaia Docs account. Editors can change content but not rename, delete, or share.
        </p>
        {formError && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {formError}
          </p>
        )}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={submitting || !email.trim()}
            className="flex items-center gap-2 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
          >
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Share
          </button>
        </div>
      </form>

      <section className="border-t border-line px-5 py-4" aria-labelledby="access-title">
        <h3 id="access-title" className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
          <Users className="size-3.5" aria-hidden /> People with access
        </h3>
        {loading ? (
          <p className="flex items-center gap-2 py-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading…
          </p>
        ) : shares.length === 0 ? (
          <p className="py-2 text-sm text-muted">Only you can access this document.</p>
        ) : (
          <ul className="divide-y divide-line">
            {shares.map((share) => (
              <li key={share.id} className="flex items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{share.email ?? 'Unknown user'}</span>
                <select
                  aria-label={`Permission for ${share.email ?? 'user'}`}
                  value={share.permission}
                  disabled={busyShareId === share.id}
                  onChange={(e) => void handlePermissionChange(share, e.target.value as SharePermission)}
                  className="rounded-md border border-line bg-white px-1.5 py-1 text-xs"
                >
                  <option value="editor">Can edit</option>
                  <option value="viewer">Can view</option>
                </select>
                <button
                  type="button"
                  onClick={() => void handleRemove(share)}
                  disabled={busyShareId === share.id}
                  aria-label={`Remove access for ${share.email ?? 'user'}`}
                  className="rounded-md p-1.5 text-muted hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </dialog>
  )
}
