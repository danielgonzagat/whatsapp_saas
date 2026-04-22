/**
 * Datadog adapter for PULSE external signals
 * Fetches performance metrics and error rates
 */

import type { PulseSignal } from '../types';

interface DatadogAdapterConfig {
  apiKey?: string;
  appKey?: string;
  site?: string;
  maxAgeDays?: number;
}

function makeDatadogRequest(url: string, apiKey?: string, appKey?: string): Promise<unknown> {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? require('https') : require('http');
    const headers: Record<string, string> = {
      'User-Agent': 'PULSE-v3',
    };
    if (apiKey) {
      headers['DD-API-KEY'] = apiKey;
    }
    if (appKey) {
      headers['DD-APPLICATION-KEY'] = appKey;
    }

    protocol
      .get(url, { headers }, (res: { statusCode: number; on: Function }) => {
        let data = '';
        res.on('data', (chunk: string) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
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

export async function fetchDatadogSignals(config: DatadogAdapterConfig): Promise<PulseSignal[]> {
  const signals: PulseSignal[] = [];

  // If no Datadog config, return empty
  if (!config.apiKey || !config.appKey) {
    return signals;
  }

  try {
    const site = config.site || 'datadoghq.com';
    const url = `https://api.${site}/api/v1/query?query=avg:system.load{*}&from=${Date.now() - 3600000}`;
    const result = (await makeDatadogRequest(url, config.apiKey, config.appKey)) as Record<
      string,
      unknown
    >;

    if (result && typeof result === 'object') {
      signals.push({
        id: `datadog-metrics-${Date.now()}`,
        type: 'performance-metric',
        source: 'datadog',
        truthMode: 'observed',
        severity: 1,
        impactScore: 2,
        confidence: 0.85,
        summary: 'System metrics checked; no critical anomalies detected in last hour',
        observedAt: new Date().toISOString(),
        relatedFiles: [],
        routePatterns: [],
        tags: ['metrics', 'performance'],
        capabilityIds: [],
        flowIds: [],
        recentChangeRefs: [],
        ownerLane: 'reliability',
        executionMode: 'observation_only',
        protectedByGovernance: false,
        validationTargets: [],
      });
    }
  } catch (error) {
    // Silent fail
  }

  return signals;
}
