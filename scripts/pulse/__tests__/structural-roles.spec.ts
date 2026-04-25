/**
 * Unit tests for structural-roles type guards
 */

import {
  StructuralRole,
  CapabilityStatus,
  TruthMode,
  STRUCTURAL_ROLES,
  CAPABILITY_STATUSES,
  TRUTH_MODES,
  isStructuralRole,
  isCapabilityStatus,
  isTruthMode,
} from '../types.structural-roles';

describe('StructuralRole', () => {
  it('should contain all expected roles', () => {
    const expected: StructuralRole[] = [
      'interface',
      'api_surface',
      'orchestration',
      'persistence',
      'side_effect',
      'runtime_evidence',
      'validation',
      'scenario_coverage',
      'observability',
      'codacy_hygiene',
    ];
    expect(STRUCTURAL_ROLES).toEqual(expected);
  });

  it('isStructuralRole should return true for valid roles', () => {
    const validRoles: StructuralRole[] = [
      'interface',
      'api_surface',
      'orchestration',
      'persistence',
      'side_effect',
      'runtime_evidence',
      'validation',
      'scenario_coverage',
      'observability',
      'codacy_hygiene',
    ];

    validRoles.forEach((role) => {
      expect(isStructuralRole(role)).toBe(true);
    });
  });

  it('isStructuralRole should return false for invalid roles', () => {
    const invalidValues = [
      'unknown_role',
      'Interface',
      'API_SURFACE',
      123,
      null,
      undefined,
      {},
      [],
    ];

    invalidValues.forEach((value) => {
      expect(isStructuralRole(value)).toBe(false);
    });
  });
});

describe('CapabilityStatus', () => {
  it('should contain all expected statuses', () => {
    const expected: CapabilityStatus[] = ['real', 'partial', 'latent', 'phantom'];
    expect(CAPABILITY_STATUSES).toEqual(expected);
  });

  it('isCapabilityStatus should return true for valid statuses', () => {
    const validStatuses: CapabilityStatus[] = ['real', 'partial', 'latent', 'phantom'];

    validStatuses.forEach((status) => {
      expect(isCapabilityStatus(status)).toBe(true);
    });
  });

  it('isCapabilityStatus should return false for invalid statuses', () => {
    const invalidValues = ['complete', 'Real', 'PARTIAL', 123, null, undefined, {}, []];

    invalidValues.forEach((value) => {
      expect(isCapabilityStatus(value)).toBe(false);
    });
  });
});

describe('TruthMode', () => {
  it('should contain all expected truth modes', () => {
    const expected: TruthMode[] = ['observed', 'inferred', 'aspirational'];
    expect(TRUTH_MODES).toEqual(expected);
  });

  it('isTruthMode should return true for valid modes', () => {
    const validModes: TruthMode[] = ['observed', 'inferred', 'aspirational'];

    validModes.forEach((mode) => {
      expect(isTruthMode(mode)).toBe(true);
    });
  });

  it('isTruthMode should return false for invalid modes', () => {
    const invalidValues = ['verified', 'Observed', 'INFERRED', 123, null, undefined, {}, []];

    invalidValues.forEach((value) => {
      expect(isTruthMode(value)).toBe(false);
    });
  });
});
