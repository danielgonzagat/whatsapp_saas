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
    }
  } catch (error) {
    // Silent fail
  }

  return signals;
}
