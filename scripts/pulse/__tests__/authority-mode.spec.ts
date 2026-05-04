import { describe, it, expect } from 'vitest';
import { isAuthorityMode, AUTHORITY_MODES, type AuthorityMode } from '../types.authority-mode';

describe('AuthorityMode type guard', () => {
  it('should validate all valid AuthorityMode values', () => {
    const validModes: AuthorityMode[] = [
      'advisory-only',
      'operator-gated',
      'autonomous-execution',
      'certified-autonomous',
    ];

    validModes.forEach((mode) => {
      expect(isAuthorityMode(mode)).toBe(true);
    });
  });

  it('should reject invalid string values', () => {
    const invalidModes = ['invalid-mode', 'unknown', 'pending', 'mixed'];

    invalidModes.forEach((mode) => {
      expect(isAuthorityMode(mode)).toBe(false);
    });
  });

  it('should reject non-string types', () => {
    expect(isAuthorityMode(null)).toBe(false);
    expect(isAuthorityMode(undefined)).toBe(false);
    expect(isAuthorityMode(123)).toBe(false);
    expect(isAuthorityMode({})).toBe(false);
    expect(isAuthorityMode([])).toBe(false);
  });

  it('should export AUTHORITY_MODES constant with all 4 modes', () => {
    expect(AUTHORITY_MODES).toHaveLength(4);
    expect(AUTHORITY_MODES).toContain('advisory-only');
    expect(AUTHORITY_MODES).toContain('operator-gated');
    expect(AUTHORITY_MODES).toContain('autonomous-execution');
    expect(AUTHORITY_MODES).toContain('certified-autonomous');
  });
});
