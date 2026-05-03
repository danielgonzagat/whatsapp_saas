import type { PulseCapability } from '../../types';
import type { PulseCapabilityState, PulseProductGraph } from '../../types';
import { safeReadJson, CAPABILITY_STATE_FILENAME, PRODUCT_GRAPH_FILENAME } from './path-resolution';
import type { ProofStatus } from '../../types.production-proof';

/**
 * Combine multiple proof dimension statuses into a single overall status.
 *
 * Rules:
 * - If any dimension is `failed`, overall is `failed`.
 * - If all dimensions are `proven` or `not_required`, overall is `proven`.
 * - If at least one dimension is `unproven`, overall is `unproven`.
 * - If any dimension is `stale` and none are `failed`/`unproven`, overall is `stale`.
 */
export function computeOverallStatus(statuses: ProofStatus[]): ProofStatus {
  if (statuses.length === 0) {
    return 'unproven';
  }

  const hasFailed = statuses.some((s) => s === 'failed');
  if (hasFailed) {
    return 'failed';
  }

  const hasUnproven = statuses.some((s) => s === 'unproven');
  if (hasUnproven) {
    return 'unproven';
  }

  const provenOrNotRequired = statuses.every((s) => s === 'proven' || s === 'not_required');
  if (provenOrNotRequired) {
    return 'proven';
  }

  return 'stale';
}

export function loadCapabilities(rootDir: string): PulseCapability[] {
  const state = safeReadJson<PulseCapabilityState>(rootDir, CAPABILITY_STATE_FILENAME);
  if (state && Array.isArray(state.capabilities)) {
    return state.capabilities;
  }

  const productGraph = safeReadJson<PulseProductGraph>(rootDir, PRODUCT_GRAPH_FILENAME);
  if (productGraph) {
    return productGraph.capabilities.map((c) => ({
      id: c.id,
      name: c.id,
      truthMode: c.truthMode,
      status: c.truthMode === 'observed' ? 'real' : 'partial',
      confidence: c.maturityScore,
      userFacing: true,
      runtimeCritical: c.criticality === 'must_have',
      protectedByGovernance: false,
      ownerLane: 'platform' as const,
      executionMode: 'ai_safe' as const,
      rolesPresent: [],
      missingRoles: [],
      filePaths: c.artifactIds,
      nodeIds: [],
      routePatterns: [],
      evidenceSources: [],
      codacyIssueCount: 0,
      highSeverityIssueCount: 0,
      blockingReasons: c.blockers ?? [],
      validationTargets: [],
      maturity: {
        stage: 'connected' as const,
        score: c.maturityScore,
        dimensions: {
          interfacePresent: false,
          apiSurfacePresent: false,
          orchestrationPresent: false,
          persistencePresent: false,
          sideEffectPresent: false,
          runtimeEvidencePresent: false,
          validationPresent: false,
          scenarioCoveragePresent: false,
          codacyHealthy: true,
          simulationOnly: false,
        },
        missing: [],
      },
      dod: {
        status: c.truthMode === 'observed' ? 'done' : 'partial',
        missingRoles: [],
        blockers: [],
        truthModeMet: c.truthMode === 'observed',
      },
    }));
  }

  return [];
}
