/**
 * GitNexus external signal adapter for PULSE.
 *
 * Follows the same pattern as Datadog, Sentry, GitHub adapters:
 * produces a PulseSignal that flows into certification,
 * convergence plan, and the external-signal-state artifact.
 */
import type { PulseExternalAdapterStatus, PulseExternalSignalSource, PulseSignal } from '../types';
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
  executionMode: PulseSignal['executionMode'],
  tags: string[] = [],
  validationTargets: string[] = [],
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
    tags: ['gitnexus', 'code-graph', ...tags],
    capabilityIds: [],
    flowIds: [],
    recentChangeRefs: [],
    ownerLane: 'platform',
    executionMode,
    governanceDisposition: tags.includes('governed_validation') ? 'governed_validation' : undefined,
    protectedByGovernance: false,
    validationTargets,
    rawRef: null,
  };
}

export async function fetchGitNexusSignal(repoRoot: string): Promise<PulseSignal | null> {
  try {
    const p = getProvider();
    const status = await p.getStatus({ repoRoot });
    if (!status.indexExists) {
      const available = await p.isAvailable();
      return makeSignal(
        available
          ? 'GitNexus index missing. Run pulse:gitnexus:index to create it.'
          : 'GitNexus CLI is unavailable and no local index exists.',
        0.4,
        0.5,
        'observation_only',
        available
          ? ['gitnexus:index_missing', 'governed_validation']
          : ['gitnexus:not_available', 'governed_validation'],
        ['PULSE_GITNEXUS_STATE.json', 'PULSE_EXTERNAL_SIGNAL_STATE.json'],
      );
    }

    if (status.indexState === 'stale') {
      return makeSignal(
        `GitNexus index is stale (current: ${status.currentCommit?.slice(0, 8)}, indexed: ${status.lastIndexedCommit?.slice(0, 8)}).`,
        0.5,
        0.6,
        'observation_only',
        ['gitnexus:stale', 'governed_validation'],
        ['PULSE_GITNEXUS_STATE.json', 'PULSE_EXTERNAL_SIGNAL_STATE.json'],
      );
    }

    return makeSignal(
      `GitNexus index is fresh for commit ${status.currentCommit?.slice(0, 8)}.`,
      0.1,
      0.1,
      'ai_safe',
      ['gitnexus:ready'],
      ['PULSE_GITNEXUS_STATE.json', 'PULSE_EXTERNAL_SIGNAL_STATE.json'],
    );
  } catch (err) {
    return makeSignal(
      `GitNexus adapter error: ${String(err).slice(0, 200)}`,
      0.6,
      0.7,
      'observation_only',
      ['gitnexus:invalid'],
      ['PULSE_GITNEXUS_STATE.json', 'PULSE_EXTERNAL_SIGNAL_STATE.json'],
    );
  }
}

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

function classifyGitNexusSignalStatus(signal: PulseSignal): PulseExternalAdapterStatus {
  if (
    signal.tags.includes('gitnexus:not_available') ||
    signal.tags.includes('gitnexus:index_missing')
  ) {
    return 'not_available';
  }
  if (signal.tags.includes('gitnexus:stale')) {
    return 'stale';
  }
  if (signal.tags.includes('gitnexus:invalid')) {
    return 'invalid';
  }
  return 'ready';
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
        status: classifyGitNexusSignalStatus(signal),
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
