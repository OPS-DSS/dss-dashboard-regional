import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    // loadAllDatasets reads the real committed sample parquet files, which
    // takes noticeably longer than typical unit-test assertions.
    testTimeout: 20_000,
  },
})
