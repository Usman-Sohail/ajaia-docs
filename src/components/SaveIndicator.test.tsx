import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SaveIndicator } from './SaveIndicator'

describe('SaveIndicator', () => {
  it.each([
    [{ status: 'saving' } as const, 'Saving…'],
    [{ status: 'saved' } as const, 'Saved'],
    [{ status: 'unsaved' } as const, 'Unsaved changes'],
  ])('renders %o as "%s"', (state, text) => {
    render(<SaveIndicator state={state} />)
    expect(screen.getByRole('status')).toHaveTextContent(text)
  })

  it('shows a failure with a retry action, never "Saved"', async () => {
    const onRetry = vi.fn()
    render(<SaveIndicator state={{ status: 'error', message: 'Network down' }} onRetry={onRetry} />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Save failed')
    expect(alert).not.toHaveTextContent(/^Saved/)
    expect(alert).toHaveAttribute('title', 'Network down')
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('shows "View only" for read-only documents', () => {
    render(<SaveIndicator state={{ status: 'saved' }} readOnly />)
    expect(screen.getByText('View only')).toBeInTheDocument()
  })
})
