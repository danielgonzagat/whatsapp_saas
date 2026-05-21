import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    exclude: ['dist/**', 'node_modules/**'],
    pool: 'forks',
    fileParallelism: false,
    reporters: [
      'verbose',
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
      thresholds: {
        lines: 67,
        branches: 52,
        functions: 73,
        statements: 67,
      },
    },
  },
});
