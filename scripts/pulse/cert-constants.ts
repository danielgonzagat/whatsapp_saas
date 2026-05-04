/**
 * Compatibility internals used by certification modules.
 * Regex collections are kernel grammar for normalizing Break.type syntax into
 * certification objectives. Gate/profile/numeric-limit decisions are derived
 * outside this module from resolved artifacts and evaluated evidence.
 */
import type { Break, PulseGateName } from './types';
import {
  discoverSecurityBreakTypePatternsFromEvidence,
  discoverIsolationBreakTypePatternsFromEvidence,
  discoverRecoveryBreakTypePatternsFromEvidence,
  discoverPerformanceBreakTypePatternsFromEvidence,
  discoverObservabilityBreakTypePatternsFromEvidence,
  discoverRuntimeBreakTypePatternsFromEvidence,
  discoverCheckerGapTypesFromEvidence,
} from './dynamic-reality-kernel';

export const SECURITY_BREAK_TYPE_KERNEL_GRAMMAR = discoverSecurityBreakTypePatternsFromEvidence();

export const ISOLATION_BREAK_TYPE_KERNEL_GRAMMAR = discoverIsolationBreakTypePatternsFromEvidence();

export const RECOVERY_BREAK_TYPE_KERNEL_GRAMMAR = discoverRecoveryBreakTypePatternsFromEvidence();

export const PERFORMANCE_BREAK_TYPE_KERNEL_GRAMMAR =
  discoverPerformanceBreakTypePatternsFromEvidence();

export const OBSERVABILITY_BREAK_TYPE_KERNEL_GRAMMAR =
  discoverObservabilityBreakTypePatternsFromEvidence();

export const SECURITY_PATTERNS = discoverSecurityBreakTypePatternsFromEvidence();
export const ISOLATION_PATTERNS = discoverIsolationBreakTypePatternsFromEvidence();
export const RECOVERY_PATTERNS = discoverRecoveryBreakTypePatternsFromEvidence();
export const PERFORMANCE_PATTERNS = discoverPerformanceBreakTypePatternsFromEvidence();
export const OBSERVABILITY_PATTERNS = discoverObservabilityBreakTypePatternsFromEvidence();

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
    legacyPatterns: discoverSecurityBreakTypePatternsFromEvidence(),
  },
  isolationPass: {
    gateName: 'isolationPass',
    objective: 'dynamic tenant-isolation certification objective',
    evidenceRequirement:
      'workspace and tenant evidence must not expose blocking isolation predicates',
    legacyPatterns: discoverIsolationBreakTypePatternsFromEvidence(),
  },
  recoveryPass: {
    gateName: 'recoveryPass',
    objective: 'dynamic recovery certification objective',
    evidenceRequirement:
      'backup, rollback, deploy, and disaster-recovery evidence must be executable',
    legacyPatterns: discoverRecoveryBreakTypePatternsFromEvidence(),
  },
  performancePass: {
    gateName: 'performancePass',
    objective: 'dynamic performance certification objective',
    evidenceRequirement:
      'latency, scale, browser, and resource evidence must not expose blocking performance predicates',
    legacyPatterns: discoverPerformanceBreakTypePatternsFromEvidence(),
  },
  observabilityPass: {
    gateName: 'observabilityPass',
    objective: 'dynamic observability certification objective',
    evidenceRequirement:
      'audit, deletion, admin, and telemetry evidence must not expose blocking observability predicates',
    legacyPatterns: discoverObservabilityBreakTypePatternsFromEvidence(),
  },
} satisfies Partial<Record<PulseGateName, CertificationFindingPredicate>>;

export const RUNTIME_BREAK_TYPE_KERNEL_GRAMMAR = discoverRuntimeBreakTypePatternsFromEvidence();

export const RUNTIME_PATTERNS = discoverRuntimeBreakTypePatternsFromEvidence();

export const CHECKER_GAP_TYPES = discoverCheckerGapTypesFromEvidence() as Set<Break['type']>;
