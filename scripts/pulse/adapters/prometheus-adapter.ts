/**
 * Prometheus adapter for PULSE external signals.
 * Fetches firing alerts from a Prometheus HTTP API endpoint.
 */

import * as http from 'http';
import * as https from 'https';
import type { PulseSignal } from '../types';

interface PrometheusAdapterConfig {
  baseUrl?: string;
  bearerToken?: string;
  query?: string;
}

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
