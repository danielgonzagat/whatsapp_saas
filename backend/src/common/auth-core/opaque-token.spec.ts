import { createHash, randomBytes } from 'node:crypto';

import { generateOpaqueToken, hashOpaqueToken, sha256Hex } from './opaque-token';

/**
 * Guards the byte-identity contract of the shared auth-core opaque-token codec
 * against the pre-extraction inline implementations it replaced across the
 * tenant auth stack (auth-service.helpers.ts, auth-partner.service.ts,
 * auth-verification.service.ts) and partnerships.crypto.helpers.ts, plus the
 * admin-crypto sha256Hex form. If any of these drift, a security fix to the
 * hashing primitive would no longer propagate uniformly.
 */
describe('auth-core/opaque-token', () => {
  describe('sha256Hex', () => {
    it('matches the legacy explicit-utf8 admin form byte-for-byte', () => {
      const input = 'refresh-token-abc123';
      const legacyAdmin = createHash('sha256').update(input, 'utf8').digest('hex');
      expect(sha256Hex(input)).toBe(legacyAdmin);
    });

    it('matches the legacy no-encoding tenant form byte-for-byte', () => {
      const input = 'magic-link-token-xyz';
      // Node defaults createHash().update(string) to utf8, so the tenant form
      // (no explicit encoding) is identical.
      const legacyTenant = createHash('sha256').update(input).digest('hex');
      expect(sha256Hex(input)).toBe(legacyTenant);
    });

    it('is deterministic', () => {
      expect(sha256Hex('hello')).toBe(sha256Hex('hello'));
    });

    it('returns a canonical 64-char lowercase hex digest', () => {
      const out = sha256Hex('whatever');
      expect(out).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(out)).toBe(true);
    });
  });

  describe('hashOpaqueToken', () => {
    it('is an exact alias of sha256Hex', () => {
      const token = 'arbitrary token';
      expect(hashOpaqueToken(token)).toBe(sha256Hex(token));
    });

    it('matches the legacy inline tenant formula byte-for-byte', () => {
      const token = 'partner-invite-token';
      const legacy = createHash('sha256').update(token).digest('hex');
      expect(hashOpaqueToken(token)).toBe(legacy);
    });

    it('emits distinct hashes for distinct inputs', () => {
      expect(hashOpaqueToken('token-a')).not.toBe(hashOpaqueToken('token-b'));
    });
  });

  describe('generateOpaqueToken', () => {
    it('returns a base64url string with no +, /, or = padding', () => {
      expect(/^[A-Za-z0-9_-]+$/.test(generateOpaqueToken())).toBe(true);
    });

    it('emits 43 chars for the default 32-byte size (matches legacy randomBytes(32))', () => {
      expect(generateOpaqueToken()).toHaveLength(43);
      // Sanity-check the legacy formula produces the same length contract.
      expect(randomBytes(32).toString('base64url')).toHaveLength(43);
    });

    it('honors the requested byte size', () => {
      expect(generateOpaqueToken(16)).toHaveLength(22);
    });

    it('produces a fresh token on each call', () => {
      expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
    });
  });
});
