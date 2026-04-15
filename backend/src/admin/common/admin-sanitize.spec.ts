import { sanitizeForAudit } from './admin-sanitize';

describe('sanitizeForAudit', () => {
  it('passes primitives through unchanged', () => {
    expect(sanitizeForAudit('hello')).toBe('hello');
    expect(sanitizeForAudit(42)).toBe(42);
    expect(sanitizeForAudit(true)).toBe(true);
    expect(sanitizeForAudit(null)).toBe(null);
    expect(sanitizeForAudit(undefined)).toBe(undefined);
  });

  it('redacts password-like fields recursively', () => {
    const out = sanitizeForAudit({
      email: 'x@y.com',
      password: 'hunter2',
      nested: { newPassword: 'nope', mfaCode: '123456' },
    });
    expect(out).toEqual({
      email: 'x@y.com',
      password: '[REDACTED]',
      nested: { newPassword: '[REDACTED]', mfaCode: '[REDACTED]' },
    });
  });

  it('truncates deeply nested structures instead of stack-overflowing', () => {
    let obj: Record<string, unknown> = { leaf: 'ok' };
    for (let i = 0; i < 10; i++) {
      obj = { wrap: obj };
    }
    const out = sanitizeForAudit(obj);
    expect(JSON.stringify(out)).toContain('[[depth]]');
  });

  it('caps array expansion to 20 elements', () => {
    const huge = Array.from({ length: 100 }, (_, i) => i);
    const out = sanitizeForAudit(huge) as unknown[];
    expect(out).toHaveLength(20);
  });
});
