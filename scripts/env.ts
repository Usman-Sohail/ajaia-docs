/** Loads .env.local into process.env for Node scripts/tests (Vite does this for the browser build). */
export function loadLocalEnv(): void {
  try {
    process.loadEnvFile('.env.local')
  } catch (error) {
    // A missing file is fine (CI may provide real env vars); anything else is a real problem.
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value || /YOUR-|_xxx$|choose-a-strong-password/.test(value)) {
    throw new Error(`Missing ${name}. Set it in .env.local (see .env.example).`)
  }
  return value
}
