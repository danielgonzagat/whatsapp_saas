/**
 * Compatibility internals used by certification modules.
 * Regex collections and default gate ordering are baseline-derived fallbacks,
 * not a universal definition of product truth.
 */
import type { Break, PulseGateName } from './types';

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

export interface CertificationFindingPredicate {
  gateName: PulseGateName;
  objective: string;
  evidenceRequirement: string;
  legacyPatterns: RegExp[];
}

export const CERTIFICATION_FINDING_PREDICATES = {
  securityPass: {
    gateName: 'securityPass',
    objective: 'dynamic security certification objective',
    evidenceRequirement:
      'runtime, static, or external evidence must not expose blocking security predicates',
    legacyPatterns: SECURITY_PATTERNS,
  },
  isolationPass: {
    gateName: 'isolationPass',
    objective: 'dynamic tenant-isolation certification objective',
    evidenceRequirement:
      'workspace and tenant evidence must not expose blocking isolation predicates',
    legacyPatterns: ISOLATION_PATTERNS,
  },
  recoveryPass: {
    gateName: 'recoveryPass',
    objective: 'dynamic recovery certification objective',
    evidenceRequirement:
      'backup, rollback, deploy, and disaster-recovery evidence must be executable',
    legacyPatterns: RECOVERY_PATTERNS,
  },
  performancePass: {
    gateName: 'performancePass',
    objective: 'dynamic performance certification objective',
    evidenceRequirement:
      'latency, scale, browser, and resource evidence must not expose blocking performance predicates',
    legacyPatterns: PERFORMANCE_PATTERNS,
  },
  observabilityPass: {
    gateName: 'observabilityPass',
    objective: 'dynamic observability certification objective',
    evidenceRequirement:
      'audit, deletion, admin, and telemetry evidence must not expose blocking observability predicates',
    legacyPatterns: OBSERVABILITY_PATTERNS,
  },
} satisfies Partial<Record<PulseGateName, CertificationFindingPredicate>>;

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
