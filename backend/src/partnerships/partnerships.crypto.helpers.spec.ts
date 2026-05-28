import { createHash } from 'node:crypto';
import { generateOpaqueToken, hashOpaqueToken } from './partnerships.crypto.helpers';

describe('partnerships.crypto.helpers', () => {
  describe('generateOpaqueToken', () => {
    it('returns a base64url string (no +, /, or = padding)', () => {
      const token = generateOpaqueToken();
      expect(/^[A-Za-z0-9_-]+$/.test(token)).toBe(true);
    });

    it('emits ~43 characters for the default 32-byte size', () => {
      const token = generateOpaqueToken();
      // 32 bytes → 43 base64url chars (no padding)
      expect(token.length).toBe(43);
    });

    it('honors the requested byte size', () => {
      const token = generateOpaqueToken(16);
      // 16 bytes → 22 base64url chars
      expect(token.length).toBe(22);
    });

    it('produces a fresh token on each call', () => {
      const a = generateOpaqueToken();
      const b = generateOpaqueToken();
      expect(a).not.toBe(b);
    });
  });

  describe('hashOpaqueToken', () => {
    it('produces a deterministic sha256 hex digest for a known input', () => {
      const expected = createHash('sha256').update('hello').digest('hex');
      expect(hashOpaqueToken('hello')).toBe(expected);
    });

    it('returns the canonical 64-character hex string', () => {
      const hash = hashOpaqueToken('arbitrary token');
      expect(hash.length).toBe(64);
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });

    it('emits distinct hashes for distinct inputs', () => {
      const a = hashOpaqueToken('token-a');
      const b = hashOpaqueToken('token-b');
      expect(a).not.toBe(b);
    });
  });
});
