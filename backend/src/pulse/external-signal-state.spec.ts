import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildConvergencePlan } from '../../../scripts/pulse/convergence-plan';
import { buildExternalSignalState } from '../../../scripts/pulse/external-signals';
import type {
  PulseCapabilityState,
  PulseCertification,
  PulseCodacyEvidence,
  PulseExternalSignalState,
  PulseFlowProjection,
  PulseResolvedManifest,
  PulseScopeState,
} from '../../../scripts/pulse/types';

function safeFixturePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const tmpRoot = path.resolve(os.tmpdir());
  const boundary = tmpRoot + path.sep;
  if (resolved !== tmpRoot && !resolved.startsWith(boundary)) {
    throw new Error(`Refusing fixture write outside ${tmpRoot}: ${resolved}`);
  }
  return resolved;
}

function writeJson(filePath: string, value: unknown) {
  const safePath = safeFixturePath(filePath);
  fs.mkdirSync(path.dirname(safePath), { recursive: true });
  fs.writeFileSync(safePath, JSON.stringify(value, null, 2));
}

function createScopeState(rootDir: string): PulseScopeState {
  return {
    generatedAt: new Date().toISOString(),
    rootDir,
    summary: {
      totalFiles: 2,
      totalLines: 40,
      runtimeCriticalFiles: 1,
      userFacingFiles: 1,
      humanRequiredFiles: 0,
      surfaceCounts: {
        frontend: 0,
        'frontend-admin': 0,
        backend: 1,
        worker: 0,
        prisma: 0,
        e2e: 0,
        scripts: 0,
        docs: 0,
        infra: 0,
        governance: 0,
        'root-config': 0,
        artifacts: 0,
        misc: 1,
      },
      kindCounts: {
        source: 1,
        spec: 0,
        migration: 0,
        config: 1,
        document: 0,
        artifact: 0,
      },
      unmappedModuleCandidates: [],
    },
    parity: {
      status: 'pass',
      mode: 'repo_inventory_with_codacy_spotcheck',
      confidence: 'high',
      reason: 'All observed files are classified.',
      inventoryFiles: 2,
      codacyObservedFiles: 0,
      codacyObservedFilesCovered: 0,
      missingCodacyFiles: [],
    },
    codacy: {
      snapshotAvailable: false,
      sourcePath: null,
      syncedAt: null,
      ageMinutes: null,
      stale: false,
      loc: 40,
      totalIssues: 0,
      severityCounts: {
        HIGH: 0,
        MEDIUM: 0,
        LOW: 0,
        UNKNOWN: 0,
      },
      toolCounts: {},
      topFiles: [],
      highPriorityBatch: [],
      observedFiles: [],
    },
    files: [
      {
        path: 'backend/src/payments/service.ts',
        extension: '.ts',
        lineCount: 25,
        surface: 'backend',
        kind: 'source',
        runtimeCritical: true,
        userFacing: true,
        ownerLane: 'customer',
        executionMode: 'ai_safe',
        protectedByGovernance: false,
        codacyTracked: false,
        moduleCandidate: 'payments',
        observedCodacyIssueCount: 0,
        highSeverityIssueCount: 0,
        highestObservedSeverity: null,
        structuralHints: ['orchestration', 'side_effect'],
      },
      {
        path: 'README.md',
        extension: '.md',
        lineCount: 15,
        surface: 'misc',
        kind: 'config',
        runtimeCritical: false,
        userFacing: false,
        ownerLane: 'platform',
        executionMode: 'observation_only',
        protectedByGovernance: false,
        codacyTracked: false,
        moduleCandidate: null,
        observedCodacyIssueCount: 0,
        highSeverityIssueCount: 0,
        highestObservedSeverity: null,
      },
    ],
    moduleAggregates: [],
  };
}

function createCapabilityState(): PulseCapabilityState {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalCapabilities: 1,
      realCapabilities: 0,
      partialCapabilities: 1,
      latentCapabilities: 0,
      phantomCapabilities: 0,
      humanRequiredCapabilities: 0,
      foundationalCapabilities: 0,
      connectedCapabilities: 1,
      operationalCapabilities: 0,
      productionReadyCapabilities: 0,
      runtimeObservedCapabilities: 1,
      scenarioCoveredCapabilities: 0,
    },
    capabilities: [
      {
        id: 'payments-checkout',
        name: 'Payments Checkout',
        truthMode: 'observed',
        status: 'partial',
        confidence: 0.82,
        userFacing: true,
        runtimeCritical: true,
        protectedByGovernance: false,
        ownerLane: 'customer',
        executionMode: 'ai_safe',
        rolesPresent: ['interface', 'orchestration', 'persistence'],
        missingRoles: ['side_effect'],
        filePaths: ['backend/src/payments/service.ts'],
        nodeIds: ['service:payments'],
        routePatterns: ['/checkout'],
        evidenceSources: ['routes', 'services'],
        codacyIssueCount: 0,
        highSeverityIssueCount: 0,
        blockingReasons: ['Checkout still lacks stable runtime confirmation.'],
        validationTargets: ['PULSE_CAPABILITY_STATE.json'],
        maturity: {
          stage: 'connected',
          score: 0.6,
          dimensions: {
            interfacePresent: true,
            apiSurfacePresent: true,
            orchestrationPresent: true,
            persistencePresent: true,
            sideEffectPresent: false,
            runtimeEvidencePresent: true,
            validationPresent: false,
            scenarioCoveragePresent: false,
            codacyHealthy: true,
            simulationOnly: false,
          },
          missing: ['sideEffectPresent', 'validationPresent', 'scenarioCoveragePresent'],
        },
        dod: {
          status: 'partial',
          missingRoles: ['side_effect'],
          blockers: ['Checkout still lacks stable runtime confirmation.'],
          truthModeMet: true,
        },
      },
    ],
  };
}

function createFlowProjection(): PulseFlowProjection {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      totalFlows: 1,
      realFlows: 0,
      partialFlows: 1,
      latentFlows: 0,
      phantomFlows: 0,
    },
    flows: [
      {
        id: 'checkout-flow',
        name: 'Checkout Flow',
        truthMode: 'observed',
        status: 'partial',
        confidence: 0.75,
        startNodeIds: ['ui:checkout'],
        endNodeIds: ['service:payments'],
        routePatterns: ['/checkout'],
        capabilityIds: ['payments-checkout'],
        rolesPresent: ['interface', 'orchestration', 'persistence'],
        missingLinks: ['side_effect'],
        distanceToReal: 1,
        evidenceSources: ['routes'],
        blockingReasons: ['Checkout has not closed its live runtime loop yet.'],
        validationTargets: ['PULSE_FLOW_PROJECTION.json'],
        dod: {
          status: 'partial',
          missingRoles: ['side_effect'],
          blockers: ['Checkout has not closed its live runtime loop yet.'],
          truthModeMet: true,
        },
      },
    ],
  };
}

function createCodacyEvidence(): PulseCodacyEvidence {
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      snapshotAvailable: false,
      stale: false,
      totalIssues: 0,
      highIssues: 0,
      runtimeCriticalHotspots: 0,
      userFacingHotspots: 0,
      humanRequiredHotspots: 0,
    },
    hotspots: [],
  };
}

describe('buildExternalSignalState', () => {
  let rootDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-external-'));
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('normalizes snapshot-first signals and maps them to capabilities and flows', () => {
    writeJson(path.join(rootDir, 'PULSE_GITHUB_STATE.json'), {
      commits: [
        {
          sha: 'abc123',
          message: 'touch checkout path',
          files: ['backend/src/payments/service.ts'],
          committedAt: '2026-04-22T12:00:00.000Z',
        },
      ],
    });
    writeJson(path.join(rootDir, 'PULSE_SENTRY_STATE.json'), {
      issues: [
        {
          id: 'issue-1',
          title: 'Checkout runtime error',
          files: ['backend/src/payments/service.ts'],
          routes: ['/checkout'],
          count: 6,
          lastSeen: '2026-04-22T12:10:00.000Z',
        },
      ],
    });

    const state = buildExternalSignalState({
      rootDir,
      scopeState: createScopeState(rootDir),
      codacyEvidence: createCodacyEvidence(),
      capabilityState: createCapabilityState(),
      flowProjection: createFlowProjection(),
    });

    expect(state.summary.totalSignals).toBeGreaterThanOrEqual(2);
    expect(state.summary.runtimeSignals).toBeGreaterThanOrEqual(1);
    expect(state.summary.changeSignals).toBeGreaterThanOrEqual(1);

    const sentrySignal = state.signals.find((signal) => signal.source === 'sentry');
    expect(sentrySignal).toMatchObject({
      capabilityIds: ['payments-checkout'],
      flowIds: ['checkout-flow'],
      executionMode: 'ai_safe',
    });
    expect(sentrySignal?.recentChangeRefs.length).toBeGreaterThan(0);
  });

  it('pushes observed runtime signals to the top of the convergence queue', () => {
    writeJson(path.join(rootDir, 'PULSE_GITHUB_STATE.json'), {
      commits: [
        {
          sha: 'abc123',
          message: 'touch checkout path',
          files: ['backend/src/payments/service.ts'],
          committedAt: '2026-04-22T12:00:00.000Z',
        },
      ],
    });
    writeJson(path.join(rootDir, 'PULSE_SENTRY_STATE.json'), {
      issues: [
        {
          id: 'issue-1',
          title: 'Checkout runtime error',
          files: ['backend/src/payments/service.ts'],
          routes: ['/checkout'],
          count: 8,
          lastSeen: '2026-04-22T12:10:00.000Z',
        },
      ],
    });

    const externalSignalState: PulseExternalSignalState = buildExternalSignalState({
      rootDir,
      scopeState: createScopeState(rootDir),
      codacyEvidence: createCodacyEvidence(),
      capabilityState: createCapabilityState(),
      flowProjection: createFlowProjection(),
    });

    const certification = {
      timestamp: new Date().toISOString(),
      commitSha: 'test',
      status: 'NOT_CERTIFIED',
      humanReplacementStatus: 'NOT_READY',
      blockingTier: 0,
      gates: {
        securityPass: { status: 'pass', reason: 'ok' },
        staticPass: { status: 'pass', reason: 'ok' },
      },
      gateEvidence: {},
      evidenceSummary: {
        runtime: { probes: [] },
        flows: { results: [] },
        customer: { results: [] },
        operator: { results: [] },
        admin: { results: [] },
        soak: { results: [] },
        worldState: { asyncExpectationsStatus: [] },
      },
    } as never as PulseCertification;
    const resolvedManifest = {
      scenarioSpecs: [],
      flowSpecs: [],
      summary: {
        totalModules: 0,
        resolvedModules: 0,
        unresolvedModules: 0,
        scopeOnlyModuleCandidates: 0,
        humanRequiredModules: 0,
        totalFlowGroups: 0,
        resolvedFlowGroups: 0,
        unresolvedFlowGroups: 0,
        orphanManualModules: 0,
        orphanFlowSpecs: 0,
        excludedModules: 0,
        excludedFlowGroups: 0,
        groupedFlowGroups: 0,
        sharedCapabilityGroups: 0,
        opsInternalFlowGroups: 0,
        legacyNoiseFlowGroups: 0,
        legacyManualModules: 0,
      },
      diagnostics: {
        unresolvedModules: [],
        orphanManualModules: [],
        scopeOnlyModuleCandidates: [],
        humanRequiredModules: [],
        unresolvedFlowGroups: [],
        orphanFlowSpecs: [],
        excludedModules: [],
        excludedFlowGroups: [],
        legacyManualModules: [],
        groupedFlowGroups: [],
        sharedCapabilityGroups: [],
        opsInternalFlowGroups: [],
        legacyNoiseFlowGroups: [],
        blockerCount: 0,
        warningCount: 0,
      },
      temporaryAcceptances: [],
    } as never as PulseResolvedManifest;

    const plan = buildConvergencePlan({
      health: { breaks: [] } as { breaks: [] },
      resolvedManifest,
      scopeState: createScopeState(rootDir),
      certification,
      capabilityState: createCapabilityState(),
      flowProjection: createFlowProjection(),
      parityGaps: {
        summary: { totalGaps: 0, criticalGaps: 0, highGaps: 0, byKind: {} },
        gaps: [],
      } as never,
      externalSignalState,
    });

    expect(plan.queue[0]).toMatchObject({
      source: 'external',
      kind: 'runtime',
    });
  });
});
