/**
 * Unit tests for the DefinitionOfDoneEngine (Phase 8)
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateDone,
  evaluateBatch,
  type CapabilityDoneInput,
  type CapabilityDoneResult,
  type CapabilityRoleEvidence,
  type DoDEvidenceTruthMode,
} from '../definition-of-done';
import type { StructuralRole } from '../types.structural-roles';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvidence(
  role: StructuralRole,
  present: boolean,
  truthMode: DoDEvidenceTruthMode,
  evidencePath?: string,
): CapabilityRoleEvidence {
  return { role, present, truthMode, evidencePath };
}

function makeInput(overrides: Partial<CapabilityDoneInput> = {}): CapabilityDoneInput {
  return {
    id: 'test-capability',
    kind: 'capability',
    requiredRoles: ['interface', 'api_surface', 'persistence'],
    evidence: [
      makeEvidence('interface', true, 'observed', 'frontend/src/pages/test.tsx'),
      makeEvidence('api_surface', true, 'observed', 'backend/src/test.controller.ts'),
      makeEvidence('persistence', true, 'observed', 'backend/src/test.service.ts'),
    ],
    codacyHighCount: 0,
    hasPhantom: false,
    hasLatentCritical: false,
    truthModeTarget: 'observed',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Happy path: all roles present + observed + 0 high issues
// ---------------------------------------------------------------------------

describe('evaluateDone — happy path', () => {
  it('returns done=true when all roles present, observed, 0 high issues, no phantom, no latent', () => {
    const result: CapabilityDoneResult = evaluateDone(makeInput());

    expect(result.done).toBe(true);
    expect(result.reasons).toHaveLength(0);
    expect(result.missingRoles).toHaveLength(0);
    expect(result.truthModeMet).toBe(true);
    expect(result.id).toBe('test-capability');
  });

  it('mirrors the input id in the result', () => {
    const result = evaluateDone(makeInput({ id: 'my-flow' }));
    expect(result.id).toBe('my-flow');
  });

  it('accepts inferred evidence when target is inferred', () => {
    const result = evaluateDone(
      makeInput({
        evidence: [
          makeEvidence('interface', true, 'inferred'),
          makeEvidence('api_surface', true, 'inferred'),
          makeEvidence('persistence', true, 'inferred'),
        ],
        truthModeTarget: 'inferred',
      }),
    );

    expect(result.done).toBe(true);
    expect(result.truthModeMet).toBe(true);
  });

  it('accepts observed evidence when target is aspirational', () => {
    const result = evaluateDone(
      makeInput({
        truthModeTarget: 'aspirational',
      }),
    );

    expect(result.done).toBe(true);
    expect(result.truthModeMet).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Missing one required role
// ---------------------------------------------------------------------------

describe('evaluateDone — missing role', () => {
  it('returns done=false and lists the missing role when one required role has no evidence', () => {
    const result = evaluateDone(
      makeInput({
        evidence: [
          makeEvidence('interface', true, 'observed'),
          makeEvidence('api_surface', true, 'observed'),
          // 'persistence' is missing entirely
        ],
      }),
    );

    expect(result.done).toBe(false);
    expect(result.missingRoles).toContain('persistence');
    expect(result.reasons.some((r) => r.includes('persistence'))).toBe(true);
  });

  it('returns done=false when a required role has present=false', () => {
    const result = evaluateDone(
      makeInput({
        evidence: [
          makeEvidence('interface', true, 'observed'),
          makeEvidence('api_surface', true, 'observed'),
          makeEvidence('persistence', false, 'observed'), // present=false
        ],
      }),
    );

    expect(result.done).toBe(false);
    expect(result.missingRoles).toContain('persistence');
  });

  it('lists multiple missing roles', () => {
    const result = evaluateDone(
      makeInput({
        evidence: [
          makeEvidence('interface', true, 'observed'),
          // api_surface and persistence both missing
        ],
      }),
    );

    expect(result.done).toBe(false);
    expect(result.missingRoles).toContain('api_surface');
    expect(result.missingRoles).toContain('persistence');
    expect(result.missingRoles).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Latent critical present
// ---------------------------------------------------------------------------

describe('evaluateDone — latent critical', () => {
  it('returns done=false when hasLatentCritical is true', () => {
    const result = evaluateDone(makeInput({ hasLatentCritical: true }));

    expect(result.done).toBe(false);
    expect(result.reasons.some((r) => r.toLowerCase().includes('latent'))).toBe(true);
  });

  it('includes a descriptive reason message', () => {
    const result = evaluateDone(makeInput({ hasLatentCritical: true }));

    expect(result.reasons.some((r) => r.includes('dormant failure path'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phantom present
// ---------------------------------------------------------------------------

describe('evaluateDone — phantom', () => {
  it('returns done=false when hasPhantom is true', () => {
    const result = evaluateDone(makeInput({ hasPhantom: true }));

    expect(result.done).toBe(false);
    expect(result.reasons.some((r) => r.toLowerCase().includes('phantom'))).toBe(true);
  });

  it('includes a descriptive reason message', () => {
    const result = evaluateDone(makeInput({ hasPhantom: true }));

    expect(result.reasons.some((r) => r.includes('unreachable or dead code path'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Codacy high issues > 0
// ---------------------------------------------------------------------------

describe('evaluateDone — codacy high count', () => {
  it('returns done=false when codacyHighCount > 0', () => {
    const result = evaluateDone(makeInput({ codacyHighCount: 3 }));

    expect(result.done).toBe(false);
    expect(result.reasons.some((r) => r.includes('3'))).toBe(true);
  });

  it('includes the exact count in the reason message', () => {
    const result = evaluateDone(makeInput({ codacyHighCount: 7 }));

    expect(result.reasons.some((r) => r.includes('7 high-severity'))).toBe(true);
  });

  it('returns done=true when codacyHighCount is exactly 0', () => {
    const result = evaluateDone(makeInput({ codacyHighCount: 0 }));
    expect(result.done).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TruthMode mismatch
// ---------------------------------------------------------------------------

describe('evaluateDone — truth mode mismatch', () => {
  it('returns truthModeMet=false when evidence is aspirational but target is observed', () => {
    const result = evaluateDone(
      makeInput({
        evidence: [
          makeEvidence('interface', true, 'aspirational'),
          makeEvidence('api_surface', true, 'aspirational'),
          makeEvidence('persistence', true, 'aspirational'),
        ],
        truthModeTarget: 'observed',
      }),
    );

    expect(result.done).toBe(false);
    expect(result.truthModeMet).toBe(false);
    expect(result.reasons.some((r) => r.includes('aspirational'))).toBe(true);
    expect(result.reasons.some((r) => r.includes('observed'))).toBe(true);
  });

  it('returns truthModeMet=false when evidence is inferred but target is observed', () => {
    const result = evaluateDone(
      makeInput({
        evidence: [
          makeEvidence('interface', true, 'inferred'),
          makeEvidence('api_surface', true, 'inferred'),
          makeEvidence('persistence', true, 'inferred'),
        ],
        truthModeTarget: 'observed',
      }),
    );

    expect(result.done).toBe(false);
    expect(result.truthModeMet).toBe(false);
  });

  it('returns truthModeMet=true when best evidence is observed and target is inferred', () => {
    const result = evaluateDone(
      makeInput({
        evidence: [
          makeEvidence('interface', true, 'inferred'),
          makeEvidence('api_surface', true, 'observed'), // upgrades best to observed
          makeEvidence('persistence', true, 'inferred'),
        ],
        truthModeTarget: 'inferred',
      }),
    );

    expect(result.truthModeMet).toBe(true);
  });

  it('does not let one observed role upgrade another required role that is only inferred', () => {
    const result = evaluateDone(
      makeInput({
        evidence: [
          makeEvidence('interface', true, 'observed'),
          makeEvidence('api_surface', true, 'inferred'),
          makeEvidence('persistence', true, 'observed'),
        ],
        truthModeTarget: 'observed',
      }),
    );

    expect(result.done).toBe(false);
    expect(result.truthModeMet).toBe(false);
    expect(result.insufficientEvidenceRoles).toEqual(['api_surface']);
    expect(result.governedBlockers).toEqual([
      {
        role: 'api_surface',
        executionMode: 'ai_safe',
        reason: 'Required role api_surface is below truth target observed.',
        expectedValidation:
          'Run governed structural evidence validation for role api_surface on capability test-capability.',
      },
    ]);
  });

  it('returns truthModeMet=false when all evidence is present=false', () => {
    const result = evaluateDone(
      makeInput({
        evidence: [
          makeEvidence('interface', false, 'observed'),
          makeEvidence('api_surface', false, 'observed'),
          makeEvidence('persistence', false, 'observed'),
        ],
        truthModeTarget: 'observed',
      }),
    );

    // No present evidence -> bestTruthMode = 'not_available' < 'observed'
    expect(result.truthModeMet).toBe(false);
  });

  it('treats explicit not_available proof as insufficient for required roles', () => {
    const result = evaluateDone(
      makeInput({
        evidence: [
          makeEvidence('interface', true, 'observed'),
          makeEvidence('api_surface', true, 'not_available'),
          makeEvidence('persistence', true, 'observed'),
        ],
        truthModeTarget: 'observed',
      }),
    );

    expect(result.done).toBe(false);
    expect(result.truthModeMet).toBe(false);
    expect(result.insufficientEvidenceRoles).toEqual(['api_surface']);
  });
});

describe('evaluateDone — governed ai_safe blockers', () => {
  it('emits governed validation blockers for missing proof without human_required routing', () => {
    const result = evaluateDone(
      makeInput({
        kind: 'flow',
        id: 'flow-under-test',
        requiredRoles: ['runtime_evidence', 'scenario_coverage'],
        evidence: [],
        truthModeTarget: 'observed',
      }),
    );

    expect(result.done).toBe(false);
    expect(result.governedBlockers).toHaveLength(2);
    expect(result.governedBlockers.map((blocker) => blocker.executionMode)).toEqual([
      'ai_safe',
      'ai_safe',
    ]);
    expect(result.governedBlockers.map((blocker) => blocker.expectedValidation)).toEqual([
      'Run governed runtime evidence collection for flow flow-under-test.',
      'Run governed scenario or flow evidence for flow flow-under-test.',
    ]);
    expect(JSON.stringify(result.governedBlockers)).not.toMatch(/human_required|human approval/i);
  });
});

// ---------------------------------------------------------------------------
// Multiple failures accumulate
// ---------------------------------------------------------------------------

describe('evaluateDone — multiple simultaneous failures', () => {
  it('collects all failure reasons when multiple conditions fail', () => {
    const result = evaluateDone(
      makeInput({
        evidence: [
          makeEvidence('interface', true, 'aspirational'),
          // api_surface and persistence missing
        ],
        codacyHighCount: 2,
        hasPhantom: true,
        hasLatentCritical: true,
        truthModeTarget: 'observed',
      }),
    );

    expect(result.done).toBe(false);
    expect(result.reasons.length).toBeGreaterThanOrEqual(4);
    expect(result.missingRoles).toContain('api_surface');
    expect(result.missingRoles).toContain('persistence');
  });
});
