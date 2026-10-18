import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ImportButton } from './ImportButton'
import { ToastProvider } from './Toaster'

function setup() {
  const onImport = vi.fn().mockResolvedValue(undefined)
  render(
    <ToastProvider>
      <ImportButton onImport={onImport} />
    </ToastProvider>,
  )
  // applyAccept: false lets us simulate a user picking a file the accept filter would hide.
  const user = userEvent.setup({ applyAccept: false })
  return { onImport, user, input: screen.getByTestId('import-input') as HTMLInputElement }
}

describe('ImportButton', () => {
  it('converts a Markdown file and hands the document to onImport', async () => {
    const { onImport, user, input } = setup()
    await user.upload(input, new File(['# Roadmap\n\n- **Ship** v1'], 'roadmap.md', { type: 'text/markdown' }))

    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1))
    const [{ title, content }] = onImport.mock.calls[0]
    expect(title).toBe('roadmap')
    expect(content.content[0]).toMatchObject({ type: 'heading', attrs: { level: 1 } })
    expect(content.content[1].type).toBe('bulletList')
  })

  it('shows an error and does not create a document for unsupported files', async () => {
    const { onImport, user, input } = setup()
    await user.upload(input, new File(['PK…'], 'contract.docx'))

    expect(await screen.findByRole('alert')).toHaveTextContent(/isn't supported/)
    expect(onImport).not.toHaveBeenCalled()
  })

  it('shows an error for empty files', async () => {
    const { onImport, user, input } = setup()
    await user.upload(input, new File([''], 'empty.txt', { type: 'text/plain' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/empty/)
    expect(onImport).not.toHaveBeenCalled()
  })

  it('surfaces persistence failures from onImport', async () => {
    const { onImport, user, input } = setup()
    onImport.mockRejectedValueOnce(new Error('Network request failed'))
    await user.upload(input, new File(['hello'], 'notes.txt', { type: 'text/plain' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Network request failed')
  })
})
