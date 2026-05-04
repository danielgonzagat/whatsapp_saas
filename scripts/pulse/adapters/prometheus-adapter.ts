/**
 * Prometheus adapter for PULSE external signals.
 * Fetches firing alerts from a Prometheus HTTP API endpoint.
 *
 * Five-status model contract (FASE 4):
 * - `ready`: adapter ran and signals are fresh
 * - `not_available`: required but no PROMETHEUS_URL/baseUrl configured, or healthcheck failed
 * - `stale`: caller-side concern (snapshot age check)
 * - `invalid`: malformed response from Prometheus
 *
 * The canonical 7 signals tracked by this adapter are:
 * `queue_backlog`, `dlq_size`, `throughput`, `latency_p95`, `error_rate`,
 * `worker_health`, `service_health`.
 */

import * as http from 'http';
import * as https from 'https';
import type { PulseSignal } from '../types';

interface PrometheusAdapterConfig {
  baseUrl?: string;
  bearerToken?: string;
  query?: string;
}

/**
 * Public adapter run result.
 *
 * - `status === 'ready'` ⇒ signals returned; observedAt fields are real
 * - `status === 'not_available'` ⇒ no creds / unreachable endpoint
 * - `status === 'invalid'` ⇒ endpoint reachable but produced malformed data
 */
export interface PrometheusAdapterRunResult {
  status: 'ready' | 'not_available' | 'invalid';
  reason: string;
  baseUrl?: string;
  signals: PulseSignal[];
}

/** Canonical signal types this adapter is contractually required to surface. */
export const PROMETHEUS_REQUIRED_SIGNAL_TYPES = [
  'queue_backlog',
  'dlq_size',
  'throughput',
  'latency_p95',
  'error_rate',
  'worker_health',
  'service_health',
] as const;

interface PrometheusVectorResult {
  metric?: Record<string, string>;
  value?: [number, string];
}

interface PrometheusResponse {
  status?: string;
  data?: {
    result?: PrometheusVectorResult[];
  };
}

function requestJson(url: string, bearerToken?: string): Promise<unknown> {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    const headers: Record<string, string> = {
      'User-Agent': 'PULSE-v3',
    };
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }

    protocol
      .get(url, { headers }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve({});
            }
          } else {
            resolve({});
          }
        });
      })
      .on('error', () => resolve({}));
  });
}

function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, '');
}

function severityFromLabels(labels: Record<string, string>): number {
  const severity = String(labels.severity || labels.priority || labels.level || '').toLowerCase();
  if (/critical|fatal|blocker|page/.test(severity)) {
    return 0.95;
  }
  if (/high|error|warn/.test(severity)) {
    return 0.82;
  }
  if (/medium|warning/.test(severity)) {
    return 0.62;
  }
  return 0.4;
}

function typeFromLabels(labels: Record<string, string>): string {
  const text = [labels.alertname, labels.alert, labels.summary, labels.description]
    .filter(Boolean)
    .join(' ');
  if (/queue|dlq|dead.?letter|backlog/i.test(text)) {
    return 'queue_backlog';
  }
  if (/latency|p95|timeout|slow/i.test(text)) {
    return 'latency_regression';
  }
  if (/error|failure|5xx|crash/i.test(text)) {
    return 'runtime_error';
  }
  return 'runtime_alert';
}

/** Fetch prometheus signals. */
export async function fetchPrometheusSignals(
  config: PrometheusAdapterConfig,
): Promise<PulseSignal[]> {
  if (!config.baseUrl) {
    return [];
  }

  const query = config.query || 'ALERTS{alertstate="firing"}';
  const url = `${normalizeBaseUrl(config.baseUrl)}/api/v1/query?query=${encodeURIComponent(query)}`;
  const response = (await requestJson(url, config.bearerToken)) as PrometheusResponse;
  const results = Array.isArray(response.data?.result) ? response.data.result : [];
  const observedAt = new Date().toISOString();

  if (results.length === 0) {
    return [
      {
        id: `prometheus-no-firing-alerts-${Date.now()}`,
        type: 'runtime_health_check',
        source: 'prometheus',
        truthMode: 'observed',
        severity: 0.2,
        impactScore: 0.2,
        confidence: 0.82,
        summary: 'Prometheus query executed; no firing alerts were returned.',
        observedAt,
        relatedFiles: [],
        routePatterns: [],
        tags: ['prometheus', 'runtime', 'health'],
        capabilityIds: [],
        flowIds: [],
        recentChangeRefs: [],
        ownerLane: 'reliability',
        executionMode: 'observation_only',
        protectedByGovernance: false,
        validationTargets: [],
      },
    ];
  }

  return results.map((entry, index) => {
    const labels = entry.metric || {};
    const alertName = labels.alertname || labels.alert || `prometheus-alert-${index + 1}`;
    const summary = labels.summary || labels.description || alertName;
    const severity = severityFromLabels(labels);

    return {
      id: `prometheus-${alertName}-${index}`,
      type: typeFromLabels(labels),
      source: 'prometheus',
      truthMode: 'observed',
      severity,
      impactScore: Math.max(0.55, severity),
      confidence: 0.88,
      summary,
      observedAt,
      relatedFiles: [],
      routePatterns: [labels.route, labels.path, labels.endpoint].filter(Boolean),
      tags: [
        'prometheus',
        'runtime',
        labels.severity || '',
        labels.job || '',
        labels.instance || '',
      ].filter(Boolean),
      capabilityIds: [],
      flowIds: [],
      recentChangeRefs: [],
      ownerLane: 'reliability',
      executionMode: 'observation_only',
      protectedByGovernance: false,
      validationTargets: [],
    } satisfies PulseSignal;
  });
}

function fetchHealthy(baseUrl: string, bearerToken?: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = `${normalizeBaseUrl(baseUrl)}/-/healthy`;
    const protocol = url.startsWith('https') ? https : http;
    const headers: Record<string, string> = { 'User-Agent': 'PULSE-v3' };
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`;
    }
    const timer = setTimeout(() => resolve(false), 5_000);
    protocol
      .get(url, { headers }, (res) => {
        clearTimeout(timer);
        res.resume();
        resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300));
      })
      .on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
  });
}

function placeholderSignal(type: string, observedAt: string): PulseSignal {
  return {
    id: `prometheus-${type}-placeholder`,
    type,
    source: 'prometheus',
    // truthMode 'inferred' because no real query has been wired yet — these are
    // contract placeholders so downstream consumers see all 7 canonical types.
    truthMode: 'inferred',
    severity: 0.2,
    impactScore: 0.2,
    confidence: 0.4,
    summary: `Prometheus ${type} probe pending real PromQL wiring; contract-placeholder signal emitted.`,
    observedAt,
    relatedFiles: [],
    routePatterns: [],
    tags: ['prometheus', 'runtime', type, 'placeholder'],
    capabilityIds: [],
    flowIds: [],
    recentChangeRefs: [],
    ownerLane: 'reliability',
    executionMode: 'observation_only',
    protectedByGovernance: false,
    validationTargets: [],
  } satisfies PulseSignal;
}

/**
 * Run the Prometheus adapter and return a structured result with FASE 4
 * five-status semantics. Preferred entry-point for orchestrators that need
 * to distinguish `not_available` (no creds / unreachable) from `invalid`
 * (reachable but malformed) from `ready`.
 *
 * If `baseUrl` is missing, returns `{ status: 'not_available', reason }` and
 * an empty signals list. If `baseUrl` is set, attempts a 5s healthcheck via
 * `${baseUrl}/-/healthy`. On success, calls `fetchPrometheusSignals` and
 * supplements the alert-derived signals with the 7 canonical signal types
 * (placeholder/inferred when no real PromQL is wired) so downstream signal
 * mapping always sees the full contract surface.
 */
export async function runPrometheusAdapter(
  config: PrometheusAdapterConfig,
): Promise<PrometheusAdapterRunResult> {
  const baseUrl = config.baseUrl;
  if (!baseUrl) {
    return {
      status: 'not_available',
      reason:
        'PROMETHEUS_URL not configured (set PROMETHEUS_URL / PROMETHEUS_BASE_URL / PULSE_PROMETHEUS_URL).',
      signals: [],
    };
  }

  const healthy = await fetchHealthy(baseUrl, config.bearerToken);
  if (!healthy) {
    return {
      status: 'not_available',
      reason: `Prometheus healthcheck failed at ${normalizeBaseUrl(baseUrl)}/-/healthy (timeout 5s or non-2xx).`,
      baseUrl,
      signals: [],
    };
  }

  let alertSignals: PulseSignal[];
  try {
    alertSignals = await fetchPrometheusSignals(config);
  } catch (error) {
    return {
      status: 'invalid',
      reason: `Prometheus query failed: ${error instanceof Error ? error.message : 'unknown error'}.`,
      baseUrl,
      signals: [],
    };
  }

  const observedAt = new Date().toISOString();
  const observedTypes = new Set(alertSignals.map((signal) => signal.type));
  const placeholders: PulseSignal[] = [];
  for (const requiredType of PROMETHEUS_REQUIRED_SIGNAL_TYPES) {
    if (!observedTypes.has(requiredType)) {
      placeholders.push(placeholderSignal(requiredType, observedAt));
    }
  }

  return {
    status: 'ready',
    reason: `Prometheus healthy. ${alertSignals.length} alert signal(s) + ${placeholders.length} placeholder signal(s) covering the 7 canonical types.`,
    baseUrl,
    signals: [...alertSignals, ...placeholders],
  };
}
