import * as path from 'path';
import type {
  PulseCodacyEvidence,
  PulseExternalAdapterSnapshot,
  PulseExternalSignalSource,
  PulseExternalSignalState,
} from './types';
import { pathExists, readTextFile } from './safe-fs';
import { compact, normalizeDate, normalizePathValue } from './signal-normalizers';
import {
  parseGithubSignals,
  parseGithubActionsSignals,
  parseCodecovSignals,
  parseSentrySignals,
  parseDatadogSignals,
  parsePrometheusSignals,
  parseDependabotSignals,
  normalizeSignalDraft,
} from './signal-parsers';
import type { PulseSignalDraft } from './signal-parsers';
import {
  buildSignalState,
  attachRecentChangeRefs,
  isDependencySignal,
  isChangeSignal,
  isRuntimeSignal,
} from './signal-mapper';
import { isAdapterRequired } from './adapters/external-sources-orchestrator';
export type { BuildExternalSignalStateInput } from './signal-mapper';
import type { BuildExternalSignalStateInput } from './signal-mapper';

interface PulseExternalSourceConfig {
  fileName: string;
  maxAgeMinutes: number;
}

/** Configuration and freshness thresholds for each snapshot-file-backed source. */
export const PULSE_EXTERNAL_SNAPSHOT_FILES: Record<
  Exclude<PulseExternalSignalSource, 'codacy'>,
  PulseExternalSourceConfig
> = {
  github: { fileName: 'PULSE_GITHUB_STATE.json', maxAgeMinutes: 6 * 60 },
  github_actions: { fileName: 'PULSE_GITHUB_ACTIONS_STATE.json', maxAgeMinutes: 6 * 60 },
  codecov: { fileName: 'PULSE_CODECOV_STATE.json', maxAgeMinutes: 24 * 60 },
  sentry: { fileName: 'PULSE_SENTRY_STATE.json', maxAgeMinutes: 6 * 60 },
  datadog: { fileName: 'PULSE_DATADOG_STATE.json', maxAgeMinutes: 6 * 60 },
  prometheus: { fileName: 'PULSE_PROMETHEUS_STATE.json', maxAgeMinutes: 30 },
  dependabot: { fileName: 'PULSE_DEPENDABOT_STATE.json', maxAgeMinutes: 24 * 60 },
};

/** List of all external input file names watched by the daemon. */
export const PULSE_EXTERNAL_INPUT_FILES = [
  'PULSE_CODACY_STATE.json',
  ...Object.values(PULSE_EXTERNAL_SNAPSHOT_FILES).map((config) => config.fileName),
];

function buildCodacySignalDrafts(
  codacyEvidence: PulseCodacyEvidence,
  rootDir: string,
): PulseSignalDraft[] {
  return codacyEvidence.hotspots
    .filter((hotspot) => hotspot.highSeverityCount > 0)
    .slice(0, 20)
    .map((hotspot) => ({
      id: `codacy:${hotspot.filePath}`,
      type: 'static_hotspot',
      source: 'codacy' as const,
      truthMode: 'observed' as const,
      severity: hotspot.highSeverityCount > 2 ? 0.9 : 0.75,
      impactScore: hotspot.runtimeCritical ? 0.8 : hotspot.userFacing ? 0.7 : 0.55,
      confidence: 0.95,
      summary: compact(
        `${hotspot.highSeverityCount} HIGH Codacy issue(s) remain in ${hotspot.filePath}.`,
      ),
      observedAt: codacyEvidence.generatedAt,
      relatedFiles: [normalizePathValue(rootDir, hotspot.filePath)],
      routePatterns: [],
      tags: [...hotspot.categories, ...hotspot.tools],
      rawRef: null,
    }));
}

function readSnapshot(
  rootDir: string,
  source: Exclude<PulseExternalSignalSource, 'codacy'>,
): { sourcePath: string; payload: Record<string, unknown> | null; error?: string } {
  const sourcePath = path.join(rootDir, PULSE_EXTERNAL_SNAPSHOT_FILES[source].fileName);
  if (!pathExists(sourcePath)) return { sourcePath, payload: null };
  try {
    const payload = JSON.parse(readTextFile(sourcePath, 'utf8')) as Record<string, unknown>;
    return { sourcePath, payload };
  } catch (error) {
    return {
      sourcePath,
      payload: null,
      error: error instanceof Error ? error.message : 'Invalid JSON payload.',
    };
  }
}

function dispatchSourceParser(
  source: Exclude<PulseExternalSignalSource, 'codacy'>,
  rootDir: string,
  payload: Record<string, unknown>,
): PulseSignalDraft[] {
  if (source === 'github') return parseGithubSignals(rootDir, payload);
  if (source === 'github_actions') return parseGithubActionsSignals(rootDir, payload);
  if (source === 'codecov') return parseCodecovSignals(rootDir, payload);
  if (source === 'sentry') return parseSentrySignals(rootDir, payload);
  if (source === 'datadog') return parseDatadogSignals(rootDir, payload);
  if (source === 'prometheus') return parsePrometheusSignals(rootDir, payload);
  return parseDependabotSignals(rootDir, payload);
}

function buildSnapshotAdapter(
  input: BuildExternalSignalStateInput,
  source: Exclude<PulseExternalSignalSource, 'codacy'>,
): PulseExternalAdapterSnapshot {
  const snapshot = readSnapshot(input.rootDir, source);
  if (snapshot.error) {
    return {
      source,
      sourcePath: snapshot.sourcePath,
      executed: true,
      status: 'invalid',
      generatedAt: new Date().toISOString(),
      syncedAt: null,
      freshnessMinutes: null,
      reason: compact(snapshot.error),
      signals: [],
    };
  }
  if (!snapshot.payload) {
    return {
      source,
      sourcePath: snapshot.sourcePath,
      executed: false,
      status: 'not_available',
      generatedAt: new Date().toISOString(),
      syncedAt: null,
      freshnessMinutes: null,
      reason: `${PULSE_EXTERNAL_SNAPSHOT_FILES[source].fileName} is not available in the repository root.`,
      signals: [],
    };
  }

  const payload = snapshot.payload;
  const syncedAt = normalizeDate(payload.syncedAt || payload.generatedAt || payload.updatedAt);
  const freshnessMinutes =
    syncedAt !== null
      ? Math.max(0, Math.round((Date.now() - Date.parse(syncedAt)) / 60_000))
      : null;
  const stale =
    freshnessMinutes !== null &&
    freshnessMinutes > PULSE_EXTERNAL_SNAPSHOT_FILES[source].maxAgeMinutes;

  const drafts = dispatchSourceParser(source, input.rootDir, payload);
  const signals = buildSignalState(drafts, input);

  return {
    source,
    sourcePath: snapshot.sourcePath,
    executed: true,
    status: stale ? 'stale' : 'ready',
    generatedAt: new Date().toISOString(),
    syncedAt,
    freshnessMinutes,
    reason: stale
      ? `${PULSE_EXTERNAL_SNAPSHOT_FILES[source].fileName} is stale (${freshnessMinutes} minute(s) old).`
      : signals.length > 0
        ? `${signals.length} normalized ${source} signal(s) are available.`
        : `${PULSE_EXTERNAL_SNAPSHOT_FILES[source].fileName} is present but did not yield actionable signals.`,
    signals,
  };
}

function buildLiveAdapter(
  input: BuildExternalSignalStateInput,
  source: Exclude<PulseExternalSignalSource, 'codacy'>,
): PulseExternalAdapterSnapshot | null {
  const liveState = input.liveExternalState;
  if (!liveState) return null;
  const sourceState = liveState.sources.find((entry) => entry.source === source);
  if (!sourceState) return null;

  const drafts = (liveState.signalsBySource[source] || [])
    .map((signal) => {
      const raw = signal as unknown as Record<string, unknown>;
      const fallbackType = typeof raw.type === 'string' && raw.type ? raw.type : `${source}_signal`;
      const fallbackSummary =
        typeof raw.summary === 'string' && raw.summary
          ? raw.summary
          : `${source} live adapter signal`;
      return normalizeSignalDraft(input.rootDir, source, raw, fallbackType, fallbackSummary);
    })
    .filter((draft): draft is PulseSignalDraft => Boolean(draft));
  const signals = buildSignalState(drafts, input);

  return {
    source,
    sourcePath: `live:${source}`,
    executed: sourceState.status !== 'not_available',
    status: sourceState.status,
    generatedAt: liveState.generatedAt,
    syncedAt: sourceState.syncedAt,
    freshnessMinutes: 0,
    reason: sourceState.reason,
    signals,
  };
}

function selectExternalAdapter(
  snapshotAdapter: PulseExternalAdapterSnapshot,
  liveAdapter: PulseExternalAdapterSnapshot | null,
): PulseExternalAdapterSnapshot {
  if (!liveAdapter) return snapshotAdapter;
  if (liveAdapter.status === 'ready') return liveAdapter;
  if (snapshotAdapter.status !== 'not_available') {
    return {
      ...snapshotAdapter,
      reason: `${liveAdapter.reason} Snapshot fallback is active. ${snapshotAdapter.reason}`,
    };
  }
  return liveAdapter;
}

function buildCodacyAdapter(input: BuildExternalSignalStateInput): PulseExternalAdapterSnapshot {
  const syncedAt = input.scopeState.codacy.syncedAt;
  const drafts = buildCodacySignalDrafts(input.codacyEvidence, input.rootDir);
  return {
    source: 'codacy',
    sourcePath: input.scopeState.codacy.sourcePath,
    executed: input.scopeState.codacy.snapshotAvailable,
    status: !input.scopeState.codacy.snapshotAvailable
      ? 'not_available'
      : input.scopeState.codacy.stale
        ? 'stale'
        : 'ready',
    generatedAt: new Date().toISOString(),
    syncedAt,
    freshnessMinutes: input.scopeState.codacy.ageMinutes,
    reason: !input.scopeState.codacy.snapshotAvailable
      ? 'PULSE_CODACY_STATE.json is not available.'
      : input.scopeState.codacy.stale
        ? `PULSE_CODACY_STATE.json is stale (${input.scopeState.codacy.ageMinutes} minute(s) old).`
        : `${drafts.length} Codacy hotspot signal(s) were normalized from the latest snapshot.`,
    signals: buildSignalState(drafts, input),
  };
}

/** Build normalized external-signal state from snapshot-first adapters. */
export function buildExternalSignalState(
  input: BuildExternalSignalStateInput,
): PulseExternalSignalState {
  const externalSources: Array<Exclude<PulseExternalSignalSource, 'codacy'>> = [
    'github',
    'github_actions',
    'codecov',
    'sentry',
    'datadog',
    'prometheus',
    'dependabot',
  ];
  const initialAdapters: PulseExternalAdapterSnapshot[] = [
    buildCodacyAdapter(input),
    ...externalSources.map((source) =>
      selectExternalAdapter(buildSnapshotAdapter(input, source), buildLiveAdapter(input, source)),
    ),
  ];

  const signals = attachRecentChangeRefs(initialAdapters.flatMap((adapter) => adapter.signals));
  const adapters = initialAdapters.map((adapter) => ({
    ...adapter,
    signals: signals.filter((signal) => signal.source === adapter.source),
  }));

  // Derive the active profile from the live external state when available.
  // Profile === 'production-final' means every profile-dependent adapter is required.
  const profile = (input.liveExternalState as unknown as { profile?: string } | null | undefined)
    ?.profile;

  // Categorize adapters using FASE 4 five-status semantics + requiredness.
  // - `optional_not_configured` is never blocking.
  // - `not_available` / `invalid` count as missing only when the adapter is required
  //   under the active profile (or always-required).
  const staleAdaptersList = adapters
    .filter((adapter) => adapter.status === 'stale')
    .map((adapter) => adapter.source);
  const invalidAdaptersList = adapters
    .filter((adapter) => adapter.status === 'invalid' && isAdapterRequired(adapter.source, profile))
    .map((adapter) => adapter.source);
  const notAvailableRequiredList = adapters
    .filter(
      (adapter) => adapter.status === 'not_available' && isAdapterRequired(adapter.source, profile),
    )
    .map((adapter) => adapter.source);
  const missingAdaptersList = [...notAvailableRequiredList, ...invalidAdaptersList];
  const optionalSkippedList = adapters
    .filter((adapter) => adapter.status === 'optional_not_configured')
    .map((adapter) => adapter.source);

  const summary = {
    totalSignals: signals.length,
    runtimeSignals: signals.filter(isRuntimeSignal).length,
    changeSignals: signals.filter(isChangeSignal).length,
    dependencySignals: signals.filter(isDependencySignal).length,
    highImpactSignals: signals.filter((signal) => signal.impactScore >= 0.8).length,
    mappedSignals: signals.filter(
      (signal) => signal.capabilityIds.length > 0 || signal.flowIds.length > 0,
    ).length,
    humanRequiredSignals: signals.filter((signal) => signal.executionMode === 'human_required')
      .length,
    staleAdapters: staleAdaptersList.length,
    missingAdapters: missingAdaptersList.length,
    invalidAdapters: invalidAdaptersList.length,
    optionalSkippedAdapters: optionalSkippedList.length,
    missingAdaptersList,
    staleAdaptersList,
    invalidAdaptersList,
    optionalSkippedList,
    bySource: {
      github: signals.filter((signal) => signal.source === 'github').length,
      github_actions: signals.filter((signal) => signal.source === 'github_actions').length,
      codacy: signals.filter((signal) => signal.source === 'codacy').length,
      codecov: signals.filter((signal) => signal.source === 'codecov').length,
      sentry: signals.filter((signal) => signal.source === 'sentry').length,
      datadog: signals.filter((signal) => signal.source === 'datadog').length,
      prometheus: signals.filter((signal) => signal.source === 'prometheus').length,
      dependabot: signals.filter((signal) => signal.source === 'dependabot').length,
    },
  };

  return {
    generatedAt: new Date().toISOString(),
    truthMode: 'observed',
    summary,
    adapters,
    signals,
  };
}
