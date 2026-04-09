import { defineConfig, devices } from '@playwright/test';

/**
 * P6.5-1 / I20 — Visual Surface Frozen.
 *
 * Two test directories:
 *   - ./specs    — functional E2E tests (existing Wave 1+2 specs)
 *   - ./visual   — visual regression baselines (Wave 3 P6.5-1)
 *
 * The visual project uses a stricter snapshot policy:
 *   - maxDiffPixelRatio: 0 (zero tolerance — any diff fails)
 *   - threshold: 0           (per-pixel byte equality)
 *   - animations: 'disabled' (eliminates non-determinism from CSS animations)
 *   - caret: 'hide'          (input carets blink and would diff)
 *
 * Baselines live alongside the spec under
 * `e2e/visual/critical-flows.spec.ts-snapshots/`. Operators commit
 * the snapshots after the first run; subsequent runs enforce zero diff.
 * See e2e/visual/README.md for the operator runbook.
 */
export default defineConfig({
  testDir: './',
  testMatch: ['specs/**/*.spec.ts', 'visual/**/*.spec.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.E2E_API_URL || 'http://localhost:3001',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  /**
   * Strict per-PR visual diff policy. Applies to every screenshot
   * captured by `expect(page).toHaveScreenshot(...)` across all tests.
   */
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0,
      threshold: 0,
      animations: 'disabled',
      caret: 'hide',
    },
  },
  projects: [
    {
      name: 'chromium',
      testMatch: 'specs/**/*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual',
      testMatch: 'visual/**/*.spec.ts',
      use: {
        // Visual specs target the FRONTEND (not the backend API). The
        // frontend URL is read by getE2EBaseUrls() inside the spec —
        // we do not set baseURL here so the spec stays explicit.
        ...devices['Desktop Chrome'],
        // Disable animations + transitions globally to make screenshots
        // deterministic across runs.
        contextOptions: {
          reducedMotion: 'reduce',
        },
      },
    },
  ],
});
