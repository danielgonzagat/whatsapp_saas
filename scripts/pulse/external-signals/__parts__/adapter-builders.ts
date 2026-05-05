import * as path from 'path';
import { deriveUnitValue, deriveZeroValue } from '../../dynamic-reality-kernel';
import type {
  PulseCertificationProfile,
  PulseCodacyEvidence,
  PulseExternalAdapterSnapshot,
  PulseExternalSignalSource,
} from '../../types';
import { pathExists, readTextFile } from '../../safe-fs';
import { compact, normalizeDate, normalizePathValue } from '../../signal-normalizers';
import {
  parseGithubSignals,
  parseGithubActionsSignals,
  parseCodecovSignals,
  parseSentrySignals,
  parseDatadogSignals,
  parsePrometheusSignals,
  parseDependabotSignals,
  normalizeSignalDraft,
} from '../../signal-parsers';
import type { PulseSignalDraft } from '../../signal-parsers';
import { buildSignalState } from '../../signal-mapper';
import type { BuildExternalSignalStateInput } from '../../signal-mapper';
import {
  getAdapterRequiredness,
  isAdapterRequired,
} from '../../adapters/external-sources-orchestrator/__parts__/core';
import type { PulseExternalAdapterProofBasis } from '../../types';
import { PULSE_EXTERNAL_SNAPSHOT_FILES } from './snapshot-config';

type AdapterClassificationFields =
  | 'requiredness'
  | 'requirement'
  | 'required'
  | 'observed'
  | 'blocking'
  | 'proofBasis'
  | 'missingReason';
export type UnclassifiedExternalAdapter = Omit<
  PulseExternalAdapterSnapshot,
  AdapterClassificationFields
>;

function buildCodacySignalDrafts(
  codacyEvidence: PulseCodacyEvidence,
  rootDir: string,
): PulseSignalDraft[] {
  return codacyEvidence.hotspots
    .filter((hotspot) => hotspot.highSeverityCount > deriveZeroValue())
    .slice(deriveZeroValue(), 20)
    .map((hotspot) => ({
      id: `codacy:${hotspot.filePath}`,
      type: 'static_hotspot',
      source: 'codacy' as const,
      truthMode: 'observed' as const,
      severity: hotspot.highSeverityCount > deriveUnitValue() + deriveUnitValue() ? 0.9 : 0.75,
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

export function buildSnapshotAdapter(
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
      ? Math.max(deriveZeroValue(), Math.round((Date.now() - Date.parse(syncedAt)) / 60_000))
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

export function classifyExternalAdapter(
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

export function buildLiveAdapter(
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
    freshnessMinutes: deriveZeroValue(),
    reason: sourceState.reason,
    signals,
  };
}

export function selectExternalAdapter(
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

export function buildCodacyAdapter(
  input: BuildExternalSignalStateInput,
): PulseExternalAdapterSnapshot {
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
