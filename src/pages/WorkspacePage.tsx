import { FileText, LogOut, Menu, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { DocumentView } from '../components/DocumentView'
import { EmptyState } from '../components/EmptyState'
import { Sidebar } from '../components/Sidebar'
import { useToast } from '../components/Toaster'
import { useDocumentList } from '../hooks/useDocumentList'
import { createDocument } from '../lib/documents'
import { errorMessage } from '../lib/errors'
import type { ImportedDocument } from '../lib/import'
import { supabase } from '../lib/supabase'

interface Props {
  userId: string
  email: string
}

export function WorkspacePage({ userId, email }: Props) {
  const { docId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { documents, loading, error, refresh, upsert, remove } = useDocumentList(userId)
  const [creating, setCreating] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const handleCreate = useCallback(async () => {
    setCreating(true)
    try {
      const doc = await createDocument(userId)
      upsert(doc)
      navigate(`/d/${doc.id}`)
      setSidebarOpen(false)
    } catch (err) {
      toast.error(errorMessage(err, 'Could not create a document'))
    } finally {
      setCreating(false)
    }
  }, [userId, upsert, navigate, toast])

  const handleImport = useCallback(
    async (imported: ImportedDocument) => {
      const doc = await createDocument(userId, imported)
      upsert(doc)
      navigate(`/d/${doc.id}`)
      setSidebarOpen(false)
      toast.success(`Imported “${doc.title}”`)
    },
    [userId, upsert, navigate, toast],
  )

  const handleDeleted = useCallback(
    (id: string) => {
      remove(id)
      navigate('/')
    },
    [remove, navigate],
  )

  async function handleSignOut() {
    // Let the open document flush pending edits (it saves on unmount) before the session ends.
    navigate('/')
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) toast.error(errorMessage(signOutError, 'Could not sign out'))
  }

  const sidebar = (
    <Sidebar
      documents={documents}
      loading={loading}
      error={error}
      creating={creating}
      onCreate={() => void handleCreate()}
      onImport={handleImport}
      onRetry={() => void refresh()}
      onNavigate={() => setSidebarOpen(false)}
    />
  )

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-white px-3">
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="rounded-md p-1.5 text-muted hover:bg-black/5 md:hidden"
          aria-label="Open document list"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <a href="/" className="flex items-center gap-2 rounded-md px-1 font-semibold tracking-tight focus-visible:outline-2 focus-visible:outline-accent">
          <span className="flex size-6 items-center justify-center rounded-md bg-accent text-white">
            <FileText className="size-3.5" aria-hidden />
          </span>
          Ajaia Docs
        </a>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden max-w-[16rem] truncate text-sm text-muted sm:block" title={email}>
            {email}
          </span>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-black/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
          >
            <LogOut className="size-4" aria-hidden /> <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-line bg-canvas md:block">{sidebar}</aside>

        {sidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true" aria-label="Documents">
            <div className="absolute inset-0 bg-black/25" onClick={() => setSidebarOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72 max-w-[85%] border-r border-line bg-canvas shadow-xl">
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="absolute top-2 right-2 rounded-md p-1.5 text-muted hover:bg-black/5"
                aria-label="Close document list"
              >
                <X className="size-4" aria-hidden />
              </button>
              <div className="h-full pt-8">{sidebar}</div>
            </div>
          </div>
        )}

        <main className="flex min-w-0 flex-1 flex-col bg-canvas">
          {docId ? (
            <DocumentView
              key={docId}
              documentId={docId}
              userId={userId}
              onDocumentChange={upsert}
              onDeleted={handleDeleted}
            />
          ) : (
            <EmptyState
              hasDocuments={documents.length > 0}
              creating={creating}
              onCreate={() => void handleCreate()}
              onImport={handleImport}
            />
          )}
        </main>
      </div>
    </div>
  )
}
