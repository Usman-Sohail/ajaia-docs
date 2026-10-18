import { EditorContent, useEditor, type JSONContent } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { createExtensions } from '../lib/editor/extensions'
import { Toolbar } from './Toolbar'

interface Props {
  initialContent: JSONContent
  readOnly: boolean
  onChange: (content: JSONContent) => void
}

/** Rich-text editor for one document. Mount it with `key={documentId}`; props are read once. */
export function DocumentEditor({ initialContent, readOnly, onChange }: Props) {
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })
  const [extensions] = useState(() => createExtensions({ placeholder: readOnly ? '' : 'Start writing…' }))
  const editor = useEditor({
    extensions,
    content: initialContent,
    editable: !readOnly,
    immediatelyRender: true,
    editorProps: {
      attributes: { class: 'doc-content', 'aria-label': 'Document content', role: 'textbox', 'aria-multiline': 'true' },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current(e.getJSON()),
  })

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 border-b border-line bg-white/95 px-3 py-1.5 backdrop-blur-sm sm:px-6">
        <Toolbar editor={editor} disabled={readOnly} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-6 sm:px-8 sm:py-10">
        <article className="mx-auto max-w-[816px] rounded-sm border border-line bg-white px-6 py-10 shadow-[0_1px_3px_rgba(0,0,0,0.05)] sm:px-16 sm:py-14">
          <EditorContent editor={editor} />
        </article>
      </div>
    </div>
  )
}
