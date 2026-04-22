/**
 * GitHub Actions adapter for PULSE external signals
 * Fetches CI/CD workflow status to detect build failures
 */

import * as https from 'https';
import type { PulseSignal } from '../types';

interface GitHubActionsAdapterConfig {
  token?: string;
  owner?: string;
  repo?: string;
  maxAgeDays?: number;
}

interface GitHubWorkflowRun {
  id?: number;
  name?: string;
  conclusion?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

function makeGitHubActionsRequest(url: string, token?: string): Promise<unknown> {
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
              resolve({ workflow_runs: [] });
            }
          } else {
            resolve({ workflow_runs: [] });
          }
        });
      })
      .on('error', () => resolve({ workflow_runs: [] }));
  });
}

export async function fetchGitHubActionsSignals(
  config: GitHubActionsAdapterConfig,
): Promise<PulseSignal[]> {
  const signals: PulseSignal[] = [];

  if (!config.token || !config.owner || !config.repo) {
    return signals;
  }

  try {
    const url = `https://api.github.com/repos/${config.owner}/${config.repo}/actions/runs?per_page=20`;
    const result = (await makeGitHubActionsRequest(url, config.token)) as {
      workflow_runs?: GitHubWorkflowRun[];
    };

    if (
      result &&
      typeof result === 'object' &&
      'workflow_runs' in result &&
      Array.isArray(result.workflow_runs)
    ) {
      const failedRuns = result.workflow_runs.filter((r) => r.conclusion === 'failure');
      const successfulRuns = result.workflow_runs.filter((r) => r.conclusion === 'success');

      if (failedRuns.length > 0) {
        signals.push({
          id: `github-actions-failed-${Date.now()}`,
          type: 'ci-failure',
          source: 'github_actions',
          truthMode: 'observed',
          severity: 4,
          impactScore: 8,
          confidence: 0.95,
          summary: `${failedRuns.length} recent CI workflow failure(s): ${failedRuns.map((r) => r.name).join(', ')}`,
          observedAt: failedRuns[0]?.updated_at || null,
          relatedFiles: [],
          routePatterns: [],
          tags: ['ci', 'failure', 'build'],
          capabilityIds: [],
          flowIds: [],
          recentChangeRefs: failedRuns
            .map((run) => (typeof run.id === 'number' ? String(run.id) : null))
            .filter((value): value is string => Boolean(value)),
          ownerLane: 'platform',
          executionMode: 'observation_only',
          protectedByGovernance: false,
          validationTargets: [],
        });
      }

      if (successfulRuns.length > 0) {
        signals.push({
          id: `github-actions-success-${Date.now()}`,
          type: 'ci-success',
          source: 'github_actions',
          truthMode: 'observed',
          severity: 1,
          impactScore: 2,
          confidence: 0.95,
          summary: `${successfulRuns.length} recent CI workflow success(es)`,
          observedAt: successfulRuns[0]?.updated_at || null,
          relatedFiles: [],
          routePatterns: [],
          tags: ['ci', 'success', 'build'],
          capabilityIds: [],
          flowIds: [],
          recentChangeRefs: successfulRuns
            .map((run) => (typeof run.id === 'number' ? String(run.id) : null))
            .filter((value): value is string => Boolean(value)),
          ownerLane: 'platform',
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
