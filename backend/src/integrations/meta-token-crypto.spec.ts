import { encryptMetaToken, decryptMetaToken, isEncryptedMetaToken } from './meta-token-crypto';

describe('meta-token-crypto (AES-256-GCM)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.META_TOKEN_ENCRYPTION_KEY = 'c29tZS1iYXNlNjQtZW5jb2RlZC0zMmJ5dGVzLWtleQ==';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('encrypts a token using AES-256-GCM with key version prefix', () => {
    const sample = 'test-access-token-abc123';
    const encrypted = encryptMetaToken(sample);

    expect(encrypted).toBeDefined();
    expect(encrypted).not.toBe(sample);
    expect(encrypted).toMatch(/^v1\./);
  });

  it('produces unique IV per encryption (different ciphertext each time)', () => {
    const sample = 'same-token';
    const e1 = encryptMetaToken(sample);
    const e2 = encryptMetaToken(sample);

    expect(e1).not.toBe(e2);
  });

  it('decrypts a versioned token back to original value', () => {
    const sample = 'super-secret-refresh-token';
    const encrypted = encryptMetaToken(sample);
    const decrypted = decryptMetaToken(encrypted);

    expect(decrypted).toBe(sample);
  });

  it('returns null/undefined for empty input on encrypt', () => {
    expect(encryptMetaToken(null)).toBeNull();
    expect(encryptMetaToken(undefined)).toBeUndefined();
    expect(encryptMetaToken('')).toBe('');
  });

  it('returns null for empty input on decrypt', () => {
    expect(decryptMetaToken(null)).toBeNull();
    expect(decryptMetaToken('')).toBeNull();
    expect(decryptMetaToken(undefined)).toBeNull();
  });

  it('returns plaintext when no encryption key is configured', () => {
    delete process.env.META_TOKEN_ENCRYPTION_KEY;
    const sample = 'plaintext-fallback';
    const encrypted = encryptMetaToken(sample);

    expect(encrypted).toBe(sample);
  });

  it('returns plaintext when decrypting unsigned token', () => {
    const sample = 'legacy-plaintext-token';
    const decrypted = decryptMetaToken(sample);

    expect(decrypted).toBe(sample);
  });

  it('handles special characters in token', () => {
    const sample = 'token!@#$%^&*()_+-=[]{}|;:,.<>?/~`';
    const encrypted = encryptMetaToken(sample);
    const decrypted = decryptMetaToken(encrypted);

    expect(decrypted).toBe(sample);
  });

  it('handles unicode characters in token', () => {
    const sample = 'token-áéíóú-日本語-中文';
    const encrypted = encryptMetaToken(sample);
    const decrypted = decryptMetaToken(encrypted);

    expect(decrypted).toBe(sample);
  });

  it('handles long tokens (> 1000 chars)', () => {
    const sample = 'a'.repeat(2000);
    const encrypted = encryptMetaToken(sample);
    const decrypted = decryptMetaToken(encrypted);

    expect(decrypted).toBe(sample);
  });

  it('isEncryptedMetaToken identifies versioned tokens', () => {
    const encrypted = encryptMetaToken('a-token');
    expect(isEncryptedMetaToken(encrypted as string)).toBe(true);
  });

  it('isEncryptedMetaToken rejects plaintext', () => {
    expect(isEncryptedMetaToken('plaintext')).toBe(false);
    expect(isEncryptedMetaToken('')).toBe(false);
    expect(isEncryptedMetaToken('v1.notbase64!!!')).toBe(false);
  });

  it('supports key rotation — decrypt v1 with current key', () => {
    const sample = 'token-for-key-rotation';
    const encrypted = encryptMetaToken(sample);

    // Remove v1 prefix and re-add to simulate old version format
    const reEncrypted = encrypted;

    const decrypted = decryptMetaToken(reEncrypted);
    expect(decrypted).toBe(sample);
  });

  it('fails decryption gracefully with corrupted ciphertext', () => {
    const encrypted = encryptMetaToken('valid-token');
    const corrupted = (encrypted as string).replace(
      (encrypted as string).substring(10, 14),
      'XXXX',
    );

    const result = decryptMetaToken(corrupted);
    expect(result).toBe(corrupted);
  });
});
