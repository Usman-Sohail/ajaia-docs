// Applies supabase/migrations to the project in SUPABASE_DB_URL using the Supabase CLI.
import { spawnSync } from 'node:child_process'
import { loadLocalEnv, requireEnv } from './env'

loadLocalEnv()
const dbUrl = requireEnv('SUPABASE_DB_URL')
const result = spawnSync('npx', ['supabase', 'db', 'push', '--db-url', dbUrl, ...process.argv.slice(2)], {
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
