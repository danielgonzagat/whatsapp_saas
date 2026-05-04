import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import {
  decryptAdminSecret,
  encryptAdminSecret,
  generateRawRefreshToken,
  sha256Hex,
} from './admin-crypto';

function randomKeyHex(): string {
  return randomBytes(32).toString('hex');
}

describe('admin-crypto', () => {
  describe('encrypt/decrypt round trip', () => {
    it('recovers the original plaintext', () => {
      const key = randomKeyHex();
      const plaintext = 'JBSWY3DPEHPK3PXP'; // typical TOTP secret
      const ciphertext = encryptAdminSecret(plaintext, key);
      expect(ciphertext).not.toContain(plaintext);
      expect(decryptAdminSecret(ciphertext, key)).toBe(plaintext);
    });

    it('produces a different ciphertext each time (random IV)', () => {
      const key = randomKeyHex();
      const plaintext = 'same plaintext';
      const a = encryptAdminSecret(plaintext, key);
      const b = encryptAdminSecret(plaintext, key);
      expect(a).not.toBe(b);
      expect(decryptAdminSecret(a, key)).toBe(plaintext);
      expect(decryptAdminSecret(b, key)).toBe(plaintext);
    });

    it('throws when the ciphertext is tampered', () => {
      const key = randomKeyHex();
      const ct = encryptAdminSecret('hello world', key);
      const tampered = ct.slice(0, -4) + 'AAAA';
      expect(() => decryptAdminSecret(tampered, key)).toThrow();
    });

    it('throws when decrypted with the wrong key', () => {
      const key1 = randomKeyHex();
      const key2 = randomKeyHex();
      const ct = encryptAdminSecret('secret', key1);
      expect(() => decryptAdminSecret(ct, key2)).toThrow();
    });

    it('accepts non-hex passphrase keys by deriving via PBKDF2', () => {
      // The operator may set a human-friendly passphrase in Railway;
      // the crypto layer should still encrypt/decrypt round-trip.
      const ct = encryptAdminSecret('x', 'my-passphrase-shorter-than-64-chars');
      expect(decryptAdminSecret(ct, 'my-passphrase-shorter-than-64-chars')).toBe('x');
    });

    it('derives the same key from the same raw string', () => {
      const raw = 'consistent-passphrase';
      const ct = encryptAdminSecret('same-plaintext', raw);
      expect(decryptAdminSecret(ct, raw)).toBe('same-plaintext');
    });

    it('rejects empty keys', () => {
      expect(() => encryptAdminSecret('x', '')).toThrow(/non-empty/);
      expect(() => encryptAdminSecret('x', '   ')).toThrow(/non-empty/);
    });

    it('rejects malformed ciphertext', () => {
      const key = randomKeyHex();
      expect(() => decryptAdminSecret('not.enough', key)).toThrow(/malformed/);
    });
    it('decrypts legacy SHA-256 ciphertexts (migration path)', () => {
      const raw = 'old-legacy-passphrase';
      const legacyKey = createHash('sha256').update(raw, 'utf8').digest();
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', legacyKey, iv);
      const ct = Buffer.concat([cipher.update('legacy secret', 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      const toBase64Url = (buf: Buffer) =>
        buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const legacyCiphertext = [toBase64Url(iv), toBase64Url(tag), toBase64Url(ct)].join('.');
      expect(decryptAdminSecret(legacyCiphertext, raw)).toBe('legacy secret');
    });
  });

  describe('sha256Hex', () => {
    it('is deterministic for the same input', () => {
      expect(sha256Hex('hello')).toBe(sha256Hex('hello'));
    });

    it('produces a 64-char hex string', () => {
      const out = sha256Hex('whatever');
      expect(out).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('generateRawRefreshToken', () => {
    it('produces distinct url-safe strings', () => {
      const a = generateRawRefreshToken();
      const b = generateRawRefreshToken();
      expect(a).not.toBe(b);
      expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(a.length).toBeGreaterThanOrEqual(32);
    });
  });
});
