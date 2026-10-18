import { describe, expect, it } from 'vitest'
import { errorMessage } from './errors'

describe('errorMessage', () => {
  it('uses Error and PostgREST-style messages', () => {
    expect(errorMessage(new Error('Only the owner can rename it'))).toBe('Only the owner can rename it')
    expect(errorMessage({ message: 'No Ajaia Docs account uses that email.', code: 'P0002' })).toBe(
      'No Ajaia Docs account uses that email.',
    )
  })

  it('turns opaque browser fetch failures into an actionable message', () => {
    expect(errorMessage({ message: 'TypeError: Failed to fetch' })).toMatch(/Network error/)
    expect(errorMessage(new TypeError('Load failed'))).toMatch(/Network error/)
  })

  it('falls back for unknown values', () => {
    expect(errorMessage(null, 'Save failed')).toBe('Save failed')
    expect(errorMessage(new Error(''), 'Save failed')).toBe('Save failed')
  })
})
