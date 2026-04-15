import { randomBytes } from 'node:crypto';
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

    it('rejects non-hex keys', () => {
      expect(() => encryptAdminSecret('x', 'not-hex!')).toThrow(/hex/);
    });

    it('rejects keys of wrong length', () => {
      const shortKey = randomBytes(16).toString('hex');
      expect(() => encryptAdminSecret('x', shortKey)).toThrow(/32 bytes/);
    });

    it('rejects malformed ciphertext', () => {
      const key = randomKeyHex();
      expect(() => decryptAdminSecret('not.enough', key)).toThrow(/malformed/);
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
