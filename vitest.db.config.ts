import { defineConfig } from 'vitest/config'

// Integration tests that run against a real Supabase project (see README → Testing).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/db/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
