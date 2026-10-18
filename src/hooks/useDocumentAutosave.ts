import type { JSONContent } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { AutosaveController, type SaveState } from '../lib/autosave'
import { getDocumentVersion, saveDocumentContent } from '../lib/documents'

interface Options {
  documentId: string
  initialVersion: number
  onSaved: (updatedAt: string) => void
  /** Called if changes still could not be saved when the document is closed. */
  onUnsavedOnClose: (message: string) => void
}

/**
 * Wires an AutosaveController to one document. The owning component must be keyed by
 * document id, so switching documents unmounts it and flushes pending edits to the
 * correct document before the next one loads.
 */
export function useDocumentAutosave({ documentId, initialVersion, onSaved, onUnsavedOnClose }: Options) {
  const versionRef = useRef(initialVersion)
  const callbacks = useRef({ onSaved, onUnsavedOnClose })
  useEffect(() => {
    callbacks.current = { onSaved, onUnsavedOnClose }
  })

  const [state, setState] = useState<SaveState>({ status: 'saved' })
  const [controller] = useState(
    () =>
      new AutosaveController<JSONContent>({
        onStateChange: setState,
        save: async (content) => {
          const result = await saveDocumentContent(documentId, content, versionRef.current)
          versionRef.current = result.version
          callbacks.current.onSaved(result.updatedAt)
        },
      }),
  )

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!controller.hasUnsavedChanges) return
      void controller.flush()
      event.preventDefault()
      event.returnValue = ''
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void controller.flush()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      // Closing/switching documents: persist anything pending, and report if that fails.
      void controller.flush().then(() => {
        const s = controller.currentState
        if (s.status === 'error' || s.status === 'conflict') callbacks.current.onUnsavedOnClose(s.message)
      })
    }
  }, [controller])

  /** After a conflict: adopt the server's current version and save local content over it. */
  async function overwriteWithLocal() {
    versionRef.current = await getDocumentVersion(documentId)
    controller.resume()
    await controller.flush()
  }

  return { state, controller, overwriteWithLocal }
}
