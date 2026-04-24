/**
 * Signal mapping: maps PulseSignalDraft[] to PulseSignal[] by matching drafts
 * against capability indexes, flow indexes, and scope files.
 * Handles deduplication, execution-mode assignment, owner-lane selection, and
 * recent-change cross-referencing. All functions are pure — no I/O, no side effects.
 */
import type {
  PulseCapability,
  PulseCapabilityState,
  PulseConvergenceOwnerLane,
  PulseFlowProjection,
  PulseFlowProjectionItem,
  PulseScopeExecutionMode,
  PulseScopeFile,
  PulseScopeState,
  PulseSignal,
} from './types';
import type { PulseCodacyEvidence } from './types';
import type { PulseSignalDraft } from './signal-parsers';
import {
  normalizeRoutePattern,
  routeMatches,
  tokenize,
  unique,
  normalizedFileMatch,
} from './signal-normalizers';

export interface BuildExternalSignalStateInput {
  rootDir: string;
  scopeState: PulseScopeState;
  codacyEvidence: PulseCodacyEvidence;
  capabilityState: PulseCapabilityState;
  flowProjection: PulseFlowProjection;
  liveExternalState?:
    | import('./adapters/external-sources-orchestrator').ConsolidatedExternalState
    | null;
}

function buildCapabilityTerms(capability: PulseCapability): string[] {
  return unique(
    tokenize([capability.id, capability.name, ...capability.routePatterns].join(' ')).filter(
      (entry) => entry.length >= 4,
    ),
  );
}

function buildFlowTerms(flow: PulseFlowProjectionItem): string[] {
  return unique(
    tokenize([flow.id, flow.name, ...flow.routePatterns].join(' ')).filter(
      (entry) => entry.length >= 4,
    ),
  );
}

function buildCapabilityIndexes(capabilities: PulseCapability[]) {
  return capabilities.map((capability) => ({
    capability,
    filePaths: new Set(capability.filePaths.map((entry) => entry.replace(/\\/g, '/'))),
    routePatterns: capability.routePatterns.map((entry) => normalizeRoutePattern(entry)),
    terms: buildCapabilityTerms(capability),
  }));
}

function buildFlowIndexes(flows: PulseFlowProjectionItem[]) {
  return flows.map((flow) => ({
    flow,
    routePatterns: flow.routePatterns.map((entry) => normalizeRoutePattern(entry)),
    terms: buildFlowTerms(flow),
  }));
}

export function selectLane(values: PulseConvergenceOwnerLane[]): PulseConvergenceOwnerLane {
  if (values.includes('customer')) return 'customer';
  if (values.includes('security')) return 'security';
  if (values.includes('operator-admin')) return 'operator-admin';
  if (values.includes('reliability')) return 'reliability';
  return 'platform';
}

export function isDependencySignal(signal: Pick<PulseSignal, 'source' | 'type'>): boolean {
  return signal.source === 'dependabot' || /dependency|vuln|supply/i.test(signal.type);
}

export function isChangeSignal(signal: Pick<PulseSignal, 'source' | 'type'>): boolean {
  return (
    signal.source === 'github' ||
    signal.source === 'github_actions' ||
    signal.source === 'codecov' ||
    /change|build|deploy|test|coverage/i.test(signal.type)
  );
}

export function isRuntimeSignal(signal: Pick<PulseSignal, 'source' | 'type'>): boolean {
  return (
    signal.source === 'sentry' ||
    signal.source === 'datadog' ||
    signal.source === 'prometheus' ||
    /runtime|latency|error|incident|timeout/i.test(signal.type)
  );
}

function resolveExecutionMode(
  draft: PulseSignalDraft,
  capabilityMatches: PulseCapability[],
  relatedScopeFiles: PulseScopeFile[],
  protectedByGovernance: boolean,
  changeSignal: boolean,
  hasDirectStructuralTarget: boolean,
  flowMatches: PulseFlowProjectionItem[],
): PulseScopeExecutionMode {
  if (protectedByGovernance) return 'human_required';
  if (draft.executionMode === 'human_required') return 'human_required';
  if (
    capabilityMatches.some((c) => c.executionMode === 'human_required') ||
    relatedScopeFiles.some((f) => f.executionMode === 'human_required')
  )
    return 'human_required';
  if (draft.executionMode === 'observation_only' || (changeSignal && !hasDirectStructuralTarget)) {
    return 'observation_only';
  }
  if (capabilityMatches.length === 0 && flowMatches.length === 0 && draft.impactScore >= 0.7) {
    return 'observation_only';
  }
  return 'ai_safe';
}

export function buildSignalState(
  drafts: PulseSignalDraft[],
  input: BuildExternalSignalStateInput,
): PulseSignal[] {
  const capabilityIndexes = buildCapabilityIndexes(input.capabilityState.capabilities);
  const flowIndexes = buildFlowIndexes(input.flowProjection.flows);
  const scopeFilesByPath = new Map(
    input.scopeState.files.map((file) => [file.path.replace(/\\/g, '/'), file] as const),
  );

  const mappedSignals = drafts.map((draft) => {
    const summaryTerms = unique(tokenize([draft.summary, ...draft.tags].join(' '))).filter(
      (entry) => entry.length >= 4,
    );
    const hasDirectStructuralTarget =
      draft.relatedFiles.length > 0 || draft.routePatterns.length > 0;
    const changeSignal = isChangeSignal({ source: draft.source, type: draft.type });
    const allowTermMatch = hasDirectStructuralTarget || !changeSignal;

    const capabilityMatches = capabilityIndexes
      .filter((entry) => {
        const fileMatch = draft.relatedFiles.some((filePath) =>
          [...entry.filePaths].some((candidate) => normalizedFileMatch(candidate, filePath)),
        );
        const routeMatch = draft.routePatterns.some((routePattern) =>
          entry.routePatterns.some((candidate) => routeMatches(candidate, routePattern)),
        );
        const termMatch = allowTermMatch && summaryTerms.some((term) => entry.terms.includes(term));
        return fileMatch || routeMatch || termMatch;
      })
      .map((entry) => entry.capability);

    const flowMatches = flowIndexes
      .filter((entry) => {
        const routeMatch = draft.routePatterns.some((routePattern) =>
          entry.routePatterns.some((candidate) => routeMatches(candidate, routePattern)),
        );
        const capabilityMatch = entry.flow.capabilityIds.some((capabilityId) =>
          capabilityMatches.some((capability) => capability.id === capabilityId),
        );
        const termMatch = allowTermMatch && summaryTerms.some((term) => entry.terms.includes(term));
        return routeMatch || capabilityMatch || termMatch;
      })
      .map((entry) => entry.flow);

    const relatedScopeFiles = unique(
      draft.relatedFiles
        .flatMap((filePath) =>
          input.scopeState.files.filter((file) => normalizedFileMatch(file.path, filePath)),
        )
        .map((file) => file.path),
    )
      .map((filePath) => scopeFilesByPath.get(filePath))
      .filter((file): file is PulseScopeFile => Boolean(file));

    const protectedByGovernance =
      capabilityMatches.some((capability) => capability.protectedByGovernance) ||
      relatedScopeFiles.some((file) => file.protectedByGovernance);

    const executionMode = resolveExecutionMode(
      draft,
      capabilityMatches,
      relatedScopeFiles,
      protectedByGovernance,
      changeSignal,
      hasDirectStructuralTarget,
      flowMatches,
    );

    const ownerLane = selectLane(
      [
        ...capabilityMatches.map((capability) => capability.ownerLane),
        ...relatedScopeFiles.map((file) => file.ownerLane),
        isDependencySignal({ source: draft.source, type: draft.type }) ? 'security' : null,
        isRuntimeSignal({ source: draft.source, type: draft.type }) ? 'reliability' : null,
        draft.routePatterns.length > 0 ? 'customer' : null,
        'platform',
      ].filter(Boolean) as PulseConvergenceOwnerLane[],
    );

    return {
      ...draft,
      severity: Math.max(0, Math.min(1, draft.severity)),
      impactScore: Math.max(0, Math.min(1, draft.impactScore)),
      confidence: Math.max(0, Math.min(1, draft.confidence)),
      capabilityIds: unique(capabilityMatches.map((capability) => capability.id)),
      flowIds: unique(flowMatches.map((flow) => flow.id)),
      recentChangeRefs: [],
      ownerLane,
      executionMode,
      protectedByGovernance,
      validationTargets: unique(
        [
          'PULSE_EXTERNAL_SIGNAL_STATE.json',
          'PULSE_CERTIFICATE.json',
          capabilityMatches.length > 0 ? 'PULSE_CAPABILITY_STATE.json' : null,
          flowMatches.length > 0 ? 'PULSE_FLOW_PROJECTION.json' : null,
        ].filter(Boolean) as string[],
      ),
    } satisfies PulseSignal;
  });

  const merged = new Map<string, PulseSignal>();
  for (const signal of mappedSignals) {
    const key = [
      signal.source,
      signal.type,
      signal.summary.toLowerCase(),
      signal.relatedFiles.join('|'),
      signal.routePatterns.join('|'),
    ].join('::');
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, signal);
      continue;
    }
    merged.set(key, {
      ...existing,
      severity: Math.max(existing.severity, signal.severity),
      impactScore: Math.max(existing.impactScore, signal.impactScore),
      confidence: Math.max(existing.confidence, signal.confidence),
      relatedFiles: unique([...existing.relatedFiles, ...signal.relatedFiles]),
      routePatterns: unique([...existing.routePatterns, ...signal.routePatterns]),
      tags: unique([...existing.tags, ...signal.tags]),
      capabilityIds: unique([...existing.capabilityIds, ...signal.capabilityIds]),
      flowIds: unique([...existing.flowIds, ...signal.flowIds]),
      recentChangeRefs: unique([...existing.recentChangeRefs, ...signal.recentChangeRefs]),
      validationTargets: unique([...existing.validationTargets, ...signal.validationTargets]),
      protectedByGovernance: existing.protectedByGovernance || signal.protectedByGovernance,
      executionMode:
        existing.executionMode === 'human_required' || signal.executionMode === 'human_required'
          ? 'human_required'
          : existing.executionMode === 'observation_only' ||
              signal.executionMode === 'observation_only'
            ? 'observation_only'
            : 'ai_safe',
    });
  }

  return [...merged.values()].sort(
    (left, right) =>
      right.impactScore - left.impactScore ||
      right.severity - left.severity ||
      left.id.localeCompare(right.id),
  );
}

export function attachRecentChangeRefs(signals: PulseSignal[]): PulseSignal[] {
  const changeSignals = signals.filter((signal) => signal.source === 'github');
  if (changeSignals.length === 0) return signals;

  return signals.map((signal) => {
    if (signal.source === 'github') return signal;

    const recentChangeRefs = changeSignals
      .filter((change) => {
        const fileOverlap =
          signal.relatedFiles.length > 0 &&
          change.relatedFiles.some((filePath) =>
            signal.relatedFiles.some((candidate) => normalizedFileMatch(candidate, filePath)),
          );
        const routeOverlap =
          signal.routePatterns.length > 0 &&
          change.routePatterns.some((routePattern) =>
            signal.routePatterns.some((candidate) => routeMatches(candidate, routePattern)),
          );
        const capabilityOverlap =
          signal.capabilityIds.length > 0 &&
          change.capabilityIds.some((capabilityId) => signal.capabilityIds.includes(capabilityId));
        return fileOverlap || routeOverlap || capabilityOverlap;
      })
      .map((change) => change.id);

    return {
      ...signal,
      recentChangeRefs: unique([...signal.recentChangeRefs, ...recentChangeRefs]),
    };
  });
}
