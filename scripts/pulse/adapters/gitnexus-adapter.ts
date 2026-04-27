/**
 * GitNexus external signal adapter for PULSE.
 *
 * Follows the same pattern as Datadog, Sentry, GitHub adapters:
 * produces a PulseSignal that flows into certification,
 * convergence plan, and the external-signal-state artifact.
 */
import type { PulseSignal } from '../types';
import { GitNexusCodeGraphProvider } from '../gitnexus/provider';

let provider: GitNexusCodeGraphProvider | null = null;

function getProvider(): GitNexusCodeGraphProvider {
  if (!provider) provider = new GitNexusCodeGraphProvider();
  return provider;
}

function makeSignal(
  summary: string,
  impactScore: number,
  severity: number,
  executionMode: 'ai_safe' | 'human_required' | 'observation_only',
): PulseSignal {
  const ts = new Date().toISOString();
  return {
    id: `gitnexus:${ts}`,
    type: 'codegraph',
    source: 'gitnexus',
    truthMode: 'observed',
    severity,
    impactScore,
    confidence: 0.9,
    summary,
    observedAt: ts,
    relatedFiles: [],
    routePatterns: [],
    tags: ['gitnexus', 'code-graph'],
    capabilityIds: [],
    flowIds: [],
    recentChangeRefs: [],
    ownerLane: 'platform',
    executionMode,
    protectedByGovernance: false,
    validationTargets: [],
    rawRef: null,
  };
}

export async function fetchGitNexusSignal(repoRoot: string): Promise<PulseSignal | null> {
  try {
    const p = getProvider();
    const available = await p.isAvailable();
    if (!available) {
      return makeSignal(
        'GitNexus is not available (npx gitnexus@latest failed).',
        0.3,
        0.4,
        'observation_only',
      );
    }

    const status = await p.getStatus({ repoRoot });
    if (!status.indexExists) {
      return makeSignal(
        'GitNexus index missing. Run pulse:gitnexus:index to create it.',
        0.4,
        0.5,
        'ai_safe',
      );
    }

    if (status.indexState === 'stale') {
      return makeSignal(
        `GitNexus index is stale (current: ${status.currentCommit?.slice(0, 8)}, indexed: ${status.lastIndexedCommit?.slice(0, 8)}).`,
        0.5,
        0.6,
        'ai_safe',
      );
    }

    return makeSignal(
      `GitNexus index is fresh for commit ${status.currentCommit?.slice(0, 8)}.`,
      0.1,
      0.1,
      'ai_safe',
    );
  } catch (err) {
    return makeSignal(
      `GitNexus adapter error: ${String(err).slice(0, 200)}`,
      0.6,
      0.7,
      'observation_only',
    );
  }
}

import type { PulseExternalAdapterStatus, PulseExternalSignalSource } from '../types';

interface RunGitNexusAdapterArgs {
  config: { rootDir: string };
  allSignals: PulseSignal[];
  signalsBySource: Record<string, PulseSignal[]>;
  sources: Array<{
    source: PulseExternalSignalSource;
    status: PulseExternalAdapterStatus;
    signalCount: number;
    syncedAt: string;
    reason: string;
  }>;
  generatedAt: string;
}

/**
 * Orchestrator helper: fetch the GitNexus signal, push it into the
 * external-signals aggregation, register the source row, and return the
 * severity contribution. Caller adds the returned number to `totalSeverity`.
 */
export async function runGitNexusAdapter(args: RunGitNexusAdapterArgs): Promise<number> {
  const { config, allSignals, signalsBySource, sources, generatedAt } = args;
  try {
    const signal = await fetchGitNexusSignal(config.rootDir);
    if (signal) {
      allSignals.push(signal);
      signalsBySource['gitnexus'] = [signal];
      sources.push({
        source: 'gitnexus',
        status: signal.severity >= 0.8 ? 'stale' : 'ready',
        signalCount: 1,
        syncedAt: generatedAt,
        reason: signal.summary,
      });
      return signal.severity;
    }
    signalsBySource['gitnexus'] = [];
    sources.push({
      source: 'gitnexus',
      status: 'not_available',
      signalCount: 0,
      syncedAt: generatedAt,
      reason: 'GitNexus adapter returned no signal.',
    });
    return 0;
  } catch {
    signalsBySource['gitnexus'] = [];
    sources.push({
      source: 'gitnexus',
      status: 'invalid',
      signalCount: 0,
      syncedAt: generatedAt,
      reason: 'GitNexus adapter failed.',
    });
    return 0;
  }
}
