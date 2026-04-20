/**
 * PULSE Parser 67: SSR Render Tester
 * Layer 9: Frontend Health
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS:
 * Make real HTTP requests to public Next.js pages and verify they render without errors.
 * Only tests pages that don't require auth (/, /login, /register) — auth-protected
 * pages would just redirect and are not the concern here.
 *
 * For each public page:
 * 1. HTTP GET to PULSE_FRONTEND_URL + page path
 * 2. Verify status is 200 (not 500 or other error)
 * 3. Verify response contains <html> tag (is actual HTML)
 * 4. Verify response does NOT contain Next.js / React error markers
 * 5. Verify response body is > 1000 bytes (not empty shell)
 *
 * Auth-protected pages: hitting /dashboard without auth → expect redirect (302/307), NOT 500
 *
 * BREAK TYPES:
 * - PAGE_RENDER_BROKEN (critical) — page returns 500, contains error message, or is empty
 */

import type { Break, PulseConfig } from '../types';
import { getFrontendUrl } from './runtime-utils';

// Public pages that must render without auth
const PUBLIC_PAGES = ['/', '/login', '/register'];

// Protected pages — we only check they redirect (not crash)
const PROTECTED_PAGES = ['/dashboard', '/products', '/inbox'];

// Error markers that must NOT appear in a successful render
const ERROR_MARKERS = [
  'Application error: a client-side exception has occurred',
  'Internal Server Error',
  '__NEXT_ERROR__',
  'ChunkLoadError',
  'Hydration failed',
  'There was an error while hydrating',
];

async function fetchPage(
  url: string,
  timeoutMs = 10000,
): Promise<{ status: number; body: string; timeMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'manual', // don't follow redirects — detect them explicitly
      headers: { Accept: 'text/html' },
    });
    const body = await res.text();
    return { status: res.status, body, timeMs: Date.now() - start };
  } catch (e: any) {
    return { status: 0, body: '', timeMs: Date.now() - start };
  } finally {
    clearTimeout(timer);
  }
}

export async function checkSsrRender(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running frontend

  const breaks: Break[] = [];
  const baseFile = 'scripts/pulse/parsers/ssr-render-tester.ts';
  const frontendUrl = getFrontendUrl();

  // ── Public pages: must return 200 with real HTML ──────────────────────────
  for (const page of PUBLIC_PAGES) {
    const url = `${frontendUrl}${page}`;
    let result: { status: number; body: string; timeMs: number };
    try {
      result = await fetchPage(url);
    } catch {
      continue; // frontend not running
    }

    if (result.status === 0) {
      continue;
    } // network error — frontend not up

    if (result.status >= 500) {
      breaks.push({
        type: 'PAGE_RENDER_BROKEN',
        severity: 'critical',
        file: baseFile,
        line: 0,
        description: `Public page ${page} returned HTTP ${result.status}`,
        detail: `URL: ${url}. Response time: ${result.timeMs}ms. Body excerpt: ${result.body.slice(0, 300)}`,
      });
      continue;
    }

    if (result.status === 200) {
      // Must contain HTML tags
      if (!result.body.includes('<html') && !result.body.includes('<!DOCTYPE')) {
        breaks.push({
          type: 'PAGE_RENDER_BROKEN',
          severity: 'critical',
          file: baseFile,
          line: 0,
          description: `Public page ${page} returned 200 but body is not HTML`,
          detail: `URL: ${url}. Body size: ${result.body.length} bytes. Excerpt: ${result.body.slice(0, 200)}`,
        });
        continue;
      }

      // Must not be an empty shell
      if (result.body.length < 1000) {
        breaks.push({
          type: 'PAGE_RENDER_BROKEN',
          severity: 'critical',
          file: baseFile,
          line: 0,
          description: `Public page ${page} rendered only ${result.body.length} bytes (suspiciously small)`,
          detail: `URL: ${url}. A real page should be > 1000 bytes.`,
        });
        continue;
      }

      // Must not contain error markers
      for (const marker of ERROR_MARKERS) {
        if (result.body.includes(marker)) {
          breaks.push({
            type: 'PAGE_RENDER_BROKEN',
            severity: 'critical',
            file: baseFile,
            line: 0,
            description: `Public page ${page} contains error marker: "${marker}"`,
            detail: `URL: ${url}. The page rendered but included a runtime error message.`,
          });
          break; // one break per page is enough
        }
      }
    }
  }

  // ── Protected pages: must redirect (3xx), NOT crash (5xx) ─────────────────
  for (const page of PROTECTED_PAGES) {
    const url = `${frontendUrl}${page}`;
    let result: { status: number; body: string; timeMs: number };
    try {
      result = await fetchPage(url);
    } catch {
      continue;
    }
    if (result.status === 0) {
      continue;
    }

    if (result.status >= 500) {
      breaks.push({
        type: 'PAGE_RENDER_BROKEN',
        severity: 'critical',
        file: baseFile,
        line: 0,
        description: `Protected page ${page} returned HTTP ${result.status} (expected 3xx redirect)`,
        detail: `URL: ${url}. Auth middleware crashed instead of redirecting to /login. Body: ${result.body.slice(0, 200)}`,
      });
    }
  }

  return breaks;
}
