import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    reporters: [
      'default',
      [
        'junit',
        {
          suiteName: 'worker',
          outputFile: './test-results/worker-junit.xml',
        },
      ],
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'json-summary', 'clover'],
      reportsDirectory: './coverage',
    },
  },
});
