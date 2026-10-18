export const SUPPORTED_EXTENSIONS = ['.txt', '.md', '.markdown'] as const
export const MAX_IMPORT_BYTES = 1024 * 1024 // 1 MB

export type ImportFormat = 'text' | 'markdown'

export class ImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportError'
  }
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot > 0 ? fileName.slice(dot).toLowerCase() : ''
}

/** Validates name and size before reading. Throws ImportError with a user-facing message. */
export function validateImportFile(file: Pick<File, 'name' | 'size'>): ImportFormat {
  const ext = extensionOf(file.name)
  if (!(SUPPORTED_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new ImportError(
      `“${file.name}” isn't supported. Import a plain text (.txt) or Markdown (.md) file.`,
    )
  }
  if (file.size === 0) throw new ImportError(`“${file.name}” is empty.`)
  if (file.size > MAX_IMPORT_BYTES) {
    throw new ImportError(`“${file.name}” is larger than 1 MB. Split it into smaller files and try again.`)
  }
  return ext === '.txt' ? 'text' : 'markdown'
}

/** Decodes file bytes as UTF-8, rejecting binary or non-UTF-8 content. */
export function decodeText(bytes: ArrayBuffer, fileName: string): string {
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new ImportError(`“${fileName}” isn't valid UTF-8 text.`)
  }
  if (text.includes('\u0000')) throw new ImportError(`“${fileName}” looks like a binary file, not text.`)
  if (!text.trim()) throw new ImportError(`“${fileName}” has no text content.`)
  return text.replace(/^﻿/, '')
}

export function titleFromFileName(fileName: string): string {
  const ext = extensionOf(fileName)
  const base = (ext ? fileName.slice(0, -ext.length) : fileName).replace(/[_]+/g, ' ').trim()
  return (base || 'Imported document').slice(0, 200)
}
