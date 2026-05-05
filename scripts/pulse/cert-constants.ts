/**
 * Compatibility internals used by certification modules.
 * Regex collections are kernel grammar for normalizing Break.type syntax into
 * certification objectives. Gate/profile/numeric-limit decisions are derived
 * outside this module from resolved artifacts and evaluated evidence.
 */
import type { Break, PulseGateName } from './types.manifest';
import {
  discoverSecurityFindingEventPatternsFromEvidence,
  discoverIsolationFindingEventPatternsFromEvidence,
  discoverRecoveryFindingEventPatternsFromEvidence,
  discoverPerformanceFindingEventPatternsFromEvidence,
  discoverObservabilityFindingEventPatternsFromEvidence,
  discoverRuntimeFindingEventPatternsFromEvidence,
  discoverCheckerGapTypesFromEvidence,
} from './dynamic-reality-kernel/__parts__/token-evidence';

export const SECURITY_FINDING_EVENT_KERNEL_GRAMMAR =
  discoverSecurityFindingEventPatternsFromEvidence();

export const ISOLATION_FINDING_EVENT_KERNEL_GRAMMAR =
  discoverIsolationFindingEventPatternsFromEvidence();

export const RECOVERY_FINDING_EVENT_KERNEL_GRAMMAR =
  discoverRecoveryFindingEventPatternsFromEvidence();

export const PERFORMANCE_FINDING_EVENT_KERNEL_GRAMMAR =
  discoverPerformanceFindingEventPatternsFromEvidence();

export const OBSERVABILITY_FINDING_EVENT_KERNEL_GRAMMAR =
  discoverObservabilityFindingEventPatternsFromEvidence();

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
    legacyPatterns: discoverSecurityFindingEventPatternsFromEvidence(),
  },
  isolationPass: {
    gateName: 'isolationPass',
    objective: 'dynamic tenant-isolation certification objective',
    evidenceRequirement:
      'workspace and tenant evidence must not expose blocking isolation predicates',
    legacyPatterns: discoverIsolationFindingEventPatternsFromEvidence(),
  },
  recoveryPass: {
    gateName: 'recoveryPass',
    objective: 'dynamic recovery certification objective',
    evidenceRequirement:
      'backup, rollback, deploy, and disaster-recovery evidence must be executable',
    legacyPatterns: discoverRecoveryFindingEventPatternsFromEvidence(),
  },
  performancePass: {
    gateName: 'performancePass',
    objective: 'dynamic performance certification objective',
    evidenceRequirement:
      'latency, scale, browser, and resource evidence must not expose blocking performance predicates',
    legacyPatterns: discoverPerformanceFindingEventPatternsFromEvidence(),
  },
  observabilityPass: {
    gateName: 'observabilityPass',
    objective: 'dynamic observability certification objective',
    evidenceRequirement:
      'audit, deletion, admin, and telemetry evidence must not expose blocking observability predicates',
    legacyPatterns: discoverObservabilityFindingEventPatternsFromEvidence(),
  },
} satisfies Partial<Record<PulseGateName, CertificationFindingPredicate>>;

export const RUNTIME_FINDING_EVENT_KERNEL_GRAMMAR =
  discoverRuntimeFindingEventPatternsFromEvidence();

export const CHECKER_GAP_TYPES = discoverCheckerGapTypesFromEvidence() as Set<Break['type']>;
