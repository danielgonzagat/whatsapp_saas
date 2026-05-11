import {
  encryptGoogleAdsToken,
  decryptGoogleAdsToken,
  isEncryptedGoogleAdsToken,
} from './google-ads-token-crypto';

describe('google-ads-token-crypto (AES-256-GCM)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.GOOGLE_ADS_TOKEN_ENCRYPTION_KEY =
      'c29tZS1iYXNlNjQtZW5jb2RlZC0zMmJ5dGVzLWtleQ==';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('encrypts a token using AES-256-GCM with key version prefix', () => {
    const token = 'test-access-token-abc123';
    const encrypted = encryptGoogleAdsToken(token);

    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe(token);
    expect(encrypted).toMatch(/^v1\./);
  });

  it('produces unique IV per encryption (different ciphertext each time)', () => {
    const token = 'same-token';
    const e1 = encryptGoogleAdsToken(token);
    const e2 = encryptGoogleAdsToken(token);

    expect(e1).not.toBe(e2);
  });

  it('decrypts a versioned token back to original value', () => {
    const token = 'super-secret-refresh-token';
    const encrypted = encryptGoogleAdsToken(token);
    const decrypted = decryptGoogleAdsToken(encrypted);

    expect(decrypted).toBe(token);
  });

  it('returns null/undefined for empty input on encrypt', () => {
    expect(encryptGoogleAdsToken(null)).toBeNull();
    expect(encryptGoogleAdsToken(undefined)).toBeUndefined();
    expect(encryptGoogleAdsToken('')).toBe('');
  });

  it('returns null for empty input on decrypt', () => {
    expect(decryptGoogleAdsToken(null)).toBeNull();
    expect(decryptGoogleAdsToken('')).toBeNull();
    expect(decryptGoogleAdsToken(undefined)).toBeNull();
  });

  it('returns plaintext when no encryption key is configured', () => {
    delete process.env.GOOGLE_ADS_TOKEN_ENCRYPTION_KEY;
    const token = 'plaintext-fallback';
    const encrypted = encryptGoogleAdsToken(token);

    expect(encrypted).toBe(token);
  });

  it('returns plaintext when decrypting unsigned token', () => {
    const token = 'legacy-plaintext-token';
    const decrypted = decryptGoogleAdsToken(token);

    expect(decrypted).toBe(token);
  });

  it('handles special characters in token', () => {
    const token = 'token!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
    const encrypted = encryptGoogleAdsToken(token);
    const decrypted = decryptGoogleAdsToken(encrypted);

    expect(decrypted).toBe(token);
  });

  it('handles unicode characters in token', () => {
    const token = 'token-áéíóú-日本語-中文';
    const encrypted = encryptGoogleAdsToken(token);
    const decrypted = decryptGoogleAdsToken(encrypted);

    expect(decrypted).toBe(token);
  });

  it('handles long tokens (> 1000 chars)', () => {
    const token = 'a'.repeat(2000);
    const encrypted = encryptGoogleAdsToken(token);
    const decrypted = decryptGoogleAdsToken(encrypted);

    expect(decrypted).toBe(token);
  });

  it('isEncryptedGoogleAdsToken identifies versioned tokens', () => {
    const encrypted = encryptGoogleAdsToken('a-token');
    expect(isEncryptedGoogleAdsToken(encrypted as string)).toBe(true);
  });

  it('isEncryptedGoogleAdsToken rejects plaintext', () => {
    expect(isEncryptedGoogleAdsToken('plaintext')).toBe(false);
    expect(isEncryptedGoogleAdsToken('')).toBe(false);
    expect(isEncryptedGoogleAdsToken('v1.notbase64!!!')).toBe(false);
  });

  it('supports key rotation — decrypt v1 with current key', () => {
    const token = 'token-for-key-rotation';
    const encrypted = encryptGoogleAdsToken(token);
    const decrypted = decryptGoogleAdsToken(encrypted);

    expect(decrypted).toBe(token);
  });

  it('fails decryption gracefully with corrupted ciphertext', () => {
    const encrypted = encryptGoogleAdsToken('valid-token');
    const corrupted = (encrypted as string).replace(
      (encrypted as string).substring(10, 14),
      'XXXX',
    );

    const result = decryptGoogleAdsToken(corrupted);
    expect(result).toBe(corrupted);
  });
});
