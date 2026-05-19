import { encryptTikTokToken, decryptTikTokToken } from './tiktok-token-crypto';

describe('tiktok-token-crypto production guard', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  it('allows plaintext fallback outside production for legacy local data', () => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    delete process.env.TIKTOK_TOKEN_ENCRYPTION_KEY;

    expect(encryptTikTokToken('token')).toBe('token');
    expect(decryptTikTokToken('token')).toBe('token');
  });

  it('throws in production when no encryption key is configured', () => {
    process.env = { ...originalEnv, NODE_ENV: 'production' };
    delete process.env.TIKTOK_TOKEN_ENCRYPTION_KEY;

    expect(() => encryptTikTokToken('token')).toThrow(/TIKTOK_TOKEN_ENCRYPTION_KEY/);
  });
});
