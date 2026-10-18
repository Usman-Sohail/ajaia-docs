import { getSchema, type JSONContent } from '@tiptap/react'
import { describe, expect, it } from 'vitest'
import { createExtensions } from '../editor/extensions'
import { readImportFile } from './index'
import { markdownToDoc, safeHref } from './markdown'
import { textToDoc } from './text'
import { ImportError, MAX_IMPORT_BYTES, decodeText, titleFromFileName, validateImportFile } from './validate'

const schema = getSchema(createExtensions())

/** Throws if the JSON is not a valid document for the editor's real schema. */
function assertValidDoc(doc: JSONContent) {
  schema.nodeFromJSON(doc).check()
}

const encode = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer

describe('validateImportFile', () => {
  it('accepts .txt, .md and .markdown (case-insensitive)', () => {
    expect(validateImportFile({ name: 'notes.txt', size: 10 })).toBe('text')
    expect(validateImportFile({ name: 'README.MD', size: 10 })).toBe('markdown')
    expect(validateImportFile({ name: 'a.b.markdown', size: 10 })).toBe('markdown')
  })

  it.each(['report.docx', 'image.png', 'script.js', 'noextension', '.md'])('rejects %s', (name) => {
    expect(() => validateImportFile({ name, size: 10 })).toThrow(/isn't supported/)
  })

  it('rejects empty and oversized files', () => {
    expect(() => validateImportFile({ name: 'a.txt', size: 0 })).toThrow(/empty/)
    expect(() => validateImportFile({ name: 'a.txt', size: MAX_IMPORT_BYTES + 1 })).toThrow(/larger than 1 MB/)
    expect(validateImportFile({ name: 'a.txt', size: MAX_IMPORT_BYTES })).toBe('text')
  })
})

describe('decodeText', () => {
  it('rejects invalid UTF-8, binary and whitespace-only content', () => {
    expect(() => decodeText(new Uint8Array([0xff, 0xfe, 0xfd]).buffer, 'x.txt')).toThrow(ImportError)
    expect(() => decodeText(encode('abc\u0000def'), 'x.txt')).toThrow(/binary/)
    expect(() => decodeText(encode('  \n\t '), 'x.txt')).toThrow(/no text content/)
  })

  it('strips a UTF-8 BOM', () => {
    expect(decodeText(encode('﻿hello'), 'x.txt')).toBe('hello')
  })
})

describe('titleFromFileName', () => {
  it('drops the extension and falls back to a default', () => {
    expect(titleFromFileName('Q3_planning notes.md')).toBe('Q3 planning notes')
    expect(titleFromFileName('___.md')).toBe('Imported document')
  })
})

describe('textToDoc', () => {
  it('splits paragraphs on blank lines and keeps single newlines as hard breaks', () => {
    const doc = textToDoc('First line\nsecond line\r\n\r\n\nNext paragraph')
    assertValidDoc(doc)
    expect(doc.content).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'First line' },
          { type: 'hardBreak' },
          { type: 'text', text: 'second line' },
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'Next paragraph' }] },
    ])
  })
})

describe('markdownToDoc', () => {
  it('preserves headings, lists and inline formatting', () => {
    const doc = markdownToDoc(
      ['# Title', '', 'Some **bold** and *italic* and `code` text.', '', '- one', '- two', '  1. nested', '', '#### Deep'].join('\n'),
    )
    assertValidDoc(doc)
    const [h1, p, list, deep] = doc.content!
    expect(h1).toMatchObject({ type: 'heading', attrs: { level: 1 }, content: [{ text: 'Title' }] })
    expect(p.content).toEqual([
      { type: 'text', text: 'Some ' },
      { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' and ' },
      { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
      { type: 'text', text: ' and ' },
      { type: 'text', text: 'code', marks: [{ type: 'code' }] },
      { type: 'text', text: ' text.' },
    ])
    expect(list.type).toBe('bulletList')
    expect(list.content![1].content![1]).toMatchObject({ type: 'orderedList' })
    expect(deep).toMatchObject({ type: 'heading', attrs: { level: 3 } }) // clamped to supported levels
  })

  it('never produces HTML or script nodes from embedded markup', () => {
    const doc = markdownToDoc('Hi <b onclick="x()">there</b>\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>')
    assertValidDoc(doc)
    const json = JSON.stringify(doc)
    expect(json).not.toContain('<b')
    expect(doc.content![0].content).toEqual([{ type: 'text', text: 'Hi ' }, { type: 'text', text: 'there' }])
    // Block HTML is kept as inert literal text in a paragraph.
    expect(doc.content![1]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>' }] })
  })

  it('keeps safe links and drops javascript: links', () => {
    const doc = markdownToDoc('[ok](https://ajaia.com) [bad](javascript:alert(1))')
    assertValidDoc(doc)
    const [ok, , bad] = doc.content![0].content!
    expect(ok).toMatchObject({ text: 'ok', marks: [{ type: 'link', attrs: { href: 'https://ajaia.com/' } }] })
    expect(bad).toEqual({ type: 'text', text: 'bad' })
    expect(safeHref('mailto:a@b.co')).toBe('mailto:a@b.co')
    expect(safeHref('/relative')).toBeNull()
  })

  it('handles task lists, quotes, code blocks, rules, tables and entities', () => {
    const doc = markdownToDoc(
      ['- [x] done', '- [ ] todo', '', '> quoted', '', '```ts', 'const a = 1', '```', '', '---', '', '| a | b |', '|---|---|', '| 1 | 2 |', '', 'Tom &amp; Jerry &#169;'].join('\n'),
    )
    assertValidDoc(doc)
    const types = doc.content!.map((n) => n.type)
    expect(types).toEqual(['bulletList', 'blockquote', 'codeBlock', 'horizontalRule', 'paragraph', 'paragraph', 'paragraph'])
    expect(doc.content![0].content![0].content![0].content![0]).toEqual({ type: 'text', text: '☑ ' })
    expect(doc.content!.at(-1)!.content).toEqual([{ type: 'text', text: 'Tom & Jerry ©' }])
  })

  it('returns a valid empty document for blank input', () => {
    const doc = markdownToDoc('\n\n')
    assertValidDoc(doc)
    expect(doc).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] })
  })
})

describe('readImportFile', () => {
  it('reads a Markdown file into a titled document', async () => {
    const file = new File(['# Plan\n\n- ship it'], 'launch-plan.md', { type: 'text/markdown' })
    const result = await readImportFile(file)
    expect(result.title).toBe('launch-plan')
    assertValidDoc(result.content)
    expect(result.content.content![0]).toMatchObject({ type: 'heading' })
  })

  it('rejects unsupported files before reading them', async () => {
    const file = new File(['%PDF'], 'contract.pdf')
    await expect(readImportFile(file)).rejects.toThrow(ImportError)
  })
})
