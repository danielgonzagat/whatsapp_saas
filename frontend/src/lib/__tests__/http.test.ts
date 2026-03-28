import { describe, it, expect } from 'vitest';
import { apiUrl } from '../http';

describe('apiUrl', () => {
  it('prepends API_BASE to a path starting with /', () => {
    const result = apiUrl('/kloel/wallet/123/balance');
    expect(result).toContain('/kloel/wallet/123/balance');
    // Should not have double slashes in the middle
    expect(result).not.toMatch(/[^:]\/\//);
  });

  it('handles paths without leading slash', () => {
    const result = apiUrl('health');
    expect(result).toContain('/health');
  });
});
