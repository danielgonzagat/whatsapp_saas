import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiUrl } from '../http';

describe('apiUrl', () => {
  it('prepends API_BASE to a path starting with /', () => {
    const result = apiUrl('/kloel/wallet/123/balance');
    expect(result).toContain('/kloel/wallet/123/balance');
    // Should not have double slashes in the middle
    expect(result).not.toMatch(/[^:]\/\//);
  });

  it('handles paths without leading slash', () => {
    const result = apiUrl('health');
    expect(result).toContain('/health');
  });
});

/**
 * P6.5-2 / I19 — API Base URL Must Be Explicit in Production.
 *
 * The previous implementation silently fell back to
 * window.location.origin when NEXT_PUBLIC_API_URL was unset. The
 * fail-fast change must be enforced via tests so a future refactor
 * cannot accidentally re-introduce the silent fallback.
 *
 * Each test resets the module cache and re-imports `http.ts` so that
 * the env variables read at module-load time reflect the test setup.
 */
describe('http.ts — I19 fail-fast in production', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  const ORIGINAL_API_URL = process.env.NEXT_PUBLIC_API_URL;
  const ORIGINAL_LEGACY = process.env.NEXT_PUBLIC_SERVICE_BASE_URL;
  const ORIGINAL_BACKEND = process.env.BACKEND_URL;
  const ORIGINAL_SERVICE = process.env.SERVICE_BASE_URL;

  beforeEach(() => {
    vi.resetModules();
    delete process.env.NEXT_PUBLIC_API_URL;
    delete process.env.NEXT_PUBLIC_SERVICE_BASE_URL;
    delete process.env.BACKEND_URL;
    delete process.env.SERVICE_BASE_URL;
  });

  afterEach(() => {
    if (ORIGINAL_NODE_ENV === undefined) {
      // NODE_ENV is read-only on `process.env` typings; cast to bypass
      // for both delete and assign so the helper compiles cleanly.
      (process.env as Record<string, string | undefined>).NODE_ENV = undefined;
    } else {
      (process.env as Record<string, string>).NODE_ENV = ORIGINAL_NODE_ENV;
    }
    if (ORIGINAL_API_URL !== undefined) {
      process.env.NEXT_PUBLIC_API_URL = ORIGINAL_API_URL;
    }
    if (ORIGINAL_LEGACY !== undefined) {
      process.env.NEXT_PUBLIC_SERVICE_BASE_URL = ORIGINAL_LEGACY;
    }
    if (ORIGINAL_BACKEND !== undefined) {
      process.env.BACKEND_URL = ORIGINAL_BACKEND;
    }
    if (ORIGINAL_SERVICE !== undefined) {
      process.env.SERVICE_BASE_URL = ORIGINAL_SERVICE;
    }
  });

  it('throws at module load when NODE_ENV=production and no API URL is set', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    // Dynamic import — fails immediately with the I19 error.
    await expect(import('../http')).rejects.toThrow(
      /NEXT_PUBLIC_API_URL is required in production/,
    );
  });

  it('uses NEXT_PUBLIC_API_URL when set in production', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_API_URL = 'https://api.kloel.com';
    const mod = await import('../http');
    expect(mod.apiUrl('/health')).toBe('https://api.kloel.com/health');
  });

  it('falls through to BACKEND_URL when NEXT_PUBLIC_API_URL absent in production', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'production';
    process.env.BACKEND_URL = 'https://backend.kloel.internal';
    const mod = await import('../http');
    expect(mod.apiUrl('/health')).toBe('https://backend.kloel.internal/health');
  });

  it('does NOT throw in dev (NODE_ENV != production) even when API URL is unset', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'development';
    // Dev import must succeed; the dev fallback to localhost / same-origin
    // is intentional for the hot-reload loop.
    await expect(import('../http')).resolves.toBeDefined();
  });

  it('does NOT throw in test environment', async () => {
    (process.env as Record<string, string>).NODE_ENV = 'test';
    await expect(import('../http')).resolves.toBeDefined();
  });
});
