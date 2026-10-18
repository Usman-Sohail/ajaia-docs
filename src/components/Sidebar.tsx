import { FileText, Loader2, Plus, Search, Users } from 'lucide-react'
import { useState } from 'react'
import { NavLink } from 'react-router'
import type { DocumentSummary } from '../lib/documents'
import type { ImportedDocument } from '../lib/import'
import { ImportButton } from './ImportButton'

interface Props {
  documents: DocumentSummary[]
  loading: boolean
  error: string | null
  creating: boolean
  onCreate: () => void
  onImport: (doc: ImportedDocument) => Promise<void>
  onRetry: () => void
  onNavigate?: () => void
}

const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const timeFormat = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })

function formatUpdated(iso: string): string {
  const date = new Date(iso)
  return date.toDateString() === new Date().toDateString() ? timeFormat.format(date) : dateFormat.format(date)
}

export function Sidebar({ documents, loading, error, creating, onCreate, onImport, onRetry, onNavigate }: Props) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const visible = q ? documents.filter((d) => d.title.toLowerCase().includes(q)) : documents
  const mine = visible.filter((d) => d.role === 'owner')
  const shared = visible.filter((d) => d.role !== 'owner')

  return (
    <nav aria-label="Documents" className="flex h-full flex-col">
      <div className="space-y-2 p-3">
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
        >
          {creating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
          New document
        </button>
        <ImportButton onImport={onImport} className="w-full" />
        <div className="relative pt-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 mt-0.5 size-3.5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by title"
            aria-label="Filter documents by title"
            className="w-full rounded-md border border-line bg-white py-1.5 pr-2 pl-8 text-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {loading && documents.length === 0 ? (
          <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted" role="status">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading documents…
          </p>
        ) : error ? (
          <div role="alert" className="mx-1 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {error}
            <button type="button" onClick={onRetry} className="mt-1 block font-medium underline underline-offset-2">
              Try again
            </button>
          </div>
        ) : (
          <>
            <Section title="My documents" icon={FileText} docs={mine} emptyText={q ? 'No matches' : 'No documents yet'} onNavigate={onNavigate} />
            <Section title="Shared with me" icon={Users} docs={shared} emptyText={q ? 'No matches' : 'Nothing shared with you yet'} onNavigate={onNavigate} showOwner />
          </>
        )}
      </div>
    </nav>
  )
}

interface SectionProps {
  title: string
  icon: typeof FileText
  docs: DocumentSummary[]
  emptyText: string
  showOwner?: boolean
  onNavigate?: () => void
}

function Section({ title, icon: Icon, docs, emptyText, showOwner, onNavigate }: SectionProps) {
  return (
    <section className="mt-3">
      <h2 className="flex items-center gap-1.5 px-2 pb-1 text-[11px] font-semibold tracking-wider text-muted uppercase">
        <Icon className="size-3.5" aria-hidden /> {title}
        <span className="ml-auto font-normal tabular-nums">{docs.length}</span>
      </h2>
      {docs.length === 0 ? (
        <p className="px-2 py-1.5 text-sm text-muted/80">{emptyText}</p>
      ) : (
        <ul>
          {docs.map((doc) => (
            <li key={doc.id}>
              <NavLink
                to={`/d/${doc.id}`}
                onClick={onNavigate}
                className={({ isActive }) =>
                  `group block rounded-md px-2 py-1.5 text-sm transition focus-visible:outline-2 focus-visible:outline-accent ${
                    isActive ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-black/[0.04]'
                  }`
                }
              >
                <span className="block truncate font-medium">{doc.title}</span>
                <span className="block truncate text-xs text-muted">
                  {showOwner ? `${doc.ownerEmail ?? 'Unknown owner'} · ${doc.role === 'editor' ? 'Can edit' : 'View only'}` : `Edited ${formatUpdated(doc.updatedAt)}`}
                </span>
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
