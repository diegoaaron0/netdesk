import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.next'],
    hookTimeout: 20000,
    testTimeout: 20000, // el transform en frío de páginas pesadas (recharts, etc.) puede tardar
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
