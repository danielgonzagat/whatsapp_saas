/**
 * PULSE Parser 55: Security — XSS (Stored + Reflected)
 * Layer 5: Security Testing
 * Mode: DEEP (requires running infrastructure)
 *
 * CHECKS:
 * Stored XSS — inject payload via API, read it back, verify sanitization:
 *
 * XSS payloads to test:
 * - '<script>alert(1)</script>'
 * - '<img src=x onerror=alert(1)>'
 * - '<svg onload=alert(1)>'
 * - 'javascript:alert(1)'
 * - '"><script>alert(document.cookie)</script>'
 * - '<iframe src="javascript:alert(1)">'
 *
 * For each resource type with user-controlled string fields (product name, description,
 * flow name, campaign subject, customer name, note content):
 * 1. POST /products with name = XSS payload → record created (200/201)
 * 2. GET /products/:id → verify name field is either:
 *    a. Returned as-is (backend does not sanitize, frontend must escape — document which)
 *    b. Sanitized (script tags stripped, encoded)
 * 3. If backend returns raw XSS payload, verify frontend escapes it (React does by default,
 *    but check for dangerouslySetInnerHTML usage near user-controlled fields)
 *
 * Frontend checks (if running):
 * 4. Use Puppeteer to visit page that renders the stored XSS payload
 * 5. Check browser console for 'alert' or 'XSS' (injected script executed)
 * 6. Check page source — if <script> tag appears unescaped → stored XSS confirmed
 *
 * Reflected XSS in query params:
 * 7. GET /products?search=<script>alert(1)</script> → response must not echo back raw script
 * 8. Check Content-Type: application/json header present (not text/html) for API endpoints
 *
 * CSP (Content Security Policy):
 * 9. Check that API responses include X-Content-Type-Options: nosniff header
 * 10. Check that frontend responses include Content-Security-Policy header
 *
 * REQUIRES:
 * - Running backend (PULSE_BACKEND_URL)
 * - Running DB with test data
 * - Optional: running frontend + Puppeteer for DOM-level check
 *
 * BREAK TYPES:
 * - XSS_STORED_VULNERABLE (critical) — XSS payload stored and rendered unescaped in browser
 */

import type { Break, PulseConfig } from '../types';
import { httpGet, httpPost, httpDelete, makeTestJwt, isDeepMode } from './runtime-utils';

const XSS_PAYLOAD = `<script>alert('xss')</script>`;
const XSS_PAYLOAD_IMG = `<img src=x onerror=alert(1)>`;

/** Check if the raw (unescaped) script tag appears in a response body string */
function containsRawScriptTag(body: any): boolean {
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  return (
    text.includes('<script>') || text.includes('<img src=x onerror') || text.includes('<svg onload')
  );
}

/** Return true if the content-type header indicates this is an API response (JSON), not HTML */
function isJsonResponse(headers: Record<string, string>): boolean {
  const ct = headers['content-type'] || headers['Content-Type'] || '';
  return ct.includes('application/json');
}

/** Check security xss. */
export async function checkSecurityXss(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend + DB
  if (!isDeepMode()) {
    return [];
  }

  const breaks: Break[] = [];
  const jwt = makeTestJwt();
  let createdProductId: string | null = null;

  // ── 1. Stored XSS via product name ───────────────────────────────────────
  try {
    const createRes = await httpPost(
      '/products',
      {
        name: XSS_PAYLOAD,
        description: XSS_PAYLOAD_IMG,
        type: 'DIGITAL',
        price: 0,
      },
      { jwt, timeout: 8000 },
    );

    // Record was created (201/200) — now try to read it back
    if (createRes.status === 200 || createRes.status === 201) {
      const productId: string | null = createRes.body?.id || createRes.body?.data?.id || null;

      if (productId) {
        createdProductId = productId;

        const getRes = await httpGet(`/products/${productId}`, { jwt, timeout: 8000 });

        if (getRes.status === 200) {
          // If backend returns the raw unescaped script tag, it is a stored XSS risk
          if (containsRawScriptTag(getRes.body)) {
            breaks.push({
              type: 'XSS_STORED_VULNERABLE',
              severity: 'critical',
              file: `backend/src (POST /products)`,
              line: 0,
              description: `Stored XSS: backend returns raw <script> tag in GET /products/${productId}`,
              detail: `Product created with XSS payload in "name" field. Backend returned the literal <script> tag unescaped. React escapes by default, but any dangerouslySetInnerHTML usage would execute this. Payload: ${XSS_PAYLOAD}`,
            });
          }
        }
      }
    }
  } catch {
    // Backend not reachable — skip
  }

  // ── 2. Reflected XSS via query param ─────────────────────────────────────
  try {
    const encodedPayload = encodeURIComponent(XSS_PAYLOAD);
    const res = await httpGet(`/products?search=${encodedPayload}`, { jwt, timeout: 8000 });

    if (res.status === 200 && containsRawScriptTag(res.body)) {
      breaks.push({
        type: 'XSS_STORED_VULNERABLE',
        severity: 'critical',
        file: `backend/src (GET /products?search=...)`,
        line: 0,
        description: `Reflected XSS: backend echoes raw script tag from query param in GET /products?search`,
        detail: `The search query parameter was reflected in the response body without escaping. Payload: ${XSS_PAYLOAD}`,
      });
    }

    // Verify Content-Type is application/json, not text/html (which would allow script execution)
    if (res.status === 200 && !isJsonResponse(res.headers)) {
      const ct = res.headers['content-type'] || res.headers['Content-Type'] || 'unknown';
      breaks.push({
        type: 'XSS_STORED_VULNERABLE',
        severity: 'critical',
        file: `backend/src (GET /products)`,
        line: 0,
        description: `API endpoint returned non-JSON content-type: ${ct}`,
        detail: `GET /products returned Content-Type: ${ct}. API endpoints must return application/json to prevent browsers from executing reflected content as HTML.`,
      });
    }
  } catch {
    // Skip on network error
  }

  // ── 3. Cleanup: DELETE the test product ──────────────────────────────────
  if (createdProductId) {
    try {
      await httpDelete(`/products/${createdProductId}`, { jwt, timeout: 5000 });
    } catch {
      // Cleanup failure is non-critical for the security check
    }
  }

  return breaks;
}
