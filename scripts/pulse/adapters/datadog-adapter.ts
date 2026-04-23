/**
 * Datadog adapter for PULSE external signals
 * Fetches active monitors and error rates from Datadog API
 */

import type { PulseSignal } from '../types';

interface DatadogAdapterConfig {
  apiKey?: string;
  appKey?: string;
  site?: string;
  maxAgeDays?: number;
}

interface DatadogMonitor {
  id: number;
  name: string;
  status: string;
  type: string;
  message?: string;
  overall_state?: string;
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

/** Fetch datadog signals. */
export async function fetchDatadogSignals(config: DatadogAdapterConfig): Promise<PulseSignal[]> {
  const signals: PulseSignal[] = [];

  if (!config.apiKey || !config.appKey) {
    return signals;
  }

  const site = config.site || 'datadoghq.com';
  const baseUrl = `https://api.${site}`;

  // Fetch triggered monitors (more actionable than raw metric queries)
  try {
    const monitorsUrl = `${baseUrl}/api/v1/monitor?monitor_tags=*&with_downtimes=false&group_states=alert,warn,no_data`;
    const monitorsData = (await makeDatadogRequest(
      monitorsUrl,
      config.apiKey,
      config.appKey,
    )) as DatadogMonitor[];

    if (Array.isArray(monitorsData) && monitorsData.length > 0) {
      const alerting = monitorsData.filter((m) =>
        ['Alert', 'Warn', 'No Data'].includes(m.overall_state || m.status || ''),
      );

      if (alerting.length > 0) {
        for (const monitor of alerting.slice(0, 10)) {
          const state = (monitor.overall_state || monitor.status || '').toLowerCase();
          const severity = state === 'alert' ? 4 : state === 'warn' ? 3 : 2;

          signals.push({
            id: `datadog-monitor-${monitor.id}`,
            type: 'runtime-error',
            source: 'datadog',
            truthMode: 'observed',
            severity,
            impactScore: severity + 1,
            confidence: 0.9,
            summary: `[MONITOR ${state.toUpperCase()}] ${monitor.name}`,
            observedAt: new Date().toISOString(),
            relatedFiles: [],
            routePatterns: [],
            tags: ['monitor', state, monitor.type || 'metric'],
            capabilityIds: [],
            flowIds: [],
            recentChangeRefs: [],
            ownerLane: 'reliability',
            executionMode: 'observation_only',
            protectedByGovernance: false,
            validationTargets: [],
          });
        }
      } else {
        // All monitors green — still emit a positive signal for PULSE
        signals.push({
          id: `datadog-monitors-ok-${Date.now()}`,
          type: 'performance-metric',
          source: 'datadog',
          truthMode: 'observed',
          severity: 1,
          impactScore: 1,
          confidence: 0.95,
          summary: `All ${monitorsData.length} Datadog monitors OK`,
          observedAt: new Date().toISOString(),
          relatedFiles: [],
          routePatterns: [],
          tags: ['monitors', 'healthy'],
          capabilityIds: [],
          flowIds: [],
          recentChangeRefs: [],
          ownerLane: 'reliability',
          executionMode: 'observation_only',
          protectedByGovernance: false,
          validationTargets: [],
        });
      }
    }
  } catch {
    // Silent fail — no monitors or API error
  }

  return signals;
}
