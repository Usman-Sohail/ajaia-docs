import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { JSONContent } from '@tiptap/react'
import { describe, expect, it, vi } from 'vitest'
import { DocumentEditor } from './DocumentEditor'

const saved: JSONContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Agenda' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'underlined', marks: [{ type: 'underline' }] },
      ],
    },
    { type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] }] },
  ],
}

describe('DocumentEditor', () => {
  it('initialises from saved rich-text JSON', () => {
    const { container } = render(<DocumentEditor initialContent={saved} readOnly={false} onChange={vi.fn()} />)
    expect(container.querySelector('h2')).toHaveTextContent('Agenda')
    expect(container.querySelector('strong')).toHaveTextContent('bold')
    expect(container.querySelector('u')).toHaveTextContent('underlined')
    expect(container.querySelector('ol li')).toHaveTextContent('first')
  })

  it('emits structured JSON with formatting when the toolbar is used', async () => {
    const onChange = vi.fn()
    render(<DocumentEditor initialContent={{ type: 'doc', content: [{ type: 'paragraph' }] }} readOnly={false} onChange={onChange} />)
    const user = userEvent.setup()

    await user.click(screen.getByRole('textbox', { name: 'Document content' }))
    await user.click(screen.getByRole('button', { name: 'Bold' }))
    await user.keyboard('Hi')

    await waitFor(() => expect(onChange).toHaveBeenCalled())
    const last: JSONContent = onChange.mock.calls.at(-1)![0]
    expect(last.content![0].content).toEqual([{ type: 'text', text: 'Hi', marks: [{ type: 'bold' }] }])
    expect(screen.getByRole('button', { name: 'Bold' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('is not editable and disables formatting in read-only mode', () => {
    render(<DocumentEditor initialContent={saved} readOnly onChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Document content' })).toHaveAttribute('contenteditable', 'false')
    expect(screen.getByRole('button', { name: 'Bold' })).toBeDisabled()
  })
})
