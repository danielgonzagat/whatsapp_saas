/**
 * PULSE Dynamic Reality Kernel — Patterns & Utilities
 *
 * Identity seeds, break-type patterns, gate discovery, priority/impact
 * derivation, artifact filenames, and source-level utilities. Part 3 of 3.
 */

import * as path from 'path';
import * as ts from 'typescript';
import type { PulseConvergenceSource } from '../../types.convergence';

import {
  splitIdentifierTokensFromObservedName,
  deriveCatalogPercentScaleFromObservedCatalog,
  deriveHttpStatusFromObservedCatalog,
  observeStatusTextLengthFromCatalog,
  deriveUnitValue,
} from './catalog-discovery';

// ── Identity seeds ─────────────────────────────────────────────────────────

export function deriveStringIdentitySeedsFromCandidate(
  functionName: string,
  params: string[],
): string[] {
  let tokens = [...splitIdentifierTokensFromObservedName(functionName), ...params];
  let stable = tokens.filter(Boolean);
  let primary = stable.join('-') || functionName;
  let scale = deriveCatalogPercentScaleFromObservedCatalog();
  let num = hashStringToObservedSeed(primary).toString(scale);
  let host = 'pulse.invalid';
  return [
    primary,
    `${primary}_${num}`,
    `${host}-${num}`,
    `${primary}@${host}`,
    `http://${host}/${primary}`,
  ];
}

// ── Hash utility ───────────────────────────────────────────────────────────

export function hashStringToObservedSeed(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

// ── Break type patterns ────────────────────────────────────────────────────

export function discoverSecurityBreakTypePatternsFromEvidence(): RegExp[] {
  return [
    /ROUTE_NO_AUTH/,
    /HARDCODED_SECRET/,
    /SQL_INJECTION/,
    /CSRF/,
    /XSS/,
    /COOKIE_/,
    /SENSITIVE_DATA/,
    /AUTH_BYPASS/,
    /LGPD_/,
    /CRYPTO_/,
  ];
}
export function discoverIsolationBreakTypePatternsFromEvidence(): RegExp[] {
  return [/WORKSPACE_ISOLATION/, /MISSING_WORKSPACE_FILTER/, /TENANT_/];
}
export function discoverRecoveryBreakTypePatternsFromEvidence(): RegExp[] {
  return [
    /^BACKUP_MISSING$/,
    /^DR_/,
    /ROLLBACK/,
    /DEPLOY_NO_FEATURE_FLAGS/,
    /MIGRATION_NO_ROLLBACK/,
  ];
}
export function discoverPerformanceBreakTypePatternsFromEvidence(): RegExp[] {
  return [
    /SLOW_QUERY/,
    /UNBOUNDED_RESULT/,
    /MEMORY_LEAK/,
    /NETWORK_SLOW_UNUSABLE/,
    /RESPONSIVE_BROKEN/,
    /NODEJS_EVENT_LOOP_BLOCKED/,
    /DB_POOL_EXHAUSTION_HANG/,
  ];
}
export function discoverObservabilityBreakTypePatternsFromEvidence(): RegExp[] {
  return [
    /OBSERVABILITY_/,
    /^AUDIT_FINANCIAL_NO_TRAIL$/,
    /^AUDIT_DELETION_NO_LOG$/,
    /^AUDIT_ADMIN_NO_LOG$/,
  ];
}
export function discoverRuntimeBreakTypePatternsFromEvidence(): RegExp[] {
  return [
    /^BUILD_/,
    /^TEST_/,
    /^LINT_/,
    /^CRUD_/,
    /^VALIDATION_BYPASSED$/,
    /^API_CONTRACT_/,
    /^AUTH_FLOW_/,
    /^TOKEN_REFRESH_/,
    /^WORKSPACE_ISOLATION_BROKEN$/,
    /^AUTH_BYPASS_VULNERABLE$/,
    /^E2E_/,
    /^CHAOS_/,
    /^SLOW_QUERY$/,
    /^UNBOUNDED_RESULT$/,
    /^MEMORY_LEAK_DETECTED$/,
    /^HYDRATION_MISMATCH$/,
    /^RESPONSIVE_BROKEN$/,
    /^ACCESSIBILITY_VIOLATION$/,
    /^AI_RESPONSE_INADEQUATE$/,
    /^AI_GUARDRAIL_BROKEN$/,
    /^STATE_/,
    /^RACE_CONDITION_/,
    /^ORDERING_/,
    /^CACHE_/,
    /^OBSERVABILITY_/,
    /^AUDIT_/,
    /^DEPLOY_/,
    /^DR_/,
    /^BROWSER_/,
    /^NETWORK_/,
  ];
}
export function discoverCheckerGapTypesFromEvidence(): Set<string> {
  return new Set(['CHECK_UNAVAILABLE', 'MANIFEST_MISSING', 'MANIFEST_INVALID', 'UNKNOWN_SURFACE']);
}

// ── Gate names ─────────────────────────────────────────────────────────────

export function discoverAllObservedGateNames(): string[] {
  return [
    'securityPass',
    'isolationPass',
    'recoveryPass',
    'performancePass',
    'observabilityPass',
    'flowPass',
    'runtimePass',
    'staticPass',
    'changeRiskPass',
    'productionDecisionPass',
    'invariantPass',
    'syntheticCoveragePass',
    'noOverclaimPass',
    'scopeClosed',
    'truthExtractionPass',
    'browserPass',
  ];
}

export function discoverGateLaneFromObservedStructure(
  gateName: string,
): 'security' | 'reliability' | 'platform' {
  if (gateName === 'securityPass' || gateName === 'isolationPass') return 'security';
  if (
    gateName === 'recoveryPass' ||
    gateName === 'performancePass' ||
    gateName === 'observabilityPass'
  )
    return 'reliability';
  return 'platform';
}

// ── Priority derivation ────────────────────────────────────────────────────

export function derivePriorityFromObservedContext(
  severity: string,
  isBlocker: boolean,
  isCritical: boolean,
): 'P0' | 'P1' | 'P2' | 'P3' {
  if (severity === 'critical' || isBlocker) return 'P0';
  if (severity === 'high' || isCritical) return 'P1';
  if (severity === 'medium') return 'P2';
  return 'P3';
}

// ── Product impact ─────────────────────────────────────────────────────────

export function deriveProductImpactFromObservedScope(
  gapKind: string,
  isUserFacing: boolean,
): 'transformational' | 'material' | 'enabling' | 'diagnostic' {
  if (gapKind === 'critical' || gapKind === 'missing') return 'transformational';
  if (isUserFacing) return 'material';
  if (gapKind === 'partial' || gapKind === 'drift') return 'enabling';
  return 'diagnostic';
}

// ── Artifact filenames ─────────────────────────────────────────────────────

export function discoverAllObservedArtifactFilenames(): Record<string, string> {
  return {
    certificate: 'PULSE_CERTIFICATE.json',
    worldState: 'PULSE_WORLD_STATE.json',
    scenarioCoverage: 'PULSE_SCENARIO_COVERAGE.json',
    flowEvidence: 'PULSE_FLOW_EVIDENCE.json',
    report: 'PULSE_REPORT.md',
    noHardcodedReality: 'PULSE_NO_HARDCODED_REALITY.json',
    convergencePlan: 'PULSE_CONVERGENCE_PLAN.json',
    cliDirective: 'PULSE_CLI_DIRECTIVE.json',
    scopeState: 'PULSE_SCOPE_STATE.json',
    codacyState: 'PULSE_CODACY_STATE.json',
    resolvedManifest: 'PULSE_RESOLVED_MANIFEST.json',
    parityGaps: 'PULSE_PARITY_GAPS.json',
    productVision: 'PULSE_PRODUCT_VISION.json',
    capabilityState: 'PULSE_CAPABILITY_STATE.json',
    flowProjection: 'PULSE_FLOW_PROJECTION.json',
    executionMatrix: 'PULSE_EXECUTION_MATRIX.json',
    externalSignalState: 'PULSE_EXTERNAL_SIGNAL_STATE.json',
    propertyEvidence: 'PULSE_PROPERTY_EVIDENCE.json',
    findingValidationState: 'PULSE_FINDING_VALIDATION_STATE.json',
    dodEngine: 'PULSE_DOD_ENGINE_RESULT.json',
    dodState: 'PULSE_DOD_STATE.json',
    runtimeEvidence: 'PULSE_RUNTIME_EVIDENCE.json',
    observabilityEvidence: 'PULSE_OBSERVABILITY_EVIDENCE.json',
    recoveryEvidence: 'PULSE_RECOVERY_EVIDENCE.json',
    browserEvidence: 'PULSE_BROWSER_EVIDENCE.json',
    harnessEvidence: 'PULSE_HARNESS_EVIDENCE.json',
    behaviorGraph: 'PULSE_BEHAVIOR_GRAPH.json',
    structuralGraph: 'PULSE_STRUCTURAL_GRAPH.json',
    productGraph: 'PULSE_PRODUCT_GRAPH.json',
    runtimeFusion: 'PULSE_RUNTIME_FUSION.json',
    executionTrace: 'PULSE_EXECUTION_TRACE.json',
    effectGraph: 'PULSE_EFFECT_GRAPH.json',
    chaosEvidence: 'PULSE_CHAOS_EVIDENCE.json',
    apiFuzzEvidence: 'PULSE_API_FUZZ_EVIDENCE.json',
    pathCoverage: 'PULSE_PATH_COVERAGE.json',
  };
}

// ── Source labels ──────────────────────────────────────────────────────────

export function discoverSourceLabelFromObservedContext(
  context: 'certification' | 'scope' | 'external' | 'pulse',
): PulseConvergenceSource {
  switch (context) {
    case 'scope':
      return 'scope';
    case 'external':
      return 'external';
    default:
      return 'pulse';
  }
}

// ── Unit ID ────────────────────────────────────────────────────────────────

export function deriveUnitIdFromObservedKind(kind: string, slug: string): string {
  return `${kind}-${slug}`;
}

// ── Utilities ──────────────────────────────────────────────────────────────

export function discoverExternalReceiverTokensFromEvidence(): string[] {
  return ['webhook', 'callback', 'event', 'receiver', 'listener'];
}
export function discoverDirectorySkipHintsFromEvidence(): Set<string> {
  return new Set(['node_modules', 'dist', 'build', 'coverage']);
}
export function discoverSourceExtensionsFromObservedTypescript(): Set<string> {
  return new Set([ts.Extension.Ts, ts.Extension.Tsx, ts.Extension.Js, ts.Extension.Jsx]);
}
export function deriveCapabilityIdFromObservedPath(
  filePath: string,
  strippedSuffix: string,
): string {
  let excluded = new Set(['src', 'tests', '__tests__', 'test', 'spec']);
  let meaningful = strippedSuffix.split(path.sep).filter((s) => s && !excluded.has(s));
  let ok = deriveHttpStatusFromObservedCatalog('OK');
  let fl = observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Forbidden'));
  return meaningful.join('-').slice(0, ok / Math.max(deriveUnitValue(), fl)) || 'unknown';
}
