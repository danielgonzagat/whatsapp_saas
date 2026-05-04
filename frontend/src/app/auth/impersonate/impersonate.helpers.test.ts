import { describe, it, expect } from 'vitest';
import { resolveNextRoute } from './impersonate.helpers';

describe('resolveNextRoute', () => {
  it('should allow safe relative paths', () => {
    expect(resolveNextRoute('/dashboard', '/fallback')).toBe('/dashboard');
    expect(resolveNextRoute('/auth/login', '/fallback')).toBe('/auth/login');
  });

  it('should reject protocol-relative URLs (open redirect)', () => {
    expect(resolveNextRoute('//evil.com', '/fallback')).toBe('/fallback');
    expect(resolveNextRoute('///', '/fallback')).toBe('/fallback');
  });

  it('should reject absolute URLs with scheme', () => {
    expect(resolveNextRoute('https://evil.com', '/fallback')).toBe('/fallback');
    expect(resolveNextRoute('http://attacker.com/path', '/fallback')).toBe('/fallback');
  });

  it('should use fallback for undefined or empty', () => {
    expect(resolveNextRoute(undefined, '/fallback')).toBe('/fallback');
    expect(resolveNextRoute('', '/fallback')).toBe('/fallback');
  });

  it('should reject non-path strings', () => {
    expect(resolveNextRoute('dashboard', '/fallback')).toBe('/fallback');
    expect(resolveNextRoute('just-text', '/fallback')).toBe('/fallback');
  });
});
