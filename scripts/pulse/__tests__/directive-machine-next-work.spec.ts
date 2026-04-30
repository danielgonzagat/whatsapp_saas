import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import {
  applyProofReadinessToAutonomyClaims,
  buildProofReadinessSummaryForDirective,
  buildPathProofSurfaceForDirective,
  buildPulseAutonomyProofDebtNextWork,
  buildPulseCertificationProofDebtNextWork,
  buildPulseMachineNextWork,
} from '../artifacts.directive';
import type { PulseMachineReadiness } from '../artifacts.types';
import type { PulseGateName, PulseGateResult } from '../types';

function makeReadiness(
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

function collectRelatedFiles(units: Array<{ relatedFiles?: unknown }>): string[] {
  return units.flatMap((unit) => {
    if (!Array.isArray(unit.relatedFiles)) return [];
    return unit.relatedFiles.filter((filePath): filePath is string => typeof filePath === 'string');
  });
}

describe('buildPulseMachineNextWork', () => {
  it('turns failed machine-readiness criteria into PULSE-only executable work', () => {
    const work = buildPulseMachineNextWork(
      makeReadiness([
        {
          id: 'external_reality',
          status: 'fail',
          reason: '2 missing external adapter(s) remain.',
          evidence: {
            missingAdapters: 2,
            staleAdapters: 0,
            invalidAdapters: 0,
          },
        },
      ]),
    );

    expect(work).toHaveLength(1);
    expect(work[0]).toMatchObject({
      id: 'pulse-machine-external_reality',
      kind: 'pulse_machine',
      priority: 'P0',
      source: 'pulse_machine',
      executionMode: 'ai_safe',
      productImpact: 'machine',
      affectedCapabilities: [],
      affectedFlows: [],
    });
    expect(work[0].proofAuthority).toBe('artifact_registry');
    expect(work[0].validationArtifacts).toContain('PULSE_EXTERNAL_SIGNAL_STATE.json');
    expect(work[0].relatedFiles).toContain('scripts/pulse/runtime-fusion.ts');
    expect(work[0].forbiddenActions).toContain('Do not edit SaaS product code for this unit');
  });

  it('keeps terminal critical-path proof visible even when the criterion formally passes', () => {
    const work = buildPulseMachineNextWork(
      makeReadiness(
        [
          {
            id: 'critical_path_terminal',
            status: 'pass',
            reason:
              'All critical matrix paths have terminal classification; 10 still need observed proof.',
            evidence: {
              terminalWithoutObservedEvidence: 10,
              firstTerminalPathId: 'matrix:capability:example',
              nextAiSafeAction: 'node scripts/pulse/run.js --profile pulse-core-final --guidance',
            },
          },
        ],
        'READY',
      ),
    );

    expect(work).toHaveLength(1);
    expect(work[0].id).toBe('pulse-machine-critical_path_terminal');
    expect(work[0].validationArtifacts).toContain('PULSE_EXECUTION_MATRIX.json');
    expect(work[0].exitCriteria).toContain('Refresh observed proof for matrix:capability:example.');
  });

  it('returns no machine work when readiness is clean and no terminal proof debt remains', () => {
    const work = buildPulseMachineNextWork(
      makeReadiness(
        [
          {
            id: 'critical_path_terminal',
            status: 'pass',
            reason: 'All critical matrix paths are observed.',
            evidence: {
              terminalWithoutObservedEvidence: 0,
            },
          },
          {
            id: 'external_reality',
            status: 'pass',
            reason: 'External adapters are ready.',
            evidence: {
              missingAdapters: 0,
              staleAdapters: 0,
              invalidAdapters: 0,
            },
          },
        ],
        'READY',
      ),
    );

    expect(work).toHaveLength(0);
  });
});

describe('buildPathProofSurfaceForDirective', () => {
  it('reads canonical path proof tasks and coverage into the directive surface', () => {
    const previousCwd = process.cwd();
    const tempRoot = join(previousCwd, '.pulse', 'tmp');
    mkdirSync(tempRoot, { recursive: true });
    const rootDir = mkdtempSync(join(tempRoot, 'directive-proof-'));

    try {
      mkdirSync(join(rootDir, '.pulse', 'current'), { recursive: true });
      writeFileSync(
        join(rootDir, '.pulse', 'current', 'PULSE_PATH_PROOF_TASKS.json'),
        JSON.stringify({
          generatedAt: '2026-04-29T22:00:00.000Z',
          summary: {
            terminalWithoutObservedEvidence: 1,
            plannedTasks: 1,
            executableTasks: 1,
            humanRequiredTasks: 0,
            notExecutableTasks: 0,
          },
          tasks: [
            {
              taskId: 'path-proof:function:opaque-path',
              pathId: 'opaque-path',
              capabilityId: null,
              flowId: null,
              mode: 'function',
              status: 'planned',
              executed: false,
              coverageCountsAsObserved: false,
              autonomousExecutionAllowed: true,
              command: 'node scripts/pulse/run.js --guidance # validate opaque-path',
              reason: 'Path has no observed proof.',
              sourceStatus: 'inferred_only',
              risk: 'high',
              entrypoint: {
                nodeId: 'node:opaque-path',
                filePath: 'scripts/pulse/opaque-path.ts',
                routePattern: null,
                description: 'opaque machine path',
              },
              breakpoint: {
                stage: 'entrypoint',
                stepIndex: 0,
                filePath: 'scripts/pulse/opaque-path.ts',
                nodeId: 'node:opaque-path',
                routePattern: null,
                reason: 'Runtime evidence is absent.',
                recovery: 'Run the generated proof command.',
              },
              expectedEvidence: [
                { kind: 'runtime', required: true, reason: 'Runtime proof is required.' },
              ],
              artifactLinks: [
                {
                  artifactPath: '.pulse/current/PULSE_PATH_PROOF_TASKS.json',
                  relationship: 'proof_task_plan',
                },
              ],
            },
          ],
        }),
      );
      writeFileSync(
        join(rootDir, '.pulse', 'current', 'PULSE_PATH_COVERAGE.json'),
        JSON.stringify({
          generatedAt: '2026-04-29T21:55:00.000Z',
          summary: {
            totalPaths: 2,
            observedPass: 1,
            observedFail: 0,
            testGenerated: 1,
            probeBlueprintGenerated: 1,
            inferredOnly: 1,
            criticalInferredOnly: 1,
            criticalUnobserved: 1,
            criticalBlueprintReady: 1,
            criticalTerminalReasoned: 0,
            criticalInferredGap: 0,
            coveragePercent: 50,
          },
          paths: [],
        }),
      );

      process.chdir(rootDir);
      const surface = buildPathProofSurfaceForDirective(
        makeReadiness(
          [
            {
              id: 'critical_path_terminal',
              status: 'fail',
              reason: 'One path still needs proof.',
              evidence: {},
            },
          ],
          'NOT_READY',
        ),
      );

      expect(surface.counts).toMatchObject({
        plannedTasks: 1,
        executableUnprovedTasks: 1,
        criticalUnobservedPaths: 1,
        criticalBlueprintReady: 1,
        coveragePercent: 50,
      });
      expect(surface.executionMode).toBe('ai_safe');
      expect(surface.topExecutableUnprovedTasks[0]).toMatchObject({
        pathId: 'opaque-path',
        validationCommand: 'node scripts/pulse/run.js --guidance # validate opaque-path',
      });
    } finally {
      process.chdir(previousCwd);
      rmSync(rootDir, { recursive: true, force: true });
    }
  });
});

describe('buildPulseCertificationProofDebtNextWork', () => {
  it('maps failed proof gates from artifact-registry evidence, not fixed product files', () => {
    const failingGate: PulseGateResult = {
      status: 'fail',
      reason: 'Evidence is missing.',
      failureClass: 'missing_evidence',
      evidenceMode: 'inferred',
      confidence: 'medium',
    };
    const gates: Partial<Record<PulseGateName, PulseGateResult>> = {
      performancePass: failingGate,
      observabilityPass: failingGate,
      customerPass: failingGate,
      soakPass: failingGate,
      truthExtractionPass: failingGate,
      staticPass: {
        status: 'fail',
        reason: 'Product Codacy blockers remain.',
        failureClass: 'product_failure',
      },
    };

    const work = buildPulseCertificationProofDebtNextWork({
      gates,
    });

    expect(work.map((unit) => unit.gateNames)).toEqual([
      ['performancePass'],
      ['observabilityPass'],
      ['customerPass'],
      ['soakPass'],
      ['truthExtractionPass'],
    ]);
    expect(work.every((unit) => unit.kind === 'pulse_machine')).toBe(true);
    expect(work.every((unit) => unit.source === 'pulse_machine')).toBe(true);
    expect(work.some((unit) => unit.proofAuthority === 'artifact_registry')).toBe(true);
    expect(work.every((unit) => Array.isArray(unit.proofBasis))).toBe(true);
    expect(work.flatMap((unit) => unit.validationArtifacts ?? [])).toEqual(
      expect.arrayContaining(['PULSE_OBSERVABILITY_COVERAGE.json', 'PULSE_CODEBASE_TRUTH.json']),
    );
    expect(
      collectRelatedFiles(work).every((filePath) => filePath.startsWith('scripts/pulse/')),
    ).toBe(true);
    expect(work[0].forbiddenActions).toContain('Do not edit SaaS product code for this unit');
  });

  it('marks registry misses as registry gaps instead of choosing fixed fallback files', () => {
    const work = buildPulseCertificationProofDebtNextWork({
      gates: {
        noOverclaimPass: {
          status: 'fail',
          reason: 'No-overclaim proof is missing.',
          failureClass: 'missing_evidence',
        },
      },
    });

    expect(work).toHaveLength(1);
    expect(work[0]).toMatchObject({
      gateNames: ['noOverclaimPass'],
      proofAuthority: 'registry_gap',
    });
    expect(work[0].proofBasis).toEqual([
      expect.stringContaining('registry gap: no artifact producer/consumer/freshness evidence'),
    ]);
    expect(work[0].relatedFiles).toEqual([]);
  });

  it('does not convert product-failure gates into machine proof work', () => {
    const work = buildPulseCertificationProofDebtNextWork({
      gates: {
        securityPass: {
          status: 'fail',
          reason: 'Product security findings remain in backend files.',
          failureClass: 'product_failure',
        },
        staticPass: {
          status: 'fail',
          reason: 'Codacy HIGH findings remain.',
          failureClass: 'product_failure',
        },
      },
    });

    expect(work).toHaveLength(0);
  });
});

describe('buildPulseAutonomyProofDebtNextWork', () => {
  it('emits machine-owned proof work when production autonomy or zero-prompt guidance is NAO', () => {
    const work = buildPulseAutonomyProofDebtNextWork({
      productionAutonomyReason: 'NAO: certification status is PARTIAL.',
      zeroPromptProductionGuidanceReason: 'NAO: cycle proof is incomplete.',
      verdicts: {
        nextStepAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'NAO',
        productionAutonomy: 'NAO',
        canWorkNow: true,
        canContinueUntilReady: false,
        canDeclareComplete: false,
      },
    });

    expect(work.map((unit) => unit.id)).toEqual([
      'pulse-proof-productionAutonomy',
      'pulse-proof-zeroPromptProductionGuidance',
    ]);
    expect(work.every((unit) => unit.kind === 'pulse_machine')).toBe(true);
    expect(work.every((unit) => unit.source === 'pulse_machine')).toBe(true);
    expect(
      collectRelatedFiles(work).every((filePath) => filePath.startsWith('scripts/pulse/')),
    ).toBe(true);
    expect(work.every((unit) => Array.isArray(unit.proofBasis))).toBe(true);
    expect(work[0].forbiddenActions).toContain('Do not edit SaaS product code for this unit');
  });
});

describe('proof-readiness directive claims', () => {
  it('summarizes proof-readiness debt for the directive no-overclaim surface', () => {
    const summary = buildProofReadinessSummaryForDirective({
      summary: {
        canAdvance: false,
        status: 'executable_unproved',
        plannedEvidence: 1,
        inferredEvidence: 2,
        notAvailableEvidence: 3,
        nonObservedEvidence: 4,
        executableUnproved: 5,
        plannedOrUnexecutedEvidence: 6,
      },
    });

    expect(summary).toMatchObject({
      canAdvance: false,
      status: 'executable_unproved',
      plannedEvidence: 1,
      inferredEvidence: 2,
      notAvailableEvidence: 3,
      nonObservedEvidence: 4,
      executableUnproved: 5,
      plannedOrUnexecutedEvidence: 6,
    });
  });

  it('blocks production autonomy and canDeclareComplete when proof is planned or inferred', () => {
    const autonomyReadiness = buildProofReadinessCompatibleAutonomyReadiness();
    const autonomyProof = {
      productionAutonomyAnswer: 'SIM',
      productionAutonomyReason: 'SIM: certified.',
      zeroPromptProductionGuidanceReason: 'SIM: guidance closed.',
      verdicts: {
        nextStepAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'SIM',
        productionAutonomy: 'SIM',
        canWorkNow: false,
        canContinueUntilReady: true,
        canDeclareComplete: true,
      },
    } as Parameters<typeof applyProofReadinessToAutonomyClaims>[1];

    const claims = applyProofReadinessToAutonomyClaims(autonomyReadiness, autonomyProof, {
      canAdvance: false,
      status: 'executable_unproved',
      plannedEvidence: 1,
      inferredEvidence: 1,
      notAvailableEvidence: 1,
      nonObservedEvidence: 3,
      executableUnproved: 1,
      plannedOrUnexecutedEvidence: 1,
      blockedHumanRequired: 0,
      blockedNotExecutable: 0,
    });

    expect(claims.productionAutonomyVerdict).toBe('NAO');
    expect(claims.canDeclareComplete).toBe(false);
    expect(claims.autonomyReadiness.canDeclareComplete).toBe(false);
    expect(claims.autonomyProof.verdicts).toMatchObject({
      productionAutonomy: 'NAO',
      canDeclareComplete: false,
    });
    expect(claims.autonomyProof.proofReadiness).toMatchObject({
      plannedEvidence: 1,
      inferredEvidence: 1,
      notAvailableEvidence: 1,
    });
    expect(claims.productionAutonomyReason).toContain('proofReadiness status=executable_unproved');
    expect(claims.productionAutonomyReason).toContain('planned=1');
    expect(claims.productionAutonomyReason).toContain('inferred=1');
    expect(claims.productionAutonomyReason).toContain('not_available=1');
  });

  it('keeps proof-readiness blocked production claims in PULSE proof next work', () => {
    const autonomyReadiness = buildProofReadinessCompatibleAutonomyReadiness();
    const autonomyProof = {
      productionAutonomyAnswer: 'SIM',
      productionAutonomyReason: 'SIM: certified.',
      zeroPromptProductionGuidanceReason: 'SIM: guidance closed.',
      verdicts: {
        nextStepAutonomy: 'SIM',
        zeroPromptProductionGuidance: 'SIM',
        productionAutonomy: 'SIM',
        canWorkNow: false,
        canContinueUntilReady: true,
        canDeclareComplete: true,
      },
    } as Parameters<typeof applyProofReadinessToAutonomyClaims>[1];

    const claims = applyProofReadinessToAutonomyClaims(autonomyReadiness, autonomyProof, {
      canAdvance: false,
      status: 'executable_unproved',
      plannedEvidence: 1,
      inferredEvidence: 1,
      notAvailableEvidence: 1,
      nonObservedEvidence: 3,
      executableUnproved: 1,
      plannedOrUnexecutedEvidence: 1,
      blockedHumanRequired: 0,
      blockedNotExecutable: 0,
    });

    const work = buildPulseAutonomyProofDebtNextWork(claims.autonomyProof);

    expect(work.map((unit) => unit.id)).toContain('pulse-proof-productionAutonomy');
    expect(work.every((unit) => unit.kind === 'pulse_machine')).toBe(true);
    expect(work[0].summary).toContain('proofReadiness status=executable_unproved');
  });
});

function buildProofReadinessCompatibleAutonomyReadiness() {
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
