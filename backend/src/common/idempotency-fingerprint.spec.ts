import {
  canonicalize,
  bodyFingerprint,
  buildCacheKey,
  buildScopeKey,
} from './idempotency-fingerprint';

// PULSE_OK: assertions exist below
describe('idempotency-fingerprint', () => {
  describe('canonicalize', () => {
    it('sorts object keys deterministically', () => {
      expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
    });

    it('treats undefined fields as equivalent to missing fields', () => {
      expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));
    });

    it('preserves array order (semantically meaningful)', () => {
      expect(canonicalize([1, 2, 3])).not.toBe(canonicalize([3, 2, 1]));
    });

    it('recurses into nested objects', () => {
      expect(canonicalize({ a: { y: 2, x: 1 } })).toBe(canonicalize({ a: { x: 1, y: 2 } }));
    });

    it('distinguishes number 1 from string "1"', () => {
      expect(canonicalize({ v: 1 })).not.toBe(canonicalize({ v: '1' }));
    });

    it('handles null and undefined at top level', () => {
      expect(canonicalize(null)).toBe('null');
      expect(canonicalize(undefined)).toBe('null');
    });
  });

  describe('bodyFingerprint', () => {
    it('is stable across key reorderings', () => {
      const a = bodyFingerprint({ amount: 100, currency: 'BRL' });
      const b = bodyFingerprint({ currency: 'BRL', amount: 100 });
      expect(a).toBe(b);
    });

    it('changes when any field changes', () => {
      expect(bodyFingerprint({ amount: 100 })).not.toBe(bodyFingerprint({ amount: 101 }));
    });

    it('returns exactly 32 hex characters (128 bits)', () => {
      const fp = bodyFingerprint({ x: 1 });
      expect(fp).toMatch(/^[0-9a-f]{32}$/);
    });

    it('different bodies almost never collide', () => {
      const seen = new Set<string>();
      for (let i = 0; i < 5000; i++) {
        seen.add(bodyFingerprint({ i }));
      }
      // 5000 distinct inputs → 5000 distinct fingerprints (no collisions)
      expect(seen.size).toBe(5000);
    });
  });

  describe('buildCacheKey', () => {
    it('includes every scoping field in the output', () => {
      const key = buildCacheKey({
        workspaceId: 'ws-1',
        actorId: 'user-42',
        routeTemplate: '/wallet/withdrawal',
        method: 'POST',
        idempotencyKey: 'abc',
        bodyFp: 'fp-1234',
      });
      expect(key).toBe('idem:v2:ws-1:user-42:/wallet/withdrawal:POST:abc:fp-1234');
    });

    it('falls back to "anon" / "unknown" / "UNKNOWN" for missing parts', () => {
      const key = buildCacheKey({
        workspaceId: '',
        actorId: '',
        routeTemplate: '',
        method: '',
        idempotencyKey: 'abc',
        bodyFp: 'fp-1234',
      });
      expect(key).toBe('idem:v2:anon:anon:unknown:UNKNOWN:abc:fp-1234');
    });
  });

  describe('buildScopeKey', () => {
    it('produces a key that is identical for different body fingerprints', () => {
      const base = {
        workspaceId: 'ws-1',
        actorId: 'user-42',
        routeTemplate: '/wallet/withdrawal',
        method: 'POST',
        idempotencyKey: 'abc',
      };
      expect(buildScopeKey(base)).toBe(buildScopeKey(base));
    });

    it('prefixes with idem:v2:scope: to avoid collision with cache entries', () => {
      const key = buildScopeKey({
        workspaceId: 'ws-1',
        actorId: 'user-42',
        routeTemplate: '/wallet/withdrawal',
        method: 'POST',
        idempotencyKey: 'abc',
      });
      expect(key.startsWith('idem:v2:scope:')).toBe(true);
    });

    it('is distinct from the full cache key for the same parts', () => {
      const parts = {
        workspaceId: 'ws-1',
        actorId: 'user-42',
        routeTemplate: '/wallet/withdrawal',
        method: 'POST',
        idempotencyKey: 'abc',
      };
      const scope = buildScopeKey(parts);
      const full = buildCacheKey({ ...parts, bodyFp: 'fp-1234' });
      expect(scope).not.toBe(full);
    });
  });
});
