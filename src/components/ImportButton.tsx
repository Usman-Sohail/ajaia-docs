import { Loader2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { errorMessage } from '../lib/errors'
import { readImportFile, type ImportedDocument } from '../lib/import'
import { useToast } from './Toaster'

interface Props {
  onImport: (doc: ImportedDocument) => Promise<void>
  className?: string
}

export const IMPORT_ACCEPT = '.txt,.md,.markdown,text/plain,text/markdown'

export function ImportButton({ onImport, className = '' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function handleFile(file: File | undefined) {
    if (!file) return
    setBusy(true)
    try {
      const doc = await readImportFile(file)
      await onImport(doc)
    } catch (err) {
      toast.error(errorMessage(err, `Could not import “${file.name}”`))
    } finally {
      setBusy(false)
      // Allow re-selecting the same file after fixing it.
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid="import-input"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        title="Import a .txt or .md file (max 1 MB)"
        className={`flex items-center justify-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-black/[0.03] focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60 ${className}`}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
        {busy ? 'Importing…' : 'Import file'}
      </button>
    </>
  )
}
