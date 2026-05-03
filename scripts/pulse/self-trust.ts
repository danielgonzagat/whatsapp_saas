/**
 * PULSE Self-Trust Verification
 *
 * Deterministic validation that PULSE's own analysis is credible.
 * If any of these checks fail, PULSE enters advisory-only mode and alerts.
 */

export type { SelfTrustCheckpoint, SelfTrustReport } from './__parts__/self-trust/checkpoint-types';

export {
  checkManifestIntegrity,
  checkParserRegistry,
  checkEvidenceFreshness,
  checkIdempotence,
  checkBreakConsistency,
} from './__parts__/self-trust/checks-foundational';

export {
  checkParserHardcodedFindingAudit,
  checkCrossArtifactConsistency,
  checkExecutionTraceAuditTrail,
  runSelfTrustChecks,
  formatSelfTrustReport,
} from './__parts__/self-trust/checks-advanced';
