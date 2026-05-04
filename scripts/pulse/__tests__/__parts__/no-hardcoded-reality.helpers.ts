import * as fs from 'fs';
import * as path from 'path';

import type { APIEndpointProbe } from '../../types.api-fuzzer';
import type { HarnessTarget } from '../../types.execution-harness';
import type { PulseExecutionMatrixPath } from '../../types.execution-matrix';
import type { PulseCapability } from '../../types';
import type { ReplaySession } from '../../types.replay-adapter';
import type { InteractionChain } from '../../functional-map-types';
import { auditPulseNoHardcodedReality } from '../../no-hardcoded-reality-audit';

export const currentPulseCoreAudit = auditPulseNoHardcodedReality(process.cwd());

export function countPulseSourceFiles(rootDir: string): number {
  const pulseDir = path.join(rootDir, 'scripts', 'pulse');
  const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
  const walk = (dir: string): number => {
    if (!fs.existsSync(dir)) {
      return 0;
    }
    return fs.readdirSync(dir, { withFileTypes: true }).reduce((total, entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return total + walk(fullPath);
      }
      return total + Number(entry.isFile() && sourceExtensions.has(path.extname(entry.name)));
    }, 0);
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
    status: 'inferred_only',
    truthMode: 'inferred',
    productStatus: null,
    breakpoint: null,
    requiredEvidence: [],
    observedEvidence: [],
    validationCommand: 'node scripts/pulse/run.js --guidance',
    risk: 'medium',
    executionMode: 'ai_safe',
    confidence: 1,
    filePaths: ['backend/src/opaque/controller.ts'],
    routePatterns: ['/opaque'],
    ...overrides,
  };
}

export function replaySession(overrides: Partial<ReplaySession> = {}): ReplaySession {
  return {
    sessionId: 'replay-1',
    source: 'sentry_replay',
    userId: null,
    startTime: '2026-04-29T00:00:00.000Z',
    endTime: '2026-04-29T00:00:01.000Z',
    durationMs: 1000,
    url: '/opaque',
    events: [],
    errors: [{ message: 'failed', timestamp: '2026-04-29T00:00:01.000Z' }],
    status: 'captured',
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
  return {
    id: 'capability:opaque',
    name: 'Opaque',
    truthMode: 'observed',
    status: 'partial',
    confidence: 1,
    userFacing: false,
    runtimeCritical: false,
    protectedByGovernance: false,
    ownerLane: 'customer',
    executionMode: 'ai_safe',
    rolesPresent: [],
    missingRoles: [],
    filePaths: [],
    nodeIds: [],
    routePatterns: [],
    evidenceSources: [],
    codacyIssueCount: 0,
    highSeverityIssueCount: 0,
    blockingReasons: [],
    validationTargets: [],
    maturity: {
      stage: 'foundational',
      score: 0,
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
      status: 'partial',
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
    elementLine: 1,
    handler: null,
    handlerType: 'unknown',
    apiCall: {
      endpoint: '/opaque',
      method: 'GET',
      file: 'frontend/src/lib/api.ts',
      line: 1,
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
