/**
 * @format
 * Vitest configuration for tucaken-app server function tests.
 *
 * Uses the same path aliases as vite.config.ts so that shared package
 * imports resolve correctly in the test environment.
 */

import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@/': fileURLToPath(new URL('./src/', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/__tests__/**/*.test.ts', 'src/__tests__/**/*.test.tsx'],
    env: {
      STRATEGIST_TABLE_NAME: 'test-strategist-table',
      ARTICLES_TABLE_NAME: 'test-articles-table',
      AWS_REGION: 'eu-west-1',
    },
    coverage: {
      provider: 'v8',
      include: ['src/server/**/*.ts'],
      exclude: ['src/server/security-headers.ts'],
    },
  },
})
