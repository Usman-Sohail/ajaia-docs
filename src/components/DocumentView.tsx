import { AlertCircle, Eye, Loader2, Pencil, Share2, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import { useDocumentAutosave } from '../hooks/useDocumentAutosave'
import {
  deleteDocument,
  getDocument,
  MAX_TITLE_LENGTH,
  normalizeTitle,
  renameDocument,
  type DocumentRecord,
  type DocumentSummary,
} from '../lib/documents'
import { errorMessage } from '../lib/errors'
import { DocumentEditor } from './DocumentEditor'
import { SaveIndicator } from './SaveIndicator'
import { ShareDialog } from './ShareDialog'
import { useToast } from './Toaster'

interface Props {
  documentId: string
  userId: string
  onDocumentChange: (doc: Partial<DocumentSummary> & { id: string }) => void
  onDeleted: (id: string) => void
}

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; doc: DocumentRecord }

/** Loads one document and renders it. Mount with `key={documentId}`. */
export function DocumentView({ documentId, userId, onDocumentChange, onDeleted }: Props) {
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    getDocument(documentId, userId)
      .then((doc) => {
        if (!cancelled) setLoad(doc ? { status: 'ready', doc } : { status: 'missing' })
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoad({ status: 'error', message: errorMessage(err, 'Could not open this document') })
      })
    return () => {
      cancelled = true
    }
  }, [documentId, userId, reloadKey])

  const reload = () => {
    setLoad({ status: 'loading' })
    setReloadKey((k) => k + 1)
  }

  if (load.status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted" role="status">
        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> Opening document…
      </div>
    )
  }
  if (load.status === 'missing' || load.status === 'error') {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <AlertCircle className="mx-auto mb-3 size-6 text-muted" aria-hidden />
          <h2 className="font-semibold">
            {load.status === 'missing' ? 'Document unavailable' : 'Something went wrong'}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {load.status === 'missing'
              ? "It may have been deleted, or you don't have access. Ask the owner to share it with you."
              : load.message}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {load.status === 'error' && (
              <button
                type="button"
                onClick={reload}
                className="rounded-md border border-line bg-white px-3 py-1.5 text-sm hover:bg-black/5"
              >
                Try again
              </button>
            )}
            <Link to="/" className="rounded-md border border-line bg-white px-3 py-1.5 text-sm hover:bg-black/5">
              Back to documents
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <LoadedDocument
      key={reloadKey}
      doc={load.doc}
      onDocumentChange={onDocumentChange}
      onDeleted={onDeleted}
      onReload={reload}
    />
  )
}

interface LoadedProps {
  doc: DocumentRecord
  onDocumentChange: Props['onDocumentChange']
  onDeleted: Props['onDeleted']
  onReload: () => void
}

function LoadedDocument({ doc, onDocumentChange, onDeleted, onReload }: LoadedProps) {
  const toast = useToast()
  const isOwner = doc.role === 'owner'
  const readOnly = doc.role === 'viewer'
  const [title, setTitle] = useState(doc.title)
  const [savedTitle, setSavedTitle] = useState(doc.title)
  const [shareOpen, setShareOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { state, controller, overwriteWithLocal } = useDocumentAutosave({
    documentId: doc.id,
    initialVersion: doc.version,
    onSaved: (updatedAt) => onDocumentChange({ id: doc.id, updatedAt }),
    onUnsavedOnClose: (message) => toast.error(`Changes to “${savedTitle}” were not saved: ${message}`),
  })

  const handleChange = useCallback((content: DocumentRecord['content']) => controller.update(content), [controller])

  async function commitTitle() {
    const next = normalizeTitle(title)
    if (!next) {
      setTitle(savedTitle)
      toast.error('Title cannot be empty')
      return
    }
    if (next === savedTitle) {
      setTitle(next)
      return
    }
    try {
      const result = await renameDocument(doc.id, next)
      setSavedTitle(result.title)
      setTitle(result.title)
      onDocumentChange({ id: doc.id, title: result.title, updatedAt: result.updatedAt })
    } catch (err) {
      setTitle(savedTitle)
      toast.error(errorMessage(err, 'Could not rename the document'))
    }
  }

  function handleTitleKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      setTitle(savedTitle)
      requestAnimationFrame(() => (event.target as HTMLInputElement).blur())
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete “${savedTitle}”? This can't be undone and removes access for everyone it's shared with.`)) return
    setDeleting(true)
    controller.cancel()
    try {
      await deleteDocument(doc.id)
      toast.success(`Deleted “${savedTitle}”`)
      onDeleted(doc.id)
    } catch (err) {
      setDeleting(false)
      toast.error(errorMessage(err, 'Could not delete the document'))
      controller.resume()
    }
  }

  async function handleOverwrite() {
    try {
      await overwriteWithLocal()
    } catch (err) {
      toast.error(errorMessage(err, 'Could not save your version'))
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-white px-3 py-2.5 sm:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <label htmlFor="doc-title" className="sr-only">
            Document title
          </label>
          <input
            id="doc-title"
            value={title}
            maxLength={MAX_TITLE_LENGTH}
            readOnly={!isOwner}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => isOwner && void commitTitle()}
            onKeyDown={handleTitleKey}
            title={isOwner ? 'Rename document' : 'Only the owner can rename this document'}
            className="min-w-0 flex-1 truncate rounded-md border border-transparent px-2 py-1 text-base font-semibold outline-none hover:border-line focus:border-accent focus:ring-2 focus:ring-accent/20 read-only:hover:border-transparent read-only:focus:ring-0"
          />
          <RoleBadge doc={doc} />
        </div>
        <div className="flex items-center gap-3">
          <SaveIndicator state={state} readOnly={readOnly} onRetry={() => void controller.retry()} />
          {isOwner && (
            <>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                aria-label="Delete document"
                title="Delete document"
                className="rounded-md p-2 text-muted hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => setShareOpen(true)}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <Share2 className="size-4" aria-hidden /> Share
              </button>
            </>
          )}
        </div>
      </header>

      {state.status === 'conflict' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:px-6">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{state.message} Your latest edits are kept in this tab until you choose.</span>
          <button type="button" onClick={onReload} className="rounded-md border border-amber-300 bg-white px-2.5 py-1 font-medium hover:bg-amber-100">
            Reload latest
          </button>
          <button type="button" onClick={() => void handleOverwrite()} className="rounded-md px-2.5 py-1 font-medium underline underline-offset-2 hover:bg-amber-100">
            Keep my version
          </button>
        </div>
      )}

      <DocumentEditor initialContent={doc.content} readOnly={readOnly} onChange={handleChange} />

      {isOwner && (
        <ShareDialog documentId={doc.id} documentTitle={savedTitle} open={shareOpen} onClose={() => setShareOpen(false)} />
      )}
    </div>
  )
}

function RoleBadge({ doc }: { doc: DocumentRecord }) {
  if (doc.role === 'owner') return null
  const Icon = doc.role === 'editor' ? Pencil : Eye
  return (
    <span
      className="hidden shrink-0 items-center gap-1 rounded-full border border-line bg-canvas px-2 py-0.5 text-xs text-muted sm:flex"
      title={`Shared with you by ${doc.ownerEmail ?? 'the owner'}`}
    >
      <Icon className="size-3" aria-hidden />
      {doc.role === 'editor' ? 'Can edit' : 'View only'} · {doc.ownerEmail ?? 'shared'}
    </span>
  )
}
