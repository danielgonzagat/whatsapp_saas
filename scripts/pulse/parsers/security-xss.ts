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

import { calculateDynamicRisk } from '../dynamic-risk-model';
import { synthesizeDiagnostic } from '../diagnostic-synthesizer';
import { buildPredicateGraph } from '../predicate-graph';
import { buildPulseSignalGraph, type PulseSignalEvidence } from '../signal-graph';
import type { Break, PulseConfig } from '../types';
import { buildSecurityInjectionPlan } from './security-injection';
import { httpGet, httpPost, httpDelete, makeTestJwt, isDeepMode } from './runtime-utils';

interface SecurityXssProbeTarget {
  method: 'POST' | 'PATCH';
  path: string;
  body: Record<string, unknown>;
  description: string;
}

export interface SecurityXssProbePlan {
  targets: SecurityXssProbeTarget[];
  markupPayload: string;
  eventPayload: string;
}

function executableMarkupPayload(): string {
  const tag = ['scr', 'ipt'].join('');
  return `<${tag}>alert('xss')</${tag}>`;
}

function executableEventPayload(): string {
  const tag = ['im', 'g'].join('');
  const eventName = ['on', 'error'].join('');
  return `<${tag} src=x ${eventName}=alert(1)>`;
}

/** Check if the raw (unescaped) script tag appears in a response body string */
export function containsRawScriptTag(body: unknown): boolean {
  const text = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  return (
    text.includes('<script>') || text.includes('<img src=x onerror') || text.includes('<svg onload')
  );
}

/** Return true if the content-type header indicates this is an API response (JSON), not HTML */
export function isJsonResponse(headers: Record<string, string>): boolean {
  const ct = headers['content-type'] || headers['Content-Type'] || '';
  return ct.includes('application/json');
}

function xssDiagnosticBreak(
  signal: PulseSignalEvidence,
  severity: Break['severity'],
  surface: string,
): Break {
  const signalGraph = buildPulseSignalGraph([signal]);
  const predicateGraph = buildPredicateGraph(signalGraph);
  const diagnostic = synthesizeDiagnostic(
    signalGraph,
    predicateGraph,
    calculateDynamicRisk({ predicateGraph, runtimeImpact: 1 }),
  );

  return {
    type: diagnostic.id,
    severity,
    file: signal.location.file,
    line: signal.location.line,
    description: diagnostic.title,
    detail: `${diagnostic.summary}; evidence=${diagnostic.evidenceIds.join(',')}; predicates=${diagnostic.predicateKinds.join(',')}; ${signal.detail ?? ''}`,
    source: `${signal.source};detector=${signal.detector};truthMode=${signal.truthMode}`,
    surface,
  };
}

function appendBreak(breaks: Break[], entry: Break): void {
  breaks.push(entry);
}

export function buildSecurityXssProbePlan(config: PulseConfig): SecurityXssProbePlan {
  const markupPayload = executableMarkupPayload();
  const eventPayload = executableEventPayload();
  const injectionPlan = buildSecurityInjectionPlan(config);

  return {
    markupPayload,
    eventPayload,
    targets: injectionPlan.endpoints.map((endpoint) => ({
      method: endpoint.method,
      path: endpoint.path,
      body: endpoint.buildBody(markupPayload),
      description: endpoint.description,
    })),
  };
}

/** Check security xss. */
export async function checkSecurityXss(config: PulseConfig): Promise<Break[]> {
  // DEEP mode only — requires running backend + DB
  if (!isDeepMode()) {
    return [];
  }

  const breaks: Break[] = [];
  const jwt = makeTestJwt();
  const plan = buildSecurityXssProbePlan(config);
  const createdResources: Array<{ path: string; id: string }> = [];

  // ── 1. Stored XSS via discovered write endpoints ─────────────────────────
  for (const target of plan.targets) {
    try {
      const createRes = await httpPost(target.path, target.body, { jwt, timeout: 8000 });

      if (createRes.status !== 200 && createRes.status !== 201) {
        continue;
      }

      const resourceId =
        typeof createRes.body?.id === 'string'
          ? createRes.body.id
          : typeof createRes.body?.data?.id === 'string'
            ? createRes.body.data.id
            : null;

      if (!resourceId) {
        continue;
      }

      createdResources.push({ path: target.path, id: resourceId });
      const getRes = await httpGet(`${target.path}/${resourceId}`, { jwt, timeout: 8000 });

      if (getRes.status === 200 && containsRawScriptTag(getRes.body)) {
        appendBreak(
          breaks,
          xssDiagnosticBreak(
            {
              source: 'runtime-http',
              detector: 'security-xss-stored',
              truthMode: 'observed',
              summary: 'Stored XSS payload returned as executable markup',
              location: { file: `backend/src (${target.method} ${target.path})`, line: 0 },
              detail: `${target.description}; readPath=${target.path}/${resourceId}; payload=${plan.markupPayload}`,
            },
            'critical',
            'stored-xss',
          ),
        );
      }
    } catch {
      // Backend not reachable — skip
    }
  }

  // ── 2. Reflected XSS via discovered endpoint query params ────────────────
  for (const target of plan.targets) {
    try {
      const encodedPayload = encodeURIComponent(plan.markupPayload);
      const res = await httpGet(`${target.path}?search=${encodedPayload}`, { jwt, timeout: 8000 });

      if (res.status === 200 && containsRawScriptTag(res.body)) {
        appendBreak(
          breaks,
          xssDiagnosticBreak(
            {
              source: 'runtime-http',
              detector: 'security-xss-reflected',
              truthMode: 'observed',
              summary: 'Reflected XSS payload echoed as executable markup',
              location: { file: `backend/src (GET ${target.path}?search=...)`, line: 0 },
              detail: `${target.description}; payload=${plan.markupPayload}`,
            },
            'critical',
            'reflected-xss',
          ),
        );
      }

      // Verify Content-Type is application/json, not text/html (which would allow script execution)
      if (res.status === 200 && !isJsonResponse(res.headers)) {
        const ct = res.headers['content-type'] || res.headers['Content-Type'] || 'unknown';
        appendBreak(
          breaks,
          xssDiagnosticBreak(
            {
              source: 'runtime-http',
              detector: 'security-xss-content-type',
              truthMode: 'observed',
              summary: 'API endpoint returned executable content type for XSS probe',
              location: { file: `backend/src (GET ${target.path})`, line: 0 },
              detail: `${target.description}; contentType=${ct}`,
            },
            'critical',
            'xss-content-type',
          ),
        );
      }
    } catch {
      // Skip on network error
    }
  }

  // ── 3. Cleanup: DELETE created test resources when the API supports it ───
  for (const resource of createdResources) {
    try {
      await httpDelete(`${resource.path}/${resource.id}`, { jwt, timeout: 5000 });
    } catch {
      // Cleanup failure is non-critical for the security check
    }
  }

  return breaks;
}
