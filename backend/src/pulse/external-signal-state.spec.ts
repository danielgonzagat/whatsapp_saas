import { spawnSync } from 'child_process';
import * as path from 'path';

interface ExternalSignalFixtureResult {
  readonly totalSignals: number;
  readonly runtimeSignals: number;
  readonly changeSignals: number;
  readonly sentrySignal: {
    readonly capabilityIds: readonly string[];
    readonly flowIds: readonly string[];
    readonly executionMode: string;
    readonly recentChangeRefsLength: number;
  };
  readonly firstPlanQueueItem: {
    readonly source: string;
    readonly kind: string;
  };
}

function runExternalSignalFixture(): ExternalSignalFixtureResult {
  const repoRoot = path.resolve(__dirname, '../../..');
  const script = String.raw`
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const repoRoot = process.cwd();
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (
    request === './external-signals/snapshot-config' &&
    parent &&
    parent.filename.includes(path.join('scripts', 'pulse'))
  ) {
    return { PULSE_EXTERNAL_INPUT_FILES: ['PULSE_CODACY_STATE.json'] };
  }
  return originalLoad.apply(this, arguments);
};

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { buildConvergencePlan } = require(path.join(repoRoot, 'scripts/pulse/convergence-plan.ts'));
const { buildExternalSignalState } = require(path.join(repoRoot, 'scripts/pulse/external-signals.ts'));

function writeJsonSnapshot(rootDir, snapshot, value) {
  const fileName = snapshot === 'github' ? 'PULSE_GITHUB_STATE.json' : 'PULSE_SENTRY_STATE.json';
  fs.writeFileSync(path.join(rootDir, fileName), JSON.stringify(value, null, 2));
}

function createScopeState(rootDir) {
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
      inventoryCoverage: 100,
      classificationCoverage: 100,
      structuralGraphCoverage: 100,
      testCoverage: 0,
      scenarioCoverage: 0,
      runtimeEvidenceCoverage: 0,
      productionProofCoverage: 0,
      orphanFiles: [],
      unknownFiles: [],
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
      severityCounts: { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
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
    excludedFiles: [],
    scopeSource: 'repo_filesystem',
    manifestBoundary: false,
    manifestRole: 'semantic_overlay',
  };
}

function createCapabilityState() {
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

function createFlowProjection() {
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

function createCodacyEvidence() {
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

async function main() {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-external-'));
  try {
    writeJsonSnapshot(rootDir, 'github', {
      commits: [
        {
          sha: 'abc123',
          message: 'touch checkout path',
          files: ['backend/src/payments/service.ts'],
          committedAt: '2026-04-22T12:00:00.000Z',
        },
      ],
    });
    writeJsonSnapshot(rootDir, 'sentry', {
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

    const scopeState = createScopeState(rootDir);
    const capabilityState = createCapabilityState();
    const flowProjection = createFlowProjection();
    const externalSignalState = buildExternalSignalState({
      rootDir,
      scopeState,
      codacyEvidence: createCodacyEvidence(),
      capabilityState,
      flowProjection,
    });
    const sentrySignal = externalSignalState.signals.find((signal) => signal.source === 'sentry');

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
    };
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
    };
    const plan = buildConvergencePlan({
      health: { breaks: [] },
      resolvedManifest,
      scopeState,
      certification,
      capabilityState,
      flowProjection,
      parityGaps: { summary: { totalGaps: 0, criticalGaps: 0, highGaps: 0, byKind: {} }, gaps: [] },
      externalSignalState,
    });

    process.stdout.write(
      JSON.stringify({
        totalSignals: externalSignalState.summary.totalSignals,
        runtimeSignals: externalSignalState.summary.runtimeSignals,
        changeSignals: externalSignalState.summary.changeSignals,
        sentrySignal: {
          capabilityIds: sentrySignal.capabilityIds,
          flowIds: sentrySignal.flowIds,
          executionMode: sentrySignal.executionMode,
          recentChangeRefsLength: sentrySignal.recentChangeRefs.length,
        },
        firstPlanQueueItem: {
          source: plan.queue[0].source,
          kind: plan.queue[0].kind,
        },
      }),
    );
  } finally {
    fs.rmSync(rootDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

  const result = spawnSync(process.execPath, ['--max-old-space-size=8192', '-e', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test' },
    maxBuffer: 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(`external signal fixture failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  return JSON.parse(result.stdout) as ExternalSignalFixtureResult;
}

describe('buildExternalSignalState', () => {
  const fixture = runExternalSignalFixture();

  it('normalizes snapshot-first signals and maps them to capabilities and flows', () => {
    expect(fixture.totalSignals).toBeGreaterThanOrEqual(2);
    expect(fixture.runtimeSignals).toBeGreaterThanOrEqual(1);
    expect(fixture.changeSignals).toBeGreaterThanOrEqual(1);
    expect(fixture.sentrySignal).toMatchObject({
      capabilityIds: ['payments-checkout'],
      flowIds: ['checkout-flow'],
      executionMode: 'ai_safe',
    });
    expect(fixture.sentrySignal.recentChangeRefsLength).toBeGreaterThan(0);
  });

  it('pushes observed runtime signals to the top of the convergence queue', () => {
    expect(fixture.firstPlanQueueItem).toMatchObject({
      source: 'external',
      kind: 'runtime',
    });
  });
});
