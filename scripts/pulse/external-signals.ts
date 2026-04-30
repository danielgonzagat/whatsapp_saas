import * as path from 'path';
import type {
  PulseCertificationProfile,
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
import {
  getAdapterRequiredness,
  isAdapterRequired,
  normalizeExternalSignalProfile,
  type ConsolidatedExternalState,
} from './adapters/external-sources-orchestrator';
export type { BuildExternalSignalStateInput } from './signal-mapper';
import type { BuildExternalSignalStateInput } from './signal-mapper';
import type { PulseExternalAdapterProofBasis } from './types';

type AdapterClassificationFields =
  | 'requiredness'
  | 'requirement'
  | 'required'
  | 'observed'
  | 'blocking'
  | 'proofBasis'
  | 'missingReason';
type UnclassifiedExternalAdapter = Omit<PulseExternalAdapterSnapshot, AdapterClassificationFields>;

/** Build an empty live-state envelope that carries active profile/scope semantics. */
export function createExternalSignalProfileState(
  profile: PulseCertificationProfile | null | undefined,
  certificationScope: PulseCertificationProfile | null | undefined = profile,
): ConsolidatedExternalState {
  const generatedAt = new Date().toISOString();
  return {
    generatedAt,
    profile: profile || undefined,
    certificationScope: certificationScope || profile || undefined,
    sources: [],
    sourceCapabilities: [],
    allSignals: [],
    signalsBySource: {},
    criticalSignals: [],
    highSignals: [],
    totalSeverity: 0,
  };
}

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
  gitnexus: { fileName: 'PULSE_GITNEXUS_EVIDENCE.json', maxAgeMinutes: 24 * 60 },
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
): UnclassifiedExternalAdapter {
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

function getAdapterProofBasis(
  adapter: UnclassifiedExternalAdapter,
): PulseExternalAdapterProofBasis {
  if (adapter.source === 'codacy') return 'codacy_snapshot';
  return adapter.sourcePath?.startsWith('live:') ? 'live_adapter' : 'snapshot_artifact';
}

function buildAdapterMissingReason(
  adapter: UnclassifiedExternalAdapter,
  required: boolean,
  proofBasis: PulseExternalAdapterProofBasis,
  profile: PulseCertificationProfile | undefined,
): string | null {
  if (
    adapter.status !== 'not_available' &&
    adapter.status !== 'invalid' &&
    adapter.status !== 'stale' &&
    adapter.status !== 'optional_not_configured'
  ) {
    return null;
  }

  const profileLabel = profile || 'default';
  const requirementLabel = required ? 'required' : 'optional';
  const disposition = required ? 'blocking external proof closure' : 'tracked as non-blocking';
  return compact(
    `${adapter.source} is ${requirementLabel} under profile=${profileLabel}; proofBasis=${proofBasis}; status=${adapter.status}; ${disposition}. ${adapter.reason}`,
  );
}

function classifyExternalAdapter(
  adapter: UnclassifiedExternalAdapter,
  profile: PulseCertificationProfile | undefined,
): PulseExternalAdapterSnapshot {
  const required = isAdapterRequired(adapter.source, profile);
  const proofBasis = getAdapterProofBasis(adapter);
  const blocking =
    required &&
    (adapter.status === 'not_available' ||
      adapter.status === 'invalid' ||
      adapter.status === 'stale');
  return {
    ...adapter,
    requiredness: getAdapterRequiredness(adapter.source),
    requirement: required ? 'required' : 'optional',
    required,
    observed: adapter.executed && adapter.status !== 'not_available',
    blocking,
    proofBasis,
    missingReason: buildAdapterMissingReason(adapter, required, proofBasis, profile),
  };
}

function buildLiveAdapter(
  input: BuildExternalSignalStateInput,
  source: Exclude<PulseExternalSignalSource, 'codacy'>,
): UnclassifiedExternalAdapter | null {
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
  snapshotAdapter: UnclassifiedExternalAdapter,
  liveAdapter: UnclassifiedExternalAdapter | null,
  profile: PulseCertificationProfile | undefined,
): UnclassifiedExternalAdapter {
  if (!liveAdapter) return snapshotAdapter;
  if (liveAdapter.status === 'ready') return liveAdapter;
  if (liveAdapter.source === 'github' || liveAdapter.source === 'github_actions') {
    const required = isAdapterRequired(liveAdapter.source, profile);
    const profileLabel = profile || 'default';
    const requirednessReason = required
      ? `${liveAdapter.source} adapter is required under profile=${profileLabel}.`
      : `${liveAdapter.source} adapter is optional under profile=${profileLabel}.`;
    return {
      ...liveAdapter,
      reason:
        snapshotAdapter.status === 'stale'
          ? `${liveAdapter.reason} ${requirednessReason} Stale ${snapshotAdapter.sourcePath} exists but was not reused as live external reality.`
          : `${liveAdapter.reason} ${requirednessReason}`,
    };
  }
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
    requiredness: 'optional',
    requirement: 'optional',
    required: false,
    observed: input.scopeState.codacy.snapshotAvailable,
    blocking: false,
    proofBasis: 'codacy_snapshot',
    missingReason: !input.scopeState.codacy.snapshotAvailable
      ? 'codacy is optional for external adapter closure; proofBasis=codacy_snapshot; status=not_available; tracked as non-blocking. PULSE_CODACY_STATE.json is not available.'
      : input.scopeState.codacy.stale
        ? `codacy is optional for external adapter closure; proofBasis=codacy_snapshot; status=stale; tracked as non-blocking. PULSE_CODACY_STATE.json is stale (${input.scopeState.codacy.ageMinutes} minute(s) old).`
        : null,
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
  const externalSources = Object.keys(PULSE_EXTERNAL_SNAPSHOT_FILES) as Array<
    Exclude<PulseExternalSignalSource, 'codacy'>
  >;
  // Derive the active profile/scope from the live external state when available.
  // Canonical final profiles make profile-dependent adapters required; Prometheus
  // remains optional for pulse-core-final and required for full-product.
  const liveProfileState = input.liveExternalState as
    | { profile?: string; certificationScope?: string }
    | null
    | undefined;
  const profile = normalizeExternalSignalProfile(
    liveProfileState?.certificationScope || liveProfileState?.profile,
  );
  const initialAdapters: UnclassifiedExternalAdapter[] = [
    buildCodacyAdapter(input),
    ...externalSources.map((source) =>
      selectExternalAdapter(
        buildSnapshotAdapter(input, source),
        buildLiveAdapter(input, source),
        profile,
      ),
    ),
  ];

  const signals = attachRecentChangeRefs(initialAdapters.flatMap((adapter) => adapter.signals));
  const adapters = initialAdapters.map((adapter) =>
    classifyExternalAdapter(
      {
        ...adapter,
        signals: signals.filter((signal) => signal.source === adapter.source),
      },
      profile,
    ),
  );

  // Categorize adapters using FASE 4 five-status semantics + requiredness.
  // - `optional_not_configured` is never blocking.
  // - `not_available` / `invalid` count as missing only when the adapter is required
  //   under the active profile (or always-required).
  const staleAdaptersList = adapters
    .filter((adapter) => adapter.status === 'stale' && isAdapterRequired(adapter.source, profile))
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
  const optionalNotAvailableList = adapters
    .filter((adapter) => adapter.status === 'not_available' && !adapter.required)
    .map((adapter) => adapter.source);
  const blockingAdaptersList = adapters
    .filter((adapter) => adapter.blocking)
    .map((adapter) => adapter.source);
  const proofBasisCounts = adapters.reduce(
    (counts, adapter) => ({
      ...counts,
      [adapter.proofBasis]: counts[adapter.proofBasis] + 1,
    }),
    {
      codacy_snapshot: 0,
      live_adapter: 0,
      snapshot_artifact: 0,
    } satisfies Record<PulseExternalAdapterProofBasis, number>,
  );

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
    governedValidationSignals: signals.filter(
      (signal) => signal.governanceDisposition === 'governed_validation',
    ).length,
    staleAdapters: staleAdaptersList.length,
    missingAdapters: missingAdaptersList.length,
    invalidAdapters: invalidAdaptersList.length,
    optionalSkippedAdapters: optionalSkippedList.length,
    requiredAdapters: adapters.filter((adapter) => adapter.required).length,
    optionalAdapters: adapters.filter((adapter) => !adapter.required).length,
    observedAdapters: adapters.filter((adapter) => adapter.observed).length,
    blockingAdapters: blockingAdaptersList.length,
    missingAdaptersList,
    staleAdaptersList,
    invalidAdaptersList,
    optionalSkippedList,
    optionalNotAvailableList,
    blockingAdaptersList,
    proofBasisCounts,
    bySource: {
      github: signals.filter((signal) => signal.source === 'github').length,
      github_actions: signals.filter((signal) => signal.source === 'github_actions').length,
      codacy: signals.filter((signal) => signal.source === 'codacy').length,
      codecov: signals.filter((signal) => signal.source === 'codecov').length,
      sentry: signals.filter((signal) => signal.source === 'sentry').length,
      datadog: signals.filter((signal) => signal.source === 'datadog').length,
      prometheus: signals.filter((signal) => signal.source === 'prometheus').length,
      dependabot: signals.filter((signal) => signal.source === 'dependabot').length,
      gitnexus: signals.filter((signal) => signal.source === 'gitnexus').length,
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
