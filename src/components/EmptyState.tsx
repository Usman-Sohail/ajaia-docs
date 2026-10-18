import { FileText, Plus } from 'lucide-react'
import type { ImportedDocument } from '../lib/import'
import { ImportButton } from './ImportButton'

interface Props {
  hasDocuments: boolean
  creating: boolean
  onCreate: () => void
  onImport: (doc: ImportedDocument) => Promise<void>
}

export function EmptyState({ hasDocuments, creating, onCreate, onImport }: Props) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-line bg-white text-accent">
          <FileText className="size-6" aria-hidden />
        </span>
        <h1 className="text-lg font-semibold">{hasDocuments ? 'Pick a document' : 'Write your first document'}</h1>
        <p className="mt-1.5 text-sm text-muted">
          {hasDocuments
            ? 'Choose one from the sidebar, start a new one, or import a file.'
            : 'Create a blank document or import a .txt or .md file. Everything saves automatically.'}
        </p>
        <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onCreate}
            disabled={creating}
            className="flex items-center justify-center gap-2 rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-60"
          >
            <Plus className="size-4" aria-hidden /> New document
          </button>
          <ImportButton onImport={onImport} />
        </div>
        <p className="mt-4 text-xs text-muted">Supported imports: .txt, .md (up to 1 MB)</p>
      </div>
    </div>
  )
}
