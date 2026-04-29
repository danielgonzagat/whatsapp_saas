import { describe, expect, it } from 'vitest';
import {
  buildAutonomyProof,
  deriveAuthorityState,
  type AuthorityState,
} from '../artifacts.autonomy';
import type { PulseArtifactSnapshot } from '../artifacts.types';
import type { PulseAutonomyState, PulseConvergencePlan } from '../types';

const PASS_GATE = { status: 'pass', reason: 'pass', confidence: 'high' } as const;
const FAIL_GATE = { status: 'fail', reason: 'fail', confidence: 'high' } as const;

function makeSnapshot(
  overrides: {
    productionDecisionPass?: boolean;
    certificationStatus?: 'CERTIFIED' | 'PARTIAL' | 'NOT_CERTIFIED';
    replacementReady?: boolean;
    structuralDebtClosed?: boolean;
    externalAdaptersClosed?: boolean;
  } = {},
): PulseArtifactSnapshot {
  const structuralDebtClosed = overrides.structuralDebtClosed ?? false;
  const externalAdaptersClosed = overrides.externalAdaptersClosed ?? true;
  const gate = (passed: boolean) => (passed ? PASS_GATE : FAIL_GATE);
  return {
    certification: {
      timestamp: '2026-04-29T21:00:00.000Z',
      status: overrides.certificationStatus ?? 'PARTIAL',
      humanReplacementStatus: overrides.replacementReady ? 'READY' : 'NOT_READY',
      blockingTier: 3,
      certificationTarget: { tier: null, final: false, profile: 'pulse-core-final' },
      gates: {
        evidenceFresh: PASS_GATE,
        pulseSelfTrustPass: PASS_GATE,
        runtimePass: PASS_GATE,
        productionDecisionPass: gate(overrides.productionDecisionPass ?? false),
      },
      dynamicBlockingReasons: [],
    },
    externalSignalState: {
      summary: {
        missingAdapters: externalAdaptersClosed ? 0 : 1,
        staleAdapters: 0,
        invalidAdapters: 0,
        highImpactSignals: 0,
        totalSignals: 1,
      },
      signals: [],
      adapters: [
        {
          source: 'runtime',
          status: externalAdaptersClosed ? 'ready' : 'not_available',
          executed: externalAdaptersClosed,
          signals: [],
          reason: externalAdaptersClosed ? 'ready' : 'missing',
        },
      ],
    },
    parityGaps: { summary: { totalGaps: structuralDebtClosed ? 0 : 3 } },
    codacyEvidence: { summary: { highIssues: structuralDebtClosed ? 0 : 2 } },
    capabilityState: { summary: { phantomCapabilities: structuralDebtClosed ? 0 : 1 } },
    flowProjection: { summary: { phantomFlows: structuralDebtClosed ? 0 : 1 } },
  } as unknown as PulseArtifactSnapshot;
}

function makePlan(humanRequiredUnits = 0): PulseConvergencePlan {
  return {
    generatedAt: '2026-04-29T21:00:00.000Z',
    commitSha: 'test',
    status: 'PARTIAL',
    humanReplacementStatus: 'NOT_READY',
    blockingTier: 1,
    summary: {
      totalUnits: 1,
      scenarioUnits: 1,
      securityUnits: 0,
      staticUnits: 0,
      runtimeUnits: 0,
      changeUnits: 0,
      dependencyUnits: 0,
      scopeUnits: 0,
      gateUnits: 0,
      humanRequiredUnits,
      observationOnlyUnits: humanRequiredUnits,
      priorities: { P0: 1, P1: 0, P2: 0, P3: 0 },
      failingGates: [],
      pendingAsyncExpectations: [],
    },
    queue: [
      {
        id: 'unit-ai-safe',
        order: 1,
        priority: 'P0',
        kind: 'scenario',
        status: 'open',
        source: 'pulse',
        executionMode: 'ai_safe',
        ownerLane: 'reliability',
        riskLevel: 'low',
        evidenceMode: 'observed',
        confidence: 'high',
        productImpact: 'diagnostic',
        title: 'Validate continuous loop authority',
        summary: 'Exercise the authority and no-overclaim contract.',
        visionDelta: 'continuous authority evidence',
        targetState: 'bounded autonomous cycle validated',
        failureClass: 'missing_evidence',
        actorKinds: [],
        gateNames: [],
        scenarioIds: [],
        moduleKeys: [],
        routePatterns: [],
        flowIds: [],
        affectedCapabilityIds: [],
        affectedFlowIds: [],
        asyncExpectations: [],
        breakTypes: [],
        artifactPaths: [],
        relatedFiles: ['scripts/pulse/artifacts.autonomy.ts'],
        validationArtifacts: ['scripts/pulse/__tests__/autonomy-authority-verdicts.spec.ts'],
        exitCriteria: ['targeted vitest passes'],
      },
    ],
  };
}

function makeCycle(iteration: number): PulseAutonomyState['history'][number] {
  return {
    iteration,
    plannerMode: 'deterministic',
    status: 'validated',
    startedAt: '2026-04-29T21:00:00.000Z',
    finishedAt: '2026-04-29T21:01:00.000Z',
    summary: 'validated',
    unit: null,
    directiveDigestBefore: null,
    directiveDigestAfter: null,
    directiveBefore: {
      certificationStatus: 'PARTIAL',
      blockingTier: 3,
      score: 77,
      visionGap: null,
    },
    directiveAfter: { certificationStatus: 'PARTIAL', blockingTier: 3, score: 77, visionGap: null },
    codex: { executed: true, command: 'codex', exitCode: 0, finalMessage: 'done' },
    validation: {
      executed: true,
      commands: [{ command: 'vitest --run', exitCode: 0, durationMs: 1, summary: 'pass' }],
    },
  };
}

function makeAutonomyHistory(cycles: number): PulseAutonomyState {
  return {
    generatedAt: '2026-04-29T21:00:00.000Z',
    status: 'idle',
    orchestrationMode: 'single',
    riskProfile: 'balanced',
    plannerMode: 'deterministic',
    continuous: true,
    maxIterations: cycles,
    completedIterations: cycles,
    parallelAgents: 1,
    maxWorkerRetries: 0,
    plannerModel: null,
    codexModel: null,
    guidanceGeneratedAt: null,
    currentCheckpoint: null,
    targetCheckpoint: null,
    visionGap: null,
    stopReason: null,
    nextActionableUnit: null,
    governedSandboxUnits: 0,
    escalatedValidationUnits: 0,
    observationOnlyUnits: 0,
    runner: {
      agentsSdkAvailable: false,
      agentsSdkVersion: null,
      openAiApiKeyConfigured: false,
      codexCliAvailable: true,
    },
    history: Array.from({ length: cycles }, (_, index) => makeCycle(index + 1)),
  };
}

describe('autonomy authority verdict separation', () => {
  it('keeps bounded authority when core gates and a validatable ai_safe unit exist', () => {
    const authority = deriveAuthorityState(makeSnapshot(), makePlan());

    expect(authority.mode).toBe('autonomous-execution');
    expect(authority.advisoryOnly).toBe(false);
    expect(authority.automationEligible).toBe(true);
    expect(authority.reasons.join('\n')).toContain('validatable ai_safe unit');
  });

  it('distinguishes work-now, continue-until-ready, and declare-complete verdicts', () => {
    const snapshot = makeSnapshot({ structuralDebtClosed: false });
    const plan = makePlan();
    const authority: AuthorityState = deriveAuthorityState(snapshot, plan);
    const proof = buildAutonomyProof(snapshot, plan, authority, plan.queue, makeAutonomyHistory(3));

    expect(proof.verdicts.canWorkNow).toBe(true);
    expect(proof.verdicts.canContinueUntilReady).toBe(true);
    expect(proof.verdicts.canDeclareComplete).toBe(false);
    expect(proof.verdicts.productionAutonomy).toBe('NAO');
    expect(proof.verdicts.zeroPromptProductionGuidance).toBe('SIM');
  });

  it('blocks continuous zero-prompt guidance on governed validation gaps without legacy output terms', () => {
    const snapshot = makeSnapshot({ structuralDebtClosed: true });
    const plan = makePlan(1);
    const authority = deriveAuthorityState(snapshot, plan);
    const proof = buildAutonomyProof(snapshot, plan, authority, plan.queue, makeAutonomyHistory(3));
    const serialized = JSON.stringify(proof);

    expect(proof.verdicts.canWorkNow).toBe(true);
    expect(proof.verdicts.canContinueUntilReady).toBe(false);
    expect(proof.verdicts.zeroPromptProductionGuidance).toBe('NAO');
    expect(serialized).toContain('governed validation');
    expect(serialized).not.toMatch(/human_required|humanRequired|human approval|ask a human/i);
  });
});
