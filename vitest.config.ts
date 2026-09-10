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
    // next-auth hace cross-imports internos (ej. 'next/server' sin extensión) que
    // solo resuelven bien pasando por el transform de Vite, no por el loader ESM
    // nativo de Node — necesario desde que auth.ts (real, no mockeado) se importa
    // directo en auth.test.ts.
    server: { deps: { inline: ['next-auth', '@auth/core'] } },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
