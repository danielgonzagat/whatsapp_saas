import {
  decryptCheckoutPixelToken,
  encryptCheckoutPixelToken,
  resolveCheckoutPixelEncryptionKey,
} from './checkout-pixel-crypto';

describe('checkout-pixel-crypto', () => {
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

  it('resolves ENCRYPTION_KEY before PROVIDER_SECRET_KEY', () => {
    process.env.ENCRYPTION_KEY = 'checkout-encryption-key';
    process.env.PROVIDER_SECRET_KEY = 'provider-secret-key';

    expect(resolveCheckoutPixelEncryptionKey()).toBe('checkout-encryption-key');
  });

  it('round-trips checkout pixel tokens when ENCRYPTION_KEY is configured', () => {
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef';

    const encrypted = encryptCheckoutPixelToken('pixel-token-value');

    expect(encrypted).not.toBe('pixel-token-value');
    expect(decryptCheckoutPixelToken(encrypted)).toBe('pixel-token-value');
  });

  it('returns plaintext values unchanged when no encryption key is configured', () => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.PROVIDER_SECRET_KEY;

    expect(encryptCheckoutPixelToken('pixel-token-value')).toBe('pixel-token-value');
    expect(decryptCheckoutPixelToken('pixel-token-value')).toBe('pixel-token-value');
  });
});
