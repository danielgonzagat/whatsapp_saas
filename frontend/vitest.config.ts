import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    reporters: [
      'default',
      [
        'junit',
        {
          suiteName: 'frontend',
          outputFile: './test-results/frontend-junit.xml',
        },
      ],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary', 'clover'],
      reportsDirectory: './coverage',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
