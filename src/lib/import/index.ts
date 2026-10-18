import type { JSONContent } from '@tiptap/react'
import { markdownToDoc } from './markdown'
import { textToDoc } from './text'
import { decodeText, titleFromFileName, validateImportFile } from './validate'

export { ImportError, MAX_IMPORT_BYTES, SUPPORTED_EXTENSIONS } from './validate'

export interface ImportedDocument {
  title: string
  content: JSONContent
}

/** Validates, reads, and converts a local .txt/.md file into editor content. */
export async function readImportFile(file: File): Promise<ImportedDocument> {
  const format = validateImportFile(file)
  const text = decodeText(await file.arrayBuffer(), file.name)
  return {
    title: titleFromFileName(file.name),
    content: format === 'markdown' ? markdownToDoc(text) : textToDoc(text),
  }
}
