import { encryptString } from '../lib/crypto';
import {
  decryptMetaConnectionToken,
  encryptMetaConnectionToken,
  resolveMetaConnectionEncryptionKey,
} from './meta-token-crypto';

describe('meta token crypto', () => {
  const originalEncryptionKey = process.env.ENCRYPTION_KEY;
  const originalProviderSecretKey = process.env.PROVIDER_SECRET_KEY;

  afterEach(() => {
    if (typeof originalEncryptionKey === 'string') {
      process.env.ENCRYPTION_KEY = originalEncryptionKey;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }

    if (typeof originalProviderSecretKey === 'string') {
      process.env.PROVIDER_SECRET_KEY = originalProviderSecretKey;
    } else {
      delete process.env.PROVIDER_SECRET_KEY;
    }
  });

  it('prefers ENCRYPTION_KEY and round-trips Meta tokens', () => {
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';
    process.env.PROVIDER_SECRET_KEY = 'legacy-provider-key';

    const ciphertext = encryptMetaConnectionToken('meta-user-token');

    expect(ciphertext).not.toBe('meta-user-token');
    expect(decryptMetaConnectionToken(ciphertext)).toBe('meta-user-token');
    expect(resolveMetaConnectionEncryptionKey()).toBe('0123456789abcdef0123456789abcdef');
  });

  it('falls back to PROVIDER_SECRET_KEY and safely decrypts already-encrypted legacy values', () => {
    delete process.env.ENCRYPTION_KEY;
    process.env.PROVIDER_SECRET_KEY = 'legacy-provider-key';

    const encrypted = encryptString('meta-page-token', 'legacy-provider-key');

    expect(decryptMetaConnectionToken(encrypted)).toBe('meta-page-token');
  });

  it('returns plaintext unchanged when no encryption key is configured', () => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.PROVIDER_SECRET_KEY;

    expect(encryptMetaConnectionToken('meta-plaintext-token')).toBe('meta-plaintext-token');
    expect(decryptMetaConnectionToken('meta-plaintext-token')).toBe('meta-plaintext-token');
  });
});
