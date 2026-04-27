import { describe, it, expect } from 'vitest';
import {
  isStructuralRole,
  STRUCTURAL_ROLES,
  isCapabilityStatus,
  CAPABILITY_STATUSES,
  isTruthMode,
  TRUTH_MODES,
} from '../types.structural-roles';

describe('StructuralRole type guard', () => {
  it('should validate all valid StructuralRole values', () => {
    const validRoles = [
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

  it('should reject invalid string values', () => {
    const invalidRoles = ['unknown_role', 'Interface', 'API_SURFACE', 'invalid'];

    invalidRoles.forEach((role) => {
      expect(isStructuralRole(role)).toBe(false);
    });
  });

  it('should reject non-string types', () => {
    expect(isStructuralRole(null)).toBe(false);
    expect(isStructuralRole(undefined)).toBe(false);
    expect(isStructuralRole(123)).toBe(false);
    expect(isStructuralRole({})).toBe(false);
    expect(isStructuralRole([])).toBe(false);
  });

  it('should have all expected roles in STRUCTURAL_ROLES constant', () => {
    expect(STRUCTURAL_ROLES).toContain('interface');
    expect(STRUCTURAL_ROLES).toContain('api_surface');
    expect(STRUCTURAL_ROLES).toContain('orchestration');
    expect(STRUCTURAL_ROLES).toContain('persistence');
    expect(STRUCTURAL_ROLES).toContain('side_effect');
    expect(STRUCTURAL_ROLES).toContain('runtime_evidence');
    expect(STRUCTURAL_ROLES).toContain('validation');
    expect(STRUCTURAL_ROLES).toContain('scenario_coverage');
    expect(STRUCTURAL_ROLES).toContain('observability');
    expect(STRUCTURAL_ROLES).toContain('codacy_hygiene');
  });
});

describe('CapabilityStatus type guard', () => {
  it('should validate all valid CapabilityStatus values', () => {
    const validStatuses = ['real', 'partial', 'latent', 'phantom'];

    validStatuses.forEach((status) => {
      expect(isCapabilityStatus(status)).toBe(true);
    });
  });

  it('should reject invalid string values', () => {
    const invalidStatuses = ['complete', 'Real', 'PARTIAL', 'unknown'];

    invalidStatuses.forEach((status) => {
      expect(isCapabilityStatus(status)).toBe(false);
    });
  });

  it('should reject non-string types', () => {
    expect(isCapabilityStatus(null)).toBe(false);
    expect(isCapabilityStatus(undefined)).toBe(false);
    expect(isCapabilityStatus(123)).toBe(false);
    expect(isCapabilityStatus({})).toBe(false);
    expect(isCapabilityStatus([])).toBe(false);
  });

  it('should have all expected statuses in CAPABILITY_STATUSES constant', () => {
    expect(CAPABILITY_STATUSES).toContain('real');
    expect(CAPABILITY_STATUSES).toContain('partial');
    expect(CAPABILITY_STATUSES).toContain('latent');
    expect(CAPABILITY_STATUSES).toContain('phantom');
  });
});

describe('TruthMode type guard', () => {
  it('should validate all valid TruthMode values', () => {
    const validModes = ['observed', 'inferred', 'aspirational'];

    validModes.forEach((mode) => {
      expect(isTruthMode(mode)).toBe(true);
    });
  });

  it('should reject invalid string values', () => {
    const invalidModes = ['verified', 'Observed', 'INFERRED', 'unknown'];

    invalidModes.forEach((mode) => {
      expect(isTruthMode(mode)).toBe(false);
    });
  });

  it('should reject non-string types', () => {
    expect(isTruthMode(null)).toBe(false);
    expect(isTruthMode(undefined)).toBe(false);
    expect(isTruthMode(123)).toBe(false);
    expect(isTruthMode({})).toBe(false);
    expect(isTruthMode([])).toBe(false);
  });

  it('should have all expected modes in TRUTH_MODES constant', () => {
    expect(TRUTH_MODES).toContain('observed');
    expect(TRUTH_MODES).toContain('inferred');
    expect(TRUTH_MODES).toContain('aspirational');
  });
});
