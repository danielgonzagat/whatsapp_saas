import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { computeCertification } from '../certification';
import {
  PATH_PROOF_EVIDENCE_ARTIFACT,
  PATH_PROOF_TASKS_ARTIFACT,
  mergePathProofRunnerResults,
} from '../path-proof-evidence';
import type { PathProofPlan, PathProofTask } from '../path-proof-runner';

type CertificationInput = Parameters<typeof computeCertification>[0];

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-cert-proof-readiness-'));
  tempRoots.push(rootDir);
  return rootDir;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const rootDir = tempRoots.pop();
    if (rootDir) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

function writeProofReadinessSummary(rootDir: string, summary: Record<string, unknown>): void {
  const artifactPath = path.join(rootDir, '.pulse/current/PULSE_PROOF_READINESS.json');
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(
    artifactPath,
    `${JSON.stringify(
      {
        artifact: 'PULSE_PROOF_READINESS',
        artifactVersion: 1,
        generatedAt: '2026-04-29T23:00:00.000Z',
        summary,
        readinessGate: { canAdvance: summary.canAdvance, status: summary.status },
      },
      null,
      2,
    )}\n`,
  );
}

function writeJson(rootDir: string, relativePath: string, payload: unknown): void {
  const artifactPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function makePathProofTask(): PathProofTask {
  return {
    taskId: 'path-proof:endpoint:checkout',
    pathId: 'matrix:path:checkout',
    capabilityId: 'checkout',
    flowId: 'checkout-flow',
    mode: 'endpoint',
    status: 'planned',
    executed: false,
    coverageCountsAsObserved: false,
    autonomousExecutionAllowed: true,
    command: 'npx vitest run scripts/pulse/__tests__/checkout.spec.ts',
    reason: 'Critical checkout path requires observed command proof.',
    sourceStatus: 'inferred_only',
    risk: 'critical',
    entrypoint: {
      nodeId: 'checkout-controller',
      filePath: 'backend/src/checkout/checkout-public.controller.ts',
      routePattern: '/checkout/:slug',
      description: 'checkout endpoint',
    },
    breakpoint: {
      stage: 'entrypoint',
      stepIndex: 0,
      filePath: 'backend/src/checkout/checkout-public.controller.ts',
      nodeId: 'checkout-controller',
      routePattern: '/checkout/:slug',
      reason: 'No runtime evidence was observed.',
      recovery: 'Run the path proof command.',
    },
    expectedEvidence: [
      {
        kind: 'runtime',
        required: true,
        reason: 'Runtime command must pass or fail honestly.',
      },
    ],
    artifactLinks: [
      {
        artifactPath: PATH_PROOF_TASKS_ARTIFACT,
        relationship: 'proof_task_plan',
      },
    ],
  };
}

function makePathProofPlan(tasks: PathProofTask[]): PathProofPlan {
  return {
    generatedAt: '2026-04-29T23:00:00.000Z',
    summary: {
      terminalWithoutObservedEvidence: tasks.length,
      plannedTasks: tasks.length,
      executableTasks: tasks.filter((task) => task.autonomousExecutionAllowed).length,
      humanRequiredTasks: tasks.filter((task) => task.mode === 'human_required').length,
      notExecutableTasks: tasks.filter((task) => task.mode === 'not_executable').length,
    },
    tasks,
  };
}

function baseInput(rootDir: string): CertificationInput {
  const now = '2026-04-29T23:00:00.000Z';
  const finalReadinessCriteria = {
    requireAllTiersPass: false,
    requireNoAcceptedCriticalFlows: false,
    requireNoAcceptedCriticalScenarios: false,
    requireWorldStateConvergence: false,
  };
  const codacy = {
    snapshotAvailable: true,
    sourcePath: null,
    syncedAt: now,
    ageMinutes: 0,
    stale: false,
    loc: 0,
    totalIssues: 0,
    severityCounts: { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
    toolCounts: {},
    topFiles: [],
    highPriorityBatch: [],
    observedFiles: [],
  };

  return {
    rootDir,
    manifestResult: {
      manifest: {
        version: 1,
        projectId: 'pulse-test',
        projectName: 'PULSE Test',
        systemType: 'test',
        supportedStacks: [],
        surfaces: [],
        criticalDomains: [],
        modules: [],
        actorProfiles: [],
        scenarioSpecs: [],
        externalIntegrations: [],
        jobs: [],
        webhooks: [],
        stateMachines: [],
        criticalFlows: [],
        invariants: [],
        flowSpecs: [],
        invariantSpecs: [],
        temporaryAcceptances: [],
        certificationTiers: [],
        finalReadinessCriteria,
        slos: {},
        securityRequirements: [],
        recoveryRequirements: [],
        excludedSurfaces: [],
        environments: ['scan'],
      },
      manifestPath: 'pulse.manifest.json',
      issues: [],
      unknownSurfaces: [],
      unsupportedStacks: [],
    },
    parserInventory: {
      contracts: [],
      discoveredChecks: [],
      loadedChecks: [],
      unavailableChecks: [],
      helperFilesSkipped: [],
    },
    health: {
      score: 100,
      totalNodes: 1,
      breaks: [],
      stats: {
        uiElements: 0,
        uiDeadHandlers: 0,
        apiCalls: 0,
        apiNoRoute: 0,
        backendRoutes: 0,
        backendEmpty: 0,
        prismaModels: 0,
        modelOrphans: 0,
        facades: 0,
        facadesBySeverity: { high: 0, medium: 0, low: 0 },
        proxyRoutes: 0,
        proxyNoUpstream: 0,
        securityIssues: 0,
        dataSafetyIssues: 0,
        qualityIssues: 0,
        unavailableChecks: 0,
        unknownSurfaces: 0,
      },
      timestamp: now,
    },
    codebaseTruth: {
      generatedAt: now,
      summary: {
        totalPages: 1,
        userFacingPages: 1,
        discoveredModules: 1,
        discoveredFlows: 0,
        blockerCount: 0,
        warningCount: 0,
      },
      pages: [],
      discoveredModules: [],
      discoveredFlows: [],
      divergence: {
        declaredNotDiscovered: [],
        discoveredNotDeclared: [],
        declaredButInternal: [],
        frontendSurfaceWithoutBackendSupport: [],
        backendCapabilityWithoutFrontendSurface: [],
        shellWithoutPersistence: [],
        flowCandidatesWithoutOracle: [],
        blockerCount: 0,
        warningCount: 0,
      },
    },
    resolvedManifest: {
      generatedAt: now,
      sourceManifestPath: 'pulse.manifest.json',
      projectId: 'pulse-test',
      projectName: 'PULSE Test',
      systemType: 'test',
      supportedStacks: [],
      surfaces: [],
      criticalDomains: [],
      modules: [],
      flowGroups: [],
      actorProfiles: [],
      scenarioSpecs: [],
      flowSpecs: [],
      invariantSpecs: [],
      temporaryAcceptances: [],
      certificationTiers: [],
      finalReadinessCriteria,
      securityRequirements: [],
      recoveryRequirements: [],
      slos: {},
      summary: {
        totalModules: 1,
        resolvedModules: 1,
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
    },
    scopeState: {
      generatedAt: now,
      rootDir,
      summary: {
        totalFiles: 0,
        totalLines: 0,
        runtimeCriticalFiles: 0,
        userFacingFiles: 0,
        humanRequiredFiles: 0,
        surfaceCounts: {},
        kindCounts: {},
        unmappedModuleCandidates: [],
        inventoryCoverage: 100,
        classificationCoverage: 100,
        structuralGraphCoverage: 100,
        testCoverage: 100,
        scenarioCoverage: 100,
        runtimeEvidenceCoverage: 100,
        productionProofCoverage: 100,
        orphanFiles: [],
        unknownFiles: [],
      },
      parity: {
        status: 'pass',
        mode: 'repo_inventory_with_codacy_spotcheck',
        confidence: 'high',
        reason: 'scope is coherent for test fixture',
        inventoryFiles: 0,
        codacyObservedFiles: 0,
        codacyObservedFilesCovered: 0,
        missingCodacyFiles: [],
      },
      codacy,
      files: [],
      moduleAggregates: [],
      excludedFiles: [],
      scopeSource: 'repo_filesystem',
      manifestBoundary: false,
      manifestRole: 'semantic_overlay',
    },
    certificationTarget: { tier: null, final: true, profile: 'full-product' },
  } as CertificationInput;
}
import "../__companions__/certification-proof-readiness.spec.companion";
