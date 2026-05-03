import type { PulseMachineReadiness } from '../../artifacts.types';

export function makeReadiness(
  criteria: PulseMachineReadiness['criteria'],
  status: PulseMachineReadiness['status'] = 'NOT_READY',
): PulseMachineReadiness {
  return {
    scope: 'pulse_machine_not_kloel_product',
    status,
    generatedAt: '2026-04-29T22:00:00.000Z',
    productCertificationStatus: 'NOT_CERTIFIED',
    productCertificationExcludedFromVerdict: true,
    canRunBoundedAutonomousCycle: true,
    canDeclareKloelProductCertified: false,
    criteria,
    blockers: criteria
      .filter((criterion) => criterion.status !== 'pass')
      .map((criterion) => `${criterion.id}: ${criterion.reason}`),
  };
}

export function collectRelatedFiles(units: Array<{ relatedFiles?: unknown }>): string[] {
  return units.flatMap((unit) => {
    if (!Array.isArray(unit.relatedFiles)) return [];
    return unit.relatedFiles.filter((filePath): filePath is string => typeof filePath === 'string');
  });
}

export function buildProofReadinessCompatibleAutonomyReadiness() {
  return {
    verdict: 'SIM' as const,
    mode: 'complete' as const,
    verdictScope: 'production_autonomy' as const,
    canWorkNow: false,
    canContinueUntilReady: true,
    canDeclareComplete: true,
    automationSafeUnits: 0,
    blockers: [] as string[],
    warnings: [] as string[],
  };
}
