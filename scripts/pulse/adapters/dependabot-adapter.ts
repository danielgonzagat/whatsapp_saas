/**
 * Dependabot adapter for PULSE external signals
 * Fetches dependency vulnerability alerts
 */

import * as https from 'https';
import type { PulseSignal } from '../types';

interface DependabotAdapterConfig {
  token?: string;
  owner?: string;
  repo?: string;
  maxAgeDays?: number;
}

interface DependabotAlert {
  number?: number;
  state?: string;
  dependency?: { package: { name: string } };
  security_advisory?: { severity: string };
}

function makeDependabotRequest(url: string, token?: string): Promise<unknown> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = {
      'User-Agent': 'PULSE-v3',
      Accept: 'application/vnd.github+json',
    };
    if (token) {
      headers['Authorization'] = `token ${token}`;
    }

    https
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

/** Fetch dependabot signals. */
export async function fetchDependabotSignals(
  config: DependabotAdapterConfig,
): Promise<PulseSignal[]> {
  const signals: PulseSignal[] = [];

  if (!config.token || !config.owner || !config.repo) {
    return signals;
  }

  try {
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/dependabot/alerts`;
    const alertsData = (await makeDependabotRequest(url, config.token)) as DependabotAlert[];

    if (Array.isArray(alertsData) && alertsData.length > 0) {
      const criticalAlerts = alertsData.filter(
        (a) => a.state === 'open' && a.security_advisory?.severity === 'critical',
      );
      const highAlerts = alertsData.filter(
        (a) => a.state === 'open' && a.security_advisory?.severity === 'high',
      );

      if (criticalAlerts.length > 0) {
        signals.push({
          id: `dependabot-critical-${Date.now()}`,
          type: 'dependency-vulnerability',
          source: 'dependabot',
          truthMode: 'observed',
          severity: 5,
          impactScore: 9,
          confidence: 0.95,
          summary: `${criticalAlerts.length} CRITICAL dependency vulnerabilities: ${criticalAlerts.map((a) => a.dependency?.package?.name).join(', ')}`,
          observedAt: new Date().toISOString(),
          relatedFiles: [],
          routePatterns: [],
          tags: ['security', 'critical', 'dependency'],
          capabilityIds: [],
          flowIds: [],
          recentChangeRefs: [],
          ownerLane: 'security',
          executionMode: 'observation_only',
          protectedByGovernance: false,
          validationTargets: [],
        });
      }

      if (highAlerts.length > 0) {
        signals.push({
          id: `dependabot-high-${Date.now()}`,
          type: 'dependency-vulnerability',
          source: 'dependabot',
          truthMode: 'observed',
          severity: 4,
          impactScore: 7,
          confidence: 0.95,
          summary: `${highAlerts.length} HIGH dependency vulnerabilities`,
          observedAt: new Date().toISOString(),
          relatedFiles: [],
          routePatterns: [],
          tags: ['security', 'high', 'dependency'],
          capabilityIds: [],
          flowIds: [],
          recentChangeRefs: [],
          ownerLane: 'security',
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
