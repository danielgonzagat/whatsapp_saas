/**
 * GitNexus external signal adapter for PULSE.
 *
 * Follows the same pattern as Datadog, Sentry, GitHub adapters:
 * produces a PulseExternalSignal that flows into certification,
 * convergence plan, and the external-signal-state artifact.
 */
import type { PulseExternalSignal } from '../types';

import { GitNexusCodeGraphProvider } from '../gitnexus/provider';

let provider: GitNexusCodeGraphProvider | null = null;

function getProvider(): GitNexusCodeGraphProvider {
  if (!provider) provider = new GitNexusCodeGraphProvider();
  return provider;
}

export async function fetchGitNexusSignal(repoRoot: string): Promise<PulseExternalSignal | null> {
  try {
    const p = getProvider();
    const available = await p.isAvailable();
    if (!available) {
      return {
        source: 'gitnexus',
        type: 'codegraph',
        summary: 'GitNexus is not available (npx gitnexus@latest failed).',
        impactScore: 0.3,
        severity: 0.4,
        executionMode: 'observation_only',
        capabilityIds: [],
        flowIds: [],
        timestamp: new Date().toISOString(),
      };
    }

    const status = await p.getStatus({ repoRoot });
    if (!status.indexExists) {
      return {
        source: 'gitnexus',
        type: 'codegraph',
        summary: 'GitNexus index missing. Run pulse:gitnexus:index to create it.',
        impactScore: 0.4,
        severity: 0.5,
        executionMode: 'ai_safe',
        capabilityIds: [],
        flowIds: [],
        timestamp: new Date().toISOString(),
      };
    }

    if (status.indexState === 'stale') {
      return {
        source: 'gitnexus',
        type: 'codegraph',
        summary: `GitNexus index is stale (current: ${status.currentCommit?.slice(0, 8)}, indexed: ${status.lastIndexedCommit?.slice(0, 8)}).`,
        impactScore: 0.5,
        severity: 0.6,
        executionMode: 'ai_safe',
        capabilityIds: [],
        flowIds: [],
        timestamp: new Date().toISOString(),
      };
    }

    return {
      source: 'gitnexus',
      type: 'codegraph',
      summary: `GitNexus index is fresh for commit ${status.currentCommit?.slice(0, 8)}.`,
      impactScore: 0.1,
      severity: 0.1,
      executionMode: 'ai_safe',
      capabilityIds: [],
      flowIds: [],
      timestamp: new Date().toISOString(),
    };
  } catch (err) {
    return {
      source: 'gitnexus',
      type: 'codegraph',
      summary: `GitNexus adapter error: ${String(err).slice(0, 200)}`,
      impactScore: 0.6,
      severity: 0.7,
      executionMode: 'observation_only',
      capabilityIds: [],
      flowIds: [],
      timestamp: new Date().toISOString(),
    };
  }
}
