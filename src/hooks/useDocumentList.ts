import { useCallback, useEffect, useState } from 'react'
import { listDocuments, type DocumentSummary } from '../lib/documents'
import { errorMessage } from '../lib/errors'

const byUpdatedDesc = (a: DocumentSummary, b: DocumentSummary) => b.updatedAt.localeCompare(a.updatedAt)

export function useDocumentList(userId: string) {
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchList = useCallback(async () => {
    try {
      setDocuments(await listDocuments(userId))
      setError(null)
    } catch (err) {
      setError(errorMessage(err, 'Could not load your documents'))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    void fetchList()
  }, [fetchList])

  const refresh = useCallback(() => {
    setLoading(true)
    return fetchList()
  }, [fetchList])

  /** Inserts or merges a document locally (after create/rename/save) without refetching. */
  const upsert = useCallback((doc: Partial<DocumentSummary> & { id: string }) => {
    setDocuments((all) => {
      const existing = all.find((d) => d.id === doc.id)
      if (!existing) return 'title' in doc ? [doc as DocumentSummary, ...all].sort(byUpdatedDesc) : all
      return all.map((d) => (d.id === doc.id ? { ...d, ...doc } : d)).sort(byUpdatedDesc)
    })
  }, [])

  const remove = useCallback((id: string) => setDocuments((all) => all.filter((d) => d.id !== id)), [])

  return { documents, loading, error, refresh, upsert, remove }
}
