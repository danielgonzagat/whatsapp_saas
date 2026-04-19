import { hashRefreshToken } from './refresh-token-hash';

describe('hashRefreshToken', () => {
  it('produces a deterministic digest for the same token', () => {
    expect(hashRefreshToken('refresh-token-value')).toBe(hashRefreshToken('refresh-token-value'));
  });

  it('does not return the raw token value', () => {
    expect(hashRefreshToken('refresh-token-value')).not.toBe('refresh-token-value');
  });
});
