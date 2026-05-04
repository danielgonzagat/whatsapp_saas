/**
 * Sentry adapter for PULSE external signals
 * Fetches recent error clusters to detect runtime issues
 */

import type { PulseSignal } from '../types';

interface SentryAdapterConfig {
  dsn?: string;
  authToken?: string;
  org?: string;
  project?: string;
  maxAgeDays?: number;
}

interface SentryEvent {
  id?: string;
  title?: string;
  status?: string;
  level?: string;
  firstSeen?: string;
  lastSeen?: string;
  count?: number;
}

function makeSentryRequest(url: string, token?: string): Promise<unknown> {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? require('https') : require('http');
    const headers: Record<string, string> = {
      'User-Agent': 'PULSE-v3',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
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
              resolve([]);
            }
          } else {
            resolve([]);
          }
        });
      })
      .on('error', () => resolve([]));
  });
}

/** Fetch sentry signals. */
export async function fetchSentrySignals(config: SentryAdapterConfig): Promise<PulseSignal[]> {
  const signals: PulseSignal[] = [];

  // If no Sentry config, return empty
  if (!config.authToken || !config.org || !config.project) {
    return signals;
  }

  try {
    const url = `https://sentry.io/api/0/projects/${config.org}/${config.project}/issues/?status=unresolved&limit=10`;
    const issuesData = (await makeSentryRequest(url, config.authToken)) as SentryEvent[];

    if (Array.isArray(issuesData) && issuesData.length > 0) {
      for (const issue of issuesData) {
        const severity =
          (issue.level === 'fatal' && 5) ||
          (issue.level === 'error' && 4) ||
          (issue.level === 'warning' && 2) ||
          1;

        signals.push({
          id: `sentry-issue-${issue.id}`,
          type: 'runtime-error',
          source: 'sentry',
          truthMode: 'observed',
          severity,
          impactScore: Math.min(10, severity + (issue.count ? Math.log(issue.count) : 0)),
          confidence: 0.9,
          summary: `[${issue.level?.toUpperCase()}] ${issue.title} (${issue.count || 1} occurrences)`,
          observedAt: issue.lastSeen || null,
          relatedFiles: [],
          routePatterns: [],
          tags: ['error', issue.level || 'unknown', issue.status || 'unresolved'],
          capabilityIds: [],
          flowIds: [],
          recentChangeRefs: [],
          ownerLane: 'reliability',
          executionMode: 'observation_only',
          protectedByGovernance: false,
          validationTargets: [],
        });
      }
    } else if (Array.isArray(issuesData)) {
      signals.push({
        id: `sentry-no-issues-${Date.now()}`,
        type: 'performance-metric',
        source: 'sentry',
        truthMode: 'observed',
        severity: 0.1,
        impactScore: 0.1,
        confidence: 0.95,
        summary: 'No unresolved Sentry issues — project is clean',
        observedAt: new Date().toISOString(),
        relatedFiles: [],
        routePatterns: [],
        tags: ['healthy', 'no-errors'],
        capabilityIds: [],
        flowIds: [],
        recentChangeRefs: [],
        ownerLane: 'reliability',
        executionMode: 'observation_only',
        protectedByGovernance: false,
        validationTargets: [],
      });
    }
  } catch (err: unknown) {
    signals.push({
      id: `sentry-api-error-${Date.now()}`,
      type: 'config-gap',
      source: 'sentry',
      truthMode: 'observed',
      severity: 2,
      impactScore: 3,
      confidence: 0.85,
      summary: `Sentry API call failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      observedAt: new Date().toISOString(),
      relatedFiles: [],
      routePatterns: [],
      tags: ['api-error', 'sentry'],
      capabilityIds: [],
      flowIds: [],
      recentChangeRefs: [],
      ownerLane: 'reliability',
      executionMode: 'observation_only',
      protectedByGovernance: false,
      validationTargets: [],
    });
  }

  return signals;
}
