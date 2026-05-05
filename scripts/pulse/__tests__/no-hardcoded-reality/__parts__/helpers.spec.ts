import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { classifyEndpointRisk } from '../api-fuzzer';
import {
  classifyTargetsFromSource,
  detectProviders,
  generateProviderScenarios,
} from '../chaos-engine';
import { isInternalEndpoint, providerFromUrl } from '../contract-tester';
import { classifyFinancialModel } from '../dataflow-engine';
import { buildPathCoverageState, isSafeToExecute } from '../path-coverage-engine';
import { discoverPlugins } from '../plugin-system';
import { classifyEndpointRisk as classifyPropertyEndpointRisk } from '../property-tester';
import { classifyReplaySession } from '../replay-adapter';
import { classifyDestructiveActions } from '../safety-sandbox';
import { detectNewFile } from '../scope-engine';
import { classifySurface, classifyModuleCandidate } from '../scope-state.classify';
import { classifyRoleFromRoute } from '../ui-crawler';
import { determineRiskLevel } from '../dod-engine';
import { classifyExecutionFeasibility, isCriticalHarnessTarget } from '../execution-harness';
import { filePathToCapability, filePathToFlow, isCriticalPath } from '../gitnexus/provider';
import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { classifyWatchChange } from '../watch-classifier';
import { ROUTE_NOISE_TOKENS } from '../codebase-truth.tokens';
import { isUserFacingGroup } from '../codebase-truth.string-utils';
import { isLikelyMutation } from '../codebase-truth-flows';
import { buildScenarioCatalog } from '../scenario-engine';
import { buildBehaviorGraph } from '../behavior-graph';
import { buildSideEffectSignals } from '../structural-side-effects';
import type { APIEndpointProbe } from '../types.api-fuzzer';
import type { HarnessTarget } from '../types.execution-harness';
import type { PulseExecutionMatrixPath } from '../types.execution-matrix';
import type { PulseCapability, PulseConfig, PulseProductGraph } from '../types';
import type { ReplaySession } from '../types.replay-adapter';
import type { InteractionChain } from '../functional-map-types';
import {
  deriveUnitValue,
  deriveZeroValue,
  deriveHttpStatusFromObservedCatalog,
  discoverAllObservedArtifactFilenames,
  discoverCapabilityMaturityStageLabels,
  discoverCapabilityStatusLabels,
  discoverConvergenceExecutionModeLabels,
  discoverConvergenceUnitStatusLabels,
  discoverDoDStatusLabels,
  discoverSourceExtensionsFromObservedTypescript,
} from '../dynamic-reality-kernel';

export const currentPulseCoreAudit = auditPulseNoHardcodedReality(process.cwd());

export function countPulseSourceFiles(rootDir: string): number {
  const pulseDir = path.join(rootDir, 'scripts', 'pulse');
  const sourceExtensions = discoverSourceExtensionsFromObservedTypescript();
  const walk = (dir: string): number => {
    if (!fs.existsSync(dir)) {
      return deriveZeroValue();
    }
    return fs.readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return total + walk(fullPath);
      }
      return total + Number(entry.isFile() && sourceExtensions.has(path.extname(entry.name)));
    }, deriveZeroValue());
  };
  return walk(pulseDir);
}

export function endpointProbe(overrides: Partial<APIEndpointProbe> = {}): APIEndpointProbe {
  return {
    endpointId: 'GET:/anything:index:test.ts:1',
    method: 'GET',
    path: '/anything',
    controller: 'TestController',
    filePath: 'backend/src/renamed/test.controller.ts',
    requiresAuth: false,
    requiresTenant: false,
    rateLimit: null,
    requestSchema: null,
    responseSchema: null,
    authTests: [],
    schemaTests: [],
    idempotencyTests: [],
    rateLimitTests: [],
    securityTests: [],
    ...overrides,
  };
}

export function matrixPath(
  overrides: Partial<PulseExecutionMatrixPath> = {},
): PulseExecutionMatrixPath {
  const unitStatuses = [...discoverConvergenceUnitStatusLabels()];
  const executionModes = [...discoverConvergenceExecutionModeLabels()];
  return {
    pathId: 'matrix:path:test',
    capabilityId: null,
    flowId: null,
    source: 'execution_chain',
    entrypoint: {
      nodeId: null,
      filePath: 'backend/src/opaque/controller.ts',
      routePattern: '/opaque',
      description: 'Opaque route',
    },
    chain: [],
    status: unitStatuses[0] as PulseExecutionMatrixPath['status'],
    truthMode: 'inferred',
    productStatus: null,
    breakpoint: null,
    requiredEvidence: [],
    observedEvidence: [],
    validationCommand: 'node scripts/pulse/run.js --guidance',
    risk: 'medium',
    executionMode: executionModes[0] as PulseExecutionMatrixPath['executionMode'],
    confidence: deriveUnitValue(),
    filePaths: ['backend/src/opaque/controller.ts'],
    routePatterns: ['/opaque'],
    ...overrides,
  };
}

export function replaySession(overrides: Partial<ReplaySession> = {}): ReplaySession {
  const unitStatuses = [...discoverConvergenceUnitStatusLabels()];
  return {
    sessionId: 'replay-1',
    source: 'sentry_replay',
    userId: null,
    startTime: '2026-04-29T00:00:00.000Z',
    endTime: '2026-04-29T00:00:01.000Z',
    durationMs:
      deriveHttpStatusFromObservedCatalog('OK') +
      deriveHttpStatusFromObservedCatalog('OK') +
      deriveHttpStatusFromObservedCatalog('OK') +
      deriveHttpStatusFromObservedCatalog('OK') +
      deriveHttpStatusFromObservedCatalog('OK'),
    url: '/opaque',
    events: [],
    errors: [{ message: 'failed', timestamp: '2026-04-29T00:00:01.000Z' }],
    status: unitStatuses[0] as ReplaySession['status'],
    convertedScenarioId: null,
    ...overrides,
  };
}

export function harnessTarget(overrides: Partial<HarnessTarget> = {}): HarnessTarget {
  return {
    targetId: 'endpoint:get:opaque',
    kind: 'endpoint',
    name: 'OpaqueController.index',
    filePath: 'backend/src/opaque/controller.ts',
    methodName: 'index',
    routePattern: '/opaque',
    httpMethod: 'GET',
    requiresAuth: false,
    requiresTenant: false,
    dependencies: [],
    fixtures: [],
    feasibility: 'executable',
    feasibilityReason: '',
    generatedTests: [],
    generated: false,
    ...overrides,
  };
}

export function pulseCapability(overrides: Partial<PulseCapability> = {}): PulseCapability {
  const capabilityStatuses = [...discoverCapabilityStatusLabels()];
  const maturityStages = [...discoverCapabilityMaturityStageLabels()];
  const dodStatuses = [...discoverDoDStatusLabels()];
  const executionModes = [...discoverConvergenceExecutionModeLabels()];
  return {
    id: 'capability:opaque',
    name: 'Opaque',
    truthMode: 'observed',
    status: capabilityStatuses[0] as PulseCapability['status'],
    confidence: deriveUnitValue(),
    userFacing: false,
    runtimeCritical: false,
    protectedByGovernance: false,
    ownerLane: 'customer',
    executionMode: executionModes[0] as PulseCapability['executionMode'],
    rolesPresent: [],
    missingRoles: [],
    filePaths: [],
    nodeIds: [],
    routePatterns: [],
    evidenceSources: [],
    codacyIssueCount: deriveZeroValue(),
    highSeverityIssueCount: deriveZeroValue(),
    blockingReasons: [],
    validationTargets: [],
    maturity: {
      stage: maturityStages[0] as PulseCapability['maturity']['stage'],
      score: deriveZeroValue(),
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
      status: dodStatuses[0] as PulseCapability['dod']['status'],
      missingRoles: [],
      blockers: [],
      truthModeMet: true,
    },
    ...overrides,
  };
}

export function interactionChain(overrides: Partial<InteractionChain> = {}): InteractionChain {
  return {
    pageRoute: '/opaque',
    pageFile: 'frontend/src/app/opaque/page.tsx',
    componentFile: 'frontend/src/components/Opaque.tsx',
    elementType: 'button',
    elementLabel: 'Open',
    elementLine: deriveUnitValue(),
    handler: null,
    handlerType: 'unknown',
    apiCall: {
      endpoint: '/opaque',
      method: 'GET',
      file: 'frontend/src/lib/api.ts',
      line: deriveUnitValue(),
    },
    proxyRoute: null,
    backendRoute: null,
    serviceMethod: null,
    prismaModels: [],
    status: 'FUNCIONA',
    statusReason: '',
    facadeEvidence: [],
    ...overrides,
  };
}
