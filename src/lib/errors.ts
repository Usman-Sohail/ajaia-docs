const NETWORK_ERROR = /failed to fetch|networkerror|load failed|network request failed/i

/** Extracts a human-readable message from Supabase/PostgREST errors and other throwables. */
export function errorMessage(error: unknown, fallback = 'Something went wrong'): string {
  let message: string | undefined
  if (error instanceof Error) message = error.message
  else if (typeof error === 'object' && error !== null && 'message' in error) {
    const value = (error as { message: unknown }).message
    if (typeof value === 'string') message = value
  }
  if (!message) return fallback
  // Browsers report offline/DNS/CORS failures as opaque fetch errors.
  if (NETWORK_ERROR.test(message)) return 'Network error. Check your connection and try again.'
  return message
}
