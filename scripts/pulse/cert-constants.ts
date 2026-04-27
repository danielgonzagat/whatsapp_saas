/**
 * Constants used across certification modules.
 * Pattern arrays, gate ordering, tier definitions, and readiness criteria.
 */
import type {
  Break,
  PulseGateName,
  PulseManifestCertificationTier,
  PulseManifestFinalReadinessCriteria,
} from './types';

export const SECURITY_PATTERNS = [
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

export const ISOLATION_PATTERNS = [/WORKSPACE_ISOLATION/, /MISSING_WORKSPACE_FILTER/, /TENANT_/];

export const RECOVERY_PATTERNS = [
  /^BACKUP_MISSING$/,
  /^DR_/,
  /ROLLBACK/,
  /DEPLOY_NO_FEATURE_FLAGS/,
  /MIGRATION_NO_ROLLBACK/,
];

export const PERFORMANCE_PATTERNS = [
  /SLOW_QUERY/,
  /UNBOUNDED_RESULT/,
  /MEMORY_LEAK/,
  /NETWORK_SLOW_UNUSABLE/,
  /RESPONSIVE_BROKEN/,
  /NODEJS_EVENT_LOOP_BLOCKED/,
  /DB_POOL_EXHAUSTION_HANG/,
];

export const OBSERVABILITY_PATTERNS = [
  /OBSERVABILITY_/,
  /^AUDIT_FINANCIAL_NO_TRAIL$/,
  /^AUDIT_DELETION_NO_LOG$/,
  /^AUDIT_ADMIN_NO_LOG$/,
];

export const RUNTIME_PATTERNS = [
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

export const CHECKER_GAP_TYPES = new Set<Break['type']>([
  'CHECK_UNAVAILABLE',
  'MANIFEST_MISSING',
  'MANIFEST_INVALID',
  'UNKNOWN_SURFACE',
]);

export const GATE_ORDER: PulseGateName[] = [
  'scopeClosed',
  'adapterSupported',
  'specComplete',
  'truthExtractionPass',
  'staticPass',
  'runtimePass',
  'changeRiskPass',
  'productionDecisionPass',
  'browserPass',
  'flowPass',
  'invariantPass',
  'securityPass',
  'isolationPass',
  'recoveryPass',
  'performancePass',
  'observabilityPass',
  'customerPass',
  'operatorPass',
  'adminPass',
  'soakPass',
  'syntheticCoveragePass',
  'evidenceFresh',
  'pulseSelfTrustPass',
  'noOverclaimPass',
  'multiCycleConvergencePass',
  'testHonestyPass',
  'assertionStrengthPass',
  'typeIntegrityPass',
];

export const DEFAULT_CERTIFICATION_TIERS: PulseManifestCertificationTier[] = [
  {
    id: 0,
    name: 'Truth + Runtime Baseline',
    gates: [
      'truthExtractionPass',
      'runtimePass',
      'changeRiskPass',
      'productionDecisionPass',
      'syntheticCoveragePass',
    ],
  },
  {
    id: 1,
    name: 'Customer Truth',
    gates: ['browserPass', 'flowPass', 'customerPass'],
    requireNoAcceptedFlows: true,
  },
  {
    id: 2,
    name: 'Operator + Admin Replacement',
    gates: ['operatorPass', 'adminPass'],
  },
  {
    id: 3,
    name: 'Production Reliability',
    gates: ['invariantPass', 'securityPass', 'recoveryPass', 'observabilityPass'],
  },
  {
    id: 4,
    name: 'Final Human Replacement',
    gates: ['soakPass'],
    requireNoAcceptedFlows: true,
    requireNoAcceptedScenarios: true,
    requireWorldStateConvergence: true,
  },
];

export const DEFAULT_FINAL_READINESS_CRITERIA: PulseManifestFinalReadinessCriteria = {
  requireAllTiersPass: true,
  requireNoAcceptedCriticalFlows: true,
  requireNoAcceptedCriticalScenarios: true,
  requireWorldStateConvergence: true,
};
