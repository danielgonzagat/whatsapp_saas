/**
 * GitHub adapter for PULSE external signals
 * Fetches recent commits, PRs to detect changed capabilities
 */

import * as https from 'https';
import type { PulseSignal, PulseScopeFile } from '../types';

interface GitHubAdapterConfig {
  owner: string;
  repo: string;
  token?: string;
  maxAgeDays?: number;
}

function makeGitHubRequest(url: string, token?: string): Promise<unknown> {
  return new Promise((resolve) => {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
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

export async function fetchGitHubSignals(config: GitHubAdapterConfig): Promise<PulseSignal[]> {
  const signals: PulseSignal[] = [];
  const baseUrl = `https://api.github.com/repos/${config.owner}/${config.repo}`;

  try {
    // Fetch recent commits
    const commitsUrl = `${baseUrl}/commits?per_page=20`;
    const commitsData = (await makeGitHubRequest(commitsUrl, config.token)) as Array<{
      sha?: string;
      commit?: { message: string; committer?: { date: string } };
    }>;

    if (Array.isArray(commitsData) && commitsData.length > 0) {
      signals.push({
        id: `github-recent-commits-${Date.now()}`,
        type: 'code-change',
        source: 'github',
        truthMode: 'observed',
        severity: 2,
        impactScore: Math.min(10, commitsData.length * 0.5),
        confidence: 0.95,
        summary: `${commitsData.length} recent commits detected; latest: ${(commitsData[0]?.commit?.message || 'unknown').substring(0, 60)}`,
        observedAt: commitsData[0]?.commit?.committer?.date || null,
        relatedFiles: [],
        routePatterns: [],
        tags: ['recent-change'],
        capabilityIds: [],
        flowIds: [],
        recentChangeRefs: commitsData
          .map((commit) => commit.sha)
          .filter((value): value is string => Boolean(value)),
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
