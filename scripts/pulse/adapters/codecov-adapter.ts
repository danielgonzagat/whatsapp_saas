/**
 * Codecov adapter for PULSE external signals
 * Fetches code coverage changes to detect untested new code
 */

import * as https from 'https';
import type { PulseSignal } from '../types';

interface CodecovAdapterConfig {
  token?: string;
  owner?: string;
  repo?: string;
  maxAgeDays?: number;
}

function makeCodecovRequest(url: string, token?: string): Promise<unknown> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = {
      'User-Agent': 'PULSE-v3',
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

export async function fetchCodecovSignals(config: CodecovAdapterConfig): Promise<PulseSignal[]> {
  const signals: PulseSignal[] = [];

  if (!config.token || !config.owner || !config.repo) {
    return signals;
  }

  try {
    const url = `https://codecov.io/api/gh/${config.owner}/${config.repo}`;
    const result = (await makeCodecovRequest(url, config.token)) as Record<string, unknown>;

    if (
      result &&
      typeof result === 'object' &&
      'coverage' in result &&
      typeof result.coverage === 'number'
    ) {
      const coverage = result.coverage as number;
      const severity = coverage < 50 ? 4 : coverage < 70 ? 2 : 1;

      signals.push({
        id: `codecov-coverage-${Date.now()}`,
        type: 'coverage-change',
        source: 'codecov',
        truthMode: 'observed',
        severity,
        impactScore: Math.max(1, 10 - coverage / 10),
        confidence: 0.9,
        summary: `Code coverage: ${coverage.toFixed(1)}%${severity > 1 ? ' (below acceptable threshold)' : ''}`,
        observedAt: new Date().toISOString(),
        relatedFiles: [],
        routePatterns: [],
        tags: ['coverage', coverage < 70 ? 'low' : 'acceptable'],
        capabilityIds: [],
        flowIds: [],
        recentChangeRefs: [],
        ownerLane: 'platform',
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
