import type {
  ProductionProofDimension,
  ProductionProofDimensionEvidence,
  ProofStatus,
} from '../../types.production-proof';

export const DIMENSION_TARGET_ENGINES: Record<
  ProductionProofDimension,
  ProductionProofDimensionEvidence['targetEngine']
> = {
  deployStatus: 'runtime-probes',
  healthCheck: 'runtime-probes',
  scenarioPass: 'scenario-engine',
  runtimeProbe: 'runtime-probes',
  observabilityCheck: 'observability-coverage',
  noSentryRegression: 'external-sources-orchestrator',
  dbSideEffects: 'runtime-probes',
  rollbackPossible: 'production-proof',
  performanceBudget: 'performance-budget',
};

export const DIMENSION_ACTIONS: Record<ProductionProofDimension, string> = {
  deployStatus:
    'Improve PULSE deploy/runtime probe ingestion so active deployment evidence is observed before production proof is claimed.',
  healthCheck:
    'Improve PULSE runtime health probes and freshness metadata so health evidence is observed or explicitly not_available.',
  scenarioPass:
    'Improve PULSE scenario execution evidence for this capability; do not replace missing proof with product-code speculation.',
  runtimeProbe:
    'Improve PULSE runtime probe execution or preserved live-probe loading before counting runtime proof.',
  observabilityCheck:
    'Improve PULSE observability coverage evidence ingestion before counting observability proof.',
  noSentryRegression:
    'Improve PULSE external Sentry adapter evidence and freshness reporting before claiming no regression.',
  dbSideEffects:
    'Improve PULSE runtime probe coverage for database side-effect evidence before claiming production proof.',
  rollbackPossible:
    'Improve PULSE deploy-history and rollback evidence collection before treating rollback as proven.',
  performanceBudget:
    'Implement or improve the PULSE performance-budget evidence engine; do not translate the missing budget into a product edit.',
};

export function truthModeForProofStatus(
  status: ProofStatus,
): ProductionProofDimensionEvidence['truthMode'] {
  if (status === 'proven' || status === 'failed' || status === 'stale') return 'observed';
  if (status === 'not_required') return 'not_available';
  return 'not_available';
}

export function reasonForProofStatus(
  dimension: ProductionProofDimension,
  status: ProofStatus,
): string {
  if (status === 'proven') return `${dimension} is backed by observed PULSE proof.`;
  if (status === 'failed') return `${dimension} has observed failing proof.`;
  if (status === 'stale') return `${dimension} has observed proof but it is stale.`;
  if (status === 'not_required') return `${dimension} is not required for this capability.`;
  return `${dimension} has no observed PULSE proof for this capability.`;
}

export function buildDimensionEvidence(
  statuses: Record<ProductionProofDimension, ProofStatus>,
): Record<ProductionProofDimension, ProductionProofDimensionEvidence> {
  return Object.fromEntries(
    (Object.entries(statuses) as Array<[ProductionProofDimension, ProofStatus]>).map(
      ([dimension, status]) => [
        dimension,
        {
          dimension,
          status,
          truthMode: truthModeForProofStatus(status),
          targetEngine: DIMENSION_TARGET_ENGINES[dimension],
          reason: reasonForProofStatus(dimension, status),
          recommendedPulseAction: DIMENSION_ACTIONS[dimension],
          productEditRequired: false,
        },
      ],
    ),
  ) as Record<ProductionProofDimension, ProductionProofDimensionEvidence>;
}
