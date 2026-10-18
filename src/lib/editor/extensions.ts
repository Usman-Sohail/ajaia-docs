import Placeholder from '@tiptap/extension-placeholder'
import StarterKit from '@tiptap/starter-kit'

export const HEADING_LEVELS = [1, 2, 3] as const

/** Shared editor schema: used by the editor, the importer tests, and schema validation. */
export function createExtensions({ placeholder = 'Start writing…' } = {}) {
  return [
    // StarterKit v3 bundles bold/italic/underline/strike, headings, lists, blockquote,
    // code, links, hard breaks and undo/redo.
    StarterKit.configure({
      heading: { levels: [...HEADING_LEVELS] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
    }),
    Placeholder.configure({ placeholder }),
  ]
}
