import type { JSONContent } from '@tiptap/react'
import { marked, type Token, type Tokens } from 'marked'
import { HEADING_LEVELS } from '../editor/extensions'

type Mark = NonNullable<JSONContent['marks']>[number]

/**
 * Markdown → TipTap JSON, built directly from marked's token stream.
 *
 * No HTML is ever generated or parsed, so uploaded content can't inject markup:
 * inline HTML tags are dropped (their inner text is kept), block HTML becomes literal
 * text, images become their alt text, and only http(s)/mailto links keep a link mark.
 */
export function markdownToDoc(markdown: string): JSONContent {
  const tokens = marked.lexer(markdown.replace(/\r\n?/g, '\n'))
  const content = blocks(tokens)
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

function blocks(tokens: Token[]): JSONContent[] {
  return tokens.flatMap(block)
}

function block(token: Token): JSONContent[] {
  switch (token.type) {
    case 'heading': {
      const t = token as Tokens.Heading
      const maxLevel = HEADING_LEVELS[HEADING_LEVELS.length - 1]
      return [{ type: 'heading', attrs: { level: Math.min(t.depth, maxLevel) }, content: inline(t.tokens) }]
    }
    case 'paragraph':
      return paragraph(inline((token as Tokens.Paragraph).tokens))
    case 'text': {
      // Block-level text appears inside tight list items.
      const t = token as Tokens.Text
      return paragraph(t.tokens ? inline(t.tokens) : textNodes(t.text))
    }
    case 'list': {
      const t = token as Tokens.List
      const items = t.items.map(listItem)
      if (t.ordered) {
        const start = typeof t.start === 'number' ? t.start : 1
        return [{ type: 'orderedList', attrs: { start }, content: items }]
      }
      return [{ type: 'bulletList', content: items }]
    }
    case 'blockquote': {
      const inner = blocks((token as Tokens.Blockquote).tokens)
      return [{ type: 'blockquote', content: inner.length ? inner : [{ type: 'paragraph' }] }]
    }
    case 'code': {
      const t = token as Tokens.Code
      return [
        {
          type: 'codeBlock',
          attrs: { language: t.lang || null },
          ...(t.text ? { content: [{ type: 'text', text: t.text }] } : {}),
        },
      ]
    }
    case 'hr':
      return [{ type: 'horizontalRule' }]
    case 'html':
      // Shown literally, never rendered.
      return paragraph(textNodes((token as Tokens.HTML).text.trim()))
    case 'table': {
      const t = token as Tokens.Table
      const rows = [t.header, ...t.rows].map((cells) => cells.map((c) => decodeEntities(c.text)).join(' | '))
      return rows.flatMap((row) => paragraph(textNodes(row)))
    }
    case 'space':
    case 'def':
      return []
    default:
      return 'text' in token && typeof token.text === 'string' ? paragraph(textNodes(token.text)) : []
  }
}

function listItem(item: Tokens.ListItem): JSONContent {
  const content = blocks(item.tokens.filter((t) => t.type !== 'checkbox'))
  if (item.task) {
    const box = { type: 'text', text: item.checked ? '☑ ' : '☐ ' }
    if (content[0]?.type === 'paragraph') content[0].content = [box, ...(content[0].content ?? [])]
    else content.unshift({ type: 'paragraph', content: [box] })
  }
  // A list item's first child must be a paragraph in the StarterKit schema.
  if (content[0]?.type !== 'paragraph') content.unshift({ type: 'paragraph' })
  return { type: 'listItem', content }
}

function paragraph(content: JSONContent[]): JSONContent[] {
  return [{ type: 'paragraph', ...(content.length ? { content } : {}) }]
}

function inline(tokens: Token[] = [], marks: Mark[] = []): JSONContent[] {
  return tokens.flatMap((token): JSONContent[] => {
    switch (token.type) {
      case 'text': {
        const t = token as Tokens.Text
        return t.tokens ? inline(t.tokens, marks) : textNodes(t.text, marks)
      }
      case 'escape':
        return textNodes((token as Tokens.Escape).text, marks)
      case 'strong':
        return inline((token as Tokens.Strong).tokens, [...marks, { type: 'bold' }])
      case 'em':
        return inline((token as Tokens.Em).tokens, [...marks, { type: 'italic' }])
      case 'del':
        return inline((token as Tokens.Del).tokens, [...marks, { type: 'strike' }])
      case 'codespan':
        return textNodes((token as Tokens.Codespan).text, [...marks, { type: 'code' }])
      case 'link': {
        const t = token as Tokens.Link
        const href = safeHref(t.href)
        return inline(t.tokens, href ? [...marks, { type: 'link', attrs: { href } }] : marks)
      }
      case 'image':
        return textNodes((token as Tokens.Image).text, marks)
      case 'br':
        return [{ type: 'hardBreak' }]
      case 'html':
        return [] // inline tags like <b> are dropped; their inner text is a separate token
      default:
        return 'text' in token && typeof token.text === 'string' ? textNodes(token.text, marks) : []
    }
  })
}

/** ProseMirror forbids empty text nodes, so empty strings produce nothing. */
function textNodes(text: string, marks: Mark[] = []): JSONContent[] {
  const decoded = decodeEntities(text)
  if (!decoded) return []
  return [{ type: 'text', text: decoded, ...(marks.length ? { marks } : {}) }]
}

export function safeHref(href: string): string | null {
  try {
    const url = new URL(href)
    return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : null
  } catch {
    return null // relative or malformed URLs are dropped rather than guessed at
  }
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match
  })
}
