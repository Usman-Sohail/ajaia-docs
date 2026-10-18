import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/** Names of required browser env vars that are missing (shown on a setup screen). */
export const missingEnv = [
  !url && 'VITE_SUPABASE_URL',
  !key && 'VITE_SUPABASE_PUBLISHABLE_KEY',
].filter(Boolean) as string[]

// A placeholder client keeps module imports safe when env is missing; the app
// renders a configuration screen instead of using it.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
})
