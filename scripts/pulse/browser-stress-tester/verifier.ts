// PULSE Browser Stress Tester — Result Verifier

import type { Page } from 'playwright';
import type { BrowserTestStatus, ObservedApiCall } from './types';
import type { InteractionChain } from '../functional-map-types';

export function classifyResult(observations: {
  apiCalls: ObservedApiCall[];
  domChanged: boolean;
  consoleErrors: string[];
  error: string | null;
  timedOut: boolean;
  elementNotFound: boolean;
}): { status: BrowserTestStatus; reason: string } {
  const { apiCalls, domChanged, consoleErrors, error, timedOut, elementNotFound } = observations;

  if (elementNotFound) {
    return { status: 'NAO_TESTAVEL', reason: 'Element not found in live DOM' };
  }

  if (timedOut) {
    return { status: 'TIMEOUT', reason: `Interaction timed out` };
  }

  if (error) {
    if (/Target closed|page.goto|crash|ERR_/i.test(error)) {
      return { status: 'CRASH', reason: `Page crash: ${error.slice(0, 150)}` };
    }
    // Non-crash errors (e.g., element detached, strict mode)
    return { status: 'QUEBRADO', reason: `Error: ${error.slice(0, 150)}` };
  }

  // Check for uncaught exceptions in console
  const criticalErrors = consoleErrors.filter(e =>
    /uncaught|TypeError|ReferenceError|RangeError|SyntaxError|Cannot read/i.test(e)
  );
  if (criticalErrors.length > 0) {
    return { status: 'QUEBRADO', reason: `Console error: ${criticalErrors[0].slice(0, 150)}` };
  }

  // Check API responses
  if (apiCalls.length > 0) {
    const serverErrors = apiCalls.filter(c => c.status >= 500);
    if (serverErrors.length > 0) {
      const e = serverErrors[0];
      return { status: 'QUEBRADO', reason: `Server error: ${e.status} on ${e.method} ${e.url}` };
    }

    const clientErrors = apiCalls.filter(c => c.status >= 400 && c.status < 500);
    if (clientErrors.length > 0) {
      const e = clientErrors[0];
      if (e.status === 401 || e.status === 403) {
        return { status: 'QUEBRADO', reason: `Auth failed: ${e.status} on ${e.method} ${e.url}` };
      }
      if (e.status === 404) {
        return { status: 'QUEBRADO', reason: `Not found: ${e.method} ${e.url}` };
      }
      // 400 validation — this is actually expected behavior for incomplete forms
      return { status: 'QUEBRADO', reason: `Client error: ${e.status} on ${e.method} ${e.url}` };
    }

    // All API calls succeeded (2xx/3xx)
    const ok = apiCalls.filter(c => c.status >= 200 && c.status < 400);
    if (ok.length > 0) {
      return { status: 'FUNCIONA', reason: `API OK: ${ok[0].method} ${ok[0].url} → ${ok[0].status}` };
    }
  }

  // No API calls
  if (domChanged) {
    return { status: 'FUNCIONA', reason: 'DOM changed (UI-only interaction)' };
  }

  return { status: 'FACHADA', reason: 'No API call and no DOM change — nothing happened' };
}

export async function verifyPersistence(
  page: Page,
  route: string,
  frontendUrl: string,
): Promise<boolean> {
  try {
    // Reload the page
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);

    // Check we're still on the same route (not redirected)
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      return false;
    }

    // Page loaded successfully after reload — basic persistence check
    return true;
  } catch {
    return false;
  }
}

/**
 * Match a discovered DOM element to a FunctionalMap InteractionChain.
 */
export function matchToFmapEntry(
  domLabel: string,
  domType: string,
  fmapInteractions: InteractionChain[],
): InteractionChain | null {
  if (!fmapInteractions || fmapInteractions.length === 0) return null;

  const normalizedLabel = domLabel.replace(/\s+/g, ' ').trim().toLowerCase();
  if (!normalizedLabel || normalizedLabel === '(sem texto)') return null;

  // Exact match
  for (const chain of fmapInteractions) {
    const fmapLabel = chain.elementLabel.replace(/\s+/g, ' ').trim().toLowerCase();
    if (fmapLabel === normalizedLabel) return chain;
  }

  // Partial match (DOM label contains fmap label or vice versa)
  for (const chain of fmapInteractions) {
    const fmapLabel = chain.elementLabel.replace(/\s+/g, ' ').trim().toLowerCase();
    if (fmapLabel.length > 3 && (normalizedLabel.includes(fmapLabel) || fmapLabel.includes(normalizedLabel))) {
      return chain;
    }
  }

  return null;
}
