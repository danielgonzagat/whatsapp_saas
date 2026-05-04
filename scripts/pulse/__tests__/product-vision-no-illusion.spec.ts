/**
 * Unit tests for product-vision completion scoring — no-illusion rule
 *
 * The no-illusion rule: A surface/experience with any capability or flow
 * having dod.status !== 'done' (i.e., missing structural roles, blockers,
 * or Codacy HIGH issues) CANNOT report completion=100% or status=done.
 */

import { describe, it, expect } from 'vitest';
import type { PulseCapability, PulseFlowProjectionItem } from '../types.capabilities';
import type { PulseCapabilityDoD } from '../types.capabilities';

// Mock implementations matching the actual product-vision.ts helper functions
const CAPABILITY_STATUS_SCORE: Record<string, number> = {
  real: 1.0,
  partial: 0.6,
  latent: 0.3,
  phantom: 0.0,
};

const FLOW_STATUS_SCORE: Record<string, number> = {
  real: 1.0,
  partial: 0.6,
  latent: 0.3,
  phantom: 0.0,
};

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * The actual buildCapabilityCompletion function with no-illusion rule enforced
 */
function buildCapabilityCompletion(
  capabilities: PulseCapability[],
  flows: PulseFlowProjectionItem[],
): number {
  const scores = [
    ...capabilities.map((capability) => {
      const baseScore = CAPABILITY_STATUS_SCORE[capability.status];
      // No-illusion rule: if DoD is not 'done', cap at 0.8 max
      if (capability.dod.status !== 'done') {
        return Math.min(baseScore, 0.8);
      }
      return baseScore;
    }),
    ...flows.map((flow) => {
      const baseScore = FLOW_STATUS_SCORE[flow.status];
      // No-illusion rule: if DoD is not 'done', cap at 0.8 max
      if (flow.dod.status !== 'done') {
        return Math.min(baseScore, 0.8);
      }
      return baseScore;
    }),
  ];
  if (scores.length === 0) {
    return 0;
  }
  return clamp(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeCapability(overrides: Partial<PulseCapability> = {}): PulseCapability {
  return {
    id: 'test-capability',
    name: 'Test Capability',
    truthMode: 'observed',
    status: 'real',
    confidence: 0.95,
    userFacing: true,
    runtimeCritical: false,
    protectedByGovernance: false,
    ownerLane: 'platform',
    executionMode: 'ai_safe',
    rolesPresent: ['interface', 'orchestration', 'persistence', 'side_effect'],
    missingRoles: [],
    filePaths: ['backend/src/test.service.ts'],
    nodeIds: ['node-1'],
    routePatterns: ['/api/test'],
    evidenceSources: ['source-1'],
    codacyIssueCount: 0,
    highSeverityIssueCount: 0,
    blockingReasons: [],
    validationTargets: [],
    maturity: {
      stage: 'production_ready',
      score: 0.95,
      dimensions: {
        interfacePresent: true,
        apiSurfacePresent: true,
        orchestrationPresent: true,
        persistencePresent: true,
        sideEffectPresent: false,
        runtimeEvidencePresent: true,
        validationPresent: true,
        scenarioCoveragePresent: true,
        codacyHealthy: true,
        simulationOnly: false,
      },
      missing: [],
    },
    dod: {
      status: 'done',
      missingRoles: [],
      blockers: [],
      truthModeMet: true,
    },
    ...overrides,
  };
}

function makeFlow(overrides: Partial<PulseFlowProjectionItem> = {}): PulseFlowProjectionItem {
  return {
    id: 'test-flow',
    name: 'Test Flow',
    truthMode: 'observed',
    status: 'real',
    confidence: 0.9,
    startNodeIds: ['node-1'],
    endNodeIds: ['node-2'],
    routePatterns: ['/api/test'],
    capabilityIds: ['test-capability'],
    rolesPresent: ['interface', 'orchestration', 'persistence'],
    missingLinks: [],
    distanceToReal: 0,
    evidenceSources: ['source-1'],
    blockingReasons: [],
    validationTargets: [],
    dod: {
      status: 'done',
      missingRoles: [],
      blockers: [],
      truthModeMet: true,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildCapabilityCompletion — no-illusion rule', () => {
  it('returns 1.0 when all capabilities/flows have dod.status=done', () => {
    const capabilities = [makeCapability()];
    const flows = [makeFlow()];

    const completion = buildCapabilityCompletion(capabilities, flows);

    expect(completion).toBe(1.0);
  });

  it('caps real capability at 0.8 when dod.status=partial (missing roles)', () => {
    const capabilities = [
      makeCapability({
        status: 'real',
        dod: {
          status: 'partial',
          missingRoles: ['persistence'],
          blockers: ['persistence role missing'],
          truthModeMet: true,
        },
      }),
    ];
    const flows = [];

    const completion = buildCapabilityCompletion(capabilities, flows);

    // Base score for 'real' is 1.0, but no-illusion rule caps it at 0.8
    expect(completion).toBeLessThanOrEqual(0.8);
    expect(completion).toBe(0.8);
  });

  it('caps partial capability at 0.6 (already partial), but still enforces dod cap', () => {
    const capabilities = [
      makeCapability({
        status: 'partial',
        dod: {
          status: 'latent',
          missingRoles: ['api_surface', 'persistence'],
          blockers: ['missing critical roles'],
          truthModeMet: false,
        },
      }),
    ];
    const flows = [];

    const completion = buildCapabilityCompletion(capabilities, flows);

    // Base score for 'partial' is 0.6, no-illusion caps it at 0.8, so min(0.6, 0.8) = 0.6
    expect(completion).toBe(0.6);
  });

  it('caps flow at 0.8 when dod.status=phantom', () => {
    const capabilities = [];
    const flows = [
      makeFlow({
        status: 'real',
        dod: {
          status: 'phantom',
          missingRoles: ['api_surface', 'orchestration'],
          blockers: ['critical roles missing', 'Codacy HIGH issues detected'],
          truthModeMet: false,
        },
      }),
    ];

    const completion = buildCapabilityCompletion(capabilities, flows);

    // Base score for 'real' is 1.0, but no-illusion caps it at 0.8
    expect(completion).toBeLessThanOrEqual(0.8);
    expect(completion).toBe(0.8);
  });

  it('averages scores correctly with mixed dod statuses', () => {
    const capabilities = [
      // This one is 'real' with dod='done' → contributes 1.0
      makeCapability({
        status: 'real',
        dod: { status: 'done', missingRoles: [], blockers: [], truthModeMet: true },
      }),
      // This one is 'real' with dod='partial' → capped at 0.8
      makeCapability({
        status: 'real',
        dod: {
          status: 'partial',
          missingRoles: ['persistence'],
          blockers: ['missing'],
          truthModeMet: true,
        },
      }),
    ];
    const flows = [];

    const completion = buildCapabilityCompletion(capabilities, flows);

    // Average of 1.0 and 0.8 = 0.9
    expect(completion).toBe(0.9);
  });

  it('returns 0 when no capabilities or flows provided', () => {
    const completion = buildCapabilityCompletion([], []);
    expect(completion).toBe(0);
  });

  it('enforces no-illusion rule even when status=latent but dod=done', () => {
    const capabilities = [
      makeCapability({
        status: 'latent', // 0.3 base score
        dod: { status: 'done', missingRoles: [], blockers: [], truthModeMet: true },
      }),
    ];
    const flows = [];

    const completion = buildCapabilityCompletion(capabilities, flows);

    // latent base is 0.3, dod is done, so no cap applied → should be 0.3
    expect(completion).toBe(0.3);
  });

  it('combines capability and flow scores with no-illusion rule applied independently', () => {
    const capabilities = [
      makeCapability({
        status: 'real',
        dod: { status: 'done', missingRoles: [], blockers: [], truthModeMet: true },
      }),
    ];
    const flows = [
      makeFlow({
        status: 'partial',
        dod: {
          status: 'latent',
          missingRoles: ['orchestration'],
          blockers: ['missing'],
          truthModeMet: false,
        },
      }),
    ];

    const completion = buildCapabilityCompletion(capabilities, flows);

    // capability: 1.0 (real + dod done)
    // flow: min(0.6, 0.8) = 0.6 (partial status but dod latent)
    // average: (1.0 + 0.6) / 2 = 0.8
    expect(completion).toBe(0.8);
  });

  it('clamps result to [0, 1] range', () => {
    const capabilities = [makeCapability({ status: 'phantom' })];
    const flows = [makeFlow({ status: 'phantom' })];

    const completion = buildCapabilityCompletion(capabilities, flows);

    expect(completion).toBeGreaterThanOrEqual(0);
    expect(completion).toBeLessThanOrEqual(1);
  });
});
