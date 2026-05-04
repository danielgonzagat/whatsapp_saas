/**
 * Pure helper functions for PULSE certification.
 * No I/O except getCommitSha (git). All other functions are pure.
 */
import { execSync } from 'child_process';
import type {
  Break,
  PulseCodacyIssue,
  PulseCodacySummary,
  PulseCertificationTarget,
  PulseEnvironment,
  PulseExternalSignalState,
  PulseExecutionEvidence,
  PulseGateFailureClass,
  PulseGateName,
  PulseGateResult,
  PulseManifest,
  PulseManifestCertificationTier,
  PulseManifestFinalReadinessCriteria,
  PulseParserInventory,
  PulseResolvedManifest,
  PulseActorEvidence,
} from './types';
import { CHECKER_GAP_TYPES } from './cert-constants';
import { isBlockingDynamicFinding, summarizeDynamicFindingEvents } from './finding-identity';

export function getEnvironment(): PulseEnvironment {
  if (process.env.PULSE_TOTAL === '1') return 'total';
  if (process.env.PULSE_DEEP === '1') return 'deep';
  return 'scan';
}

export function getCertificationTarget(input?: PulseCertificationTarget): PulseCertificationTarget {
  return {
    tier: typeof input?.tier === 'number' ? input.tier : null,
    final: Boolean(input?.final),
    profile: input?.profile || null,
    certificationScope: input?.certificationScope || input?.profile || null,
  };
}

export function getCertificationTiers(
  resolvedManifest: PulseResolvedManifest,
): PulseManifestCertificationTier[] {
  return [...resolvedManifest.certificationTiers].sort((a, b) => a.id - b.id);
}

export function getFinalReadinessCriteria(
  resolvedManifest: PulseResolvedManifest,
): PulseManifestFinalReadinessCriteria {
  return resolvedManifest.finalReadinessCriteria;
}

export function deriveGateOrderFromResults(
  gates: Partial<Record<PulseGateName, PulseGateResult>>,
): PulseGateName[] {
  return (Object.keys(gates) as PulseGateName[]).filter((gateName) => gates[gateName]);
}

export function getCommitSha(rootDir: string): string {
  try {
    return execSync('git rev-parse HEAD', { cwd: rootDir, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
}

export function isCriticalBreak(item: Break): boolean {
  return item.severity === 'critical' || item.severity === 'high';
}

export function matchesAny(type: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(type));
}

export function filterCodacyIssues(
  codacy: PulseCodacySummary,
  predicate: (issue: PulseCodacyIssue) => boolean,
): PulseCodacyIssue[] {
  return codacy.highPriorityBatch.filter(
    (issue) => issue.severityLevel === 'HIGH' && predicate(issue),
  );
}

export function summarizeCodacyFiles(issues: PulseCodacyIssue[], limit: number = 8): string[] {
  const counts = new Map<string, number>();
  for (const issue of issues) counts.set(issue.filePath, (counts.get(issue.filePath) || 0) + 1);
  return [...counts.entries()]
    .sort((l, r) => r[1] - l[1] || l[0].localeCompare(r[0]))
    .slice(0, limit)
    .map(([fp, count]) => (count > 1 ? `${fp} (${count})` : fp));
}

export function isRuntimeExternalSignal(
  signal: PulseExternalSignalState['signals'][number],
): boolean {
  return (
    signal.source === 'sentry' ||
    signal.source === 'datadog' ||
    signal.source === 'prometheus' ||
    /runtime|latency|error|incident|timeout/i.test(signal.type)
  );
}

export function isChangeExternalSignal(
  signal: PulseExternalSignalState['signals'][number],
): boolean {
  return (
    signal.source === 'github' ||
    signal.source === 'github_actions' ||
    signal.source === 'codecov' ||
    /change|build|deploy|test|coverage/i.test(signal.type)
  );
}

export function isDependencyExternalSignal(
  signal: PulseExternalSignalState['signals'][number],
): boolean {
  return signal.source === 'dependabot' || /dependency|vuln|supply/i.test(signal.type);
}

export function summarizeExternalSignalIds(
  signals: PulseExternalSignalState['signals'],
  limit: number = 6,
): string[] {
  return signals
    .slice()
    .sort(
      (l, r) =>
        r.impactScore - l.impactScore || r.severity - l.severity || l.id.localeCompare(r.id),
    )
    .slice(0, limit)
    .map((signal) => `${signal.source}:${signal.type}`);
}

export function isCodacySecurityIssue(issue: PulseCodacyIssue): boolean {
  const h = `${issue.patternId} ${issue.category} ${issue.message}`.toUpperCase();
  return (
    h.includes('SECURITY') ||
    h.includes('PASSWORD') ||
    h.includes('COOKIE') ||
    h.includes('AUTH') ||
    h.includes('SECRET') ||
    h.includes('XSS') ||
    h.includes('CSRF') ||
    h.includes('INJECTION')
  );
}

export function isCodacyIsolationIssue(issue: PulseCodacyIssue): boolean {
  const h = `${issue.patternId} ${issue.category} ${issue.message}`.toUpperCase();
  return (
    h.includes('WORKSPACE') ||
    h.includes('TENANT') ||
    h.includes('ISOLATION') ||
    h.includes('MISSING_WORKSPACE_FILTER')
  );
}

export function getActiveTemporaryAcceptances(
  manifest: PulseManifest | null,
): PulseManifest['temporaryAcceptances'] {
  if (!manifest) return [];
  const now = Date.now();
  return manifest.temporaryAcceptances.filter((entry) => {
    const expiresAt = Date.parse(entry.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt >= now;
  });
}

export function isGateAccepted(manifest: PulseManifest | null, gate: PulseGateName): boolean {
  return getActiveTemporaryAcceptances(manifest).some(
    (entry) => entry.targetType === 'gate' && entry.target === gate,
  );
}

export function isBreakTypeAccepted(manifest: PulseManifest | null, type: Break['type']): boolean {
  return getActiveTemporaryAcceptances(manifest).some(
    (entry) => entry.targetType === 'break_type' && entry.target === type,
  );
}

export function acceptedGatePass(
  manifest: PulseManifest | null,
  gate: PulseGateName,
): PulseGateResult {
  const entry = getActiveTemporaryAcceptances(manifest).find(
    (item) => item.targetType === 'gate' && item.target === gate,
  );
  return {
    status: 'pass',
    reason: entry
      ? `Temporarily accepted by manifest until ${entry.expiresAt}: ${entry.reason}`
      : 'Temporarily accepted by manifest.',
  };
}

export function filterBlockingBreaks(
  breaks: Break[],
  predicate?: (item: Break) => boolean,
  manifest?: PulseManifest | null,
): Break[] {
  return breaks.filter((item) => {
    if (!isCriticalBreak(item)) return false;
    if (CHECKER_GAP_TYPES.has(item.type)) return false;
    if (manifest && isBreakTypeAccepted(manifest, item.type)) return false;
    if (!isBlockingDynamicFinding(item)) return false;
    return predicate ? predicate(item) : true;
  });
}

export function inferRuntimeCheckNames(parserInventory: PulseParserInventory): string[] {
  return parserInventory.loadedChecks
    .map((check) => check.name)
    .filter((name) =>
      /build|test|e2e|crud|auth-flow|contract|performance|browser|responsive|hydration|accessibility|chaos|concurrency|backup|rollback|monitoring|observability|audit|npm-audit|webhook|state-machine|cache-invalidation|disaster-recovery/i.test(
        name,
      ),
    )
    .sort();
}

export function summarizeBreakTypes(breaks: Break[]): string[] {
  return summarizeDynamicFindingEvents(breaks);
}

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function getApplicableFlowIds(
  manifest: PulseManifest | null,
  env: PulseEnvironment,
): string[] {
  return (
    manifest?.flowSpecs.filter((spec) => spec.environments.includes(env)).map((spec) => spec.id) ||
    []
  );
}

export function getApplicableInvariantIds(
  manifest: PulseManifest | null,
  env: PulseEnvironment,
): string[] {
  return (
    manifest?.invariantSpecs
      .filter((spec) => spec.environments.includes(env))
      .map((spec) => spec.id) || []
  );
}

export function getAcceptedTargetIds(
  manifest: PulseManifest | null,
  targetType: 'flow' | 'invariant',
): string[] {
  return getActiveTemporaryAcceptances(manifest)
    .filter((entry) => entry.targetType === targetType)
    .map((entry) => entry.target);
}

export function targetRequiresCustomerExecution(target: PulseCertificationTarget): boolean {
  return (
    target.profile === 'core-critical' ||
    target.profile === 'full-product' ||
    target.final ||
    (typeof target.tier === 'number' && target.tier >= 1)
  );
}

export function targetRequiresOperatorExecution(target: PulseCertificationTarget): boolean {
  return (
    target.profile === 'core-critical' ||
    target.profile === 'full-product' ||
    target.final ||
    (typeof target.tier === 'number' && target.tier >= 2)
  );
}

export function targetRequiresSoakExecution(target: PulseCertificationTarget): boolean {
  return (
    target.profile === 'full-product' ||
    target.final ||
    (typeof target.tier === 'number' && target.tier >= 4)
  );
}

export function getAcceptedCriticalFlows(
  manifest: PulseManifest | null,
  evidence: PulseExecutionEvidence,
): string[] {
  const criticalFlowIds = new Set(
    (manifest?.flowSpecs || []).filter((spec) => spec.critical).map((spec) => spec.id),
  );
  return unique(
    evidence.flows.results
      .filter((result) => result.accepted && criticalFlowIds.has(result.flowId))
      .map((result) => result.flowId),
  ).sort();
}

export function getPendingCriticalScenarios(evidence: PulseExecutionEvidence): string[] {
  const actorResults = [
    ...evidence.customer.results,
    ...evidence.operator.results,
    ...evidence.admin.results,
    ...evidence.soak.results,
  ];
  return unique(
    actorResults
      .filter((result) => result.critical)
      .filter((result) => result.status === 'missing_evidence' || result.status === 'skipped')
      .map((result) => result.scenarioId),
  ).sort();
}

export function worldStateHasPendingCriticalExpectations(
  evidence: PulseExecutionEvidence,
): boolean {
  const criticalScenarioIds = new Set(
    [
      ...evidence.customer.results,
      ...evidence.operator.results,
      ...evidence.admin.results,
      ...evidence.soak.results,
    ]
      .filter((result) => result.critical)
      .map((result) => result.scenarioId),
  );
  return evidence.worldState.asyncExpectationsStatus.some(
    (entry) => criticalScenarioIds.has(entry.scenarioId) && entry.status !== 'satisfied',
  );
}

export function normalizeRoutePattern(value: string): string {
  const normalized = value.replace(/\*+/g, '').replace(/\/+$/, '').toLowerCase();
  return normalized || '/';
}

export function routeMatches(route: string, pattern: string): boolean {
  const nr = normalizeRoutePattern(route);
  const np = normalizeRoutePattern(pattern);
  if (!np) return false;
  return nr === np || nr.startsWith(np);
}

export function chooseStructuredFailureClass<
  T extends { failureClass?: PulseGateFailureClass; status: string },
>(results: T[]): PulseGateFailureClass {
  if (results.some((item) => item.failureClass === 'product_failure')) return 'product_failure';
  if (results.some((item) => item.failureClass === 'checker_gap')) return 'checker_gap';
  return 'missing_evidence';
}

export function getDeclaredScenarioIds(
  resolvedManifest: PulseResolvedManifest,
  actorKind: PulseActorEvidence['actorKind'],
): string[] {
  if (actorKind === 'soak') {
    return resolvedManifest.scenarioSpecs
      .filter((spec) => spec.timeWindowModes.includes('soak'))
      .map((spec) => spec.id);
  }
  return resolvedManifest.scenarioSpecs
    .filter((spec) => spec.actorKind === actorKind)
    .map((spec) => spec.id);
}
