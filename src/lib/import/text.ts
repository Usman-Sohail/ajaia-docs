import type { JSONContent } from '@tiptap/react'

/** Plain text → paragraphs (blank-line separated) with hard breaks for single newlines. */
export function textToDoc(text: string): JSONContent {
  // Trailing newlines (most files end with one) would otherwise become stray hard breaks.
  const blocks = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '').split(/\n{2,}/)
  const content: JSONContent[] = blocks
    .filter((block) => block.trim())
    .map((block) => {
      const lines = block.split('\n')
      const inline: JSONContent[] = []
      lines.forEach((line, i) => {
        if (i > 0) inline.push({ type: 'hardBreak' })
        if (line) inline.push({ type: 'text', text: line })
      })
      return { type: 'paragraph', content: inline }
    })
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}
