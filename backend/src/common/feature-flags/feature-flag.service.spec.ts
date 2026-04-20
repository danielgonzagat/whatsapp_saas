import { FeatureFlagService } from './feature-flag.service';

describe('FeatureFlagService — invariant: rollback levers always reachable (P5-1)', () => {
  let service: FeatureFlagService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    service = new FeatureFlagService();
  });

  afterEach(() => {
    // Restore env var state so tests don't pollute each other
    for (const key of Object.keys(process.env)) {
      if (key.startsWith('FF_')) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  describe('default values', () => {
    it('every registered flag defaults to true (rollback semantics)', () => {
      const snap = service.snapshot();
      // Every value must be a boolean (no undefined leaking)
      for (const [, value] of Object.entries(snap)) {
        expect(typeof value).toBe('boolean');
      }
      // Specifically: every default is true so the new (hardened)
      // behavior is the active path until an operator flips a flag.
      for (const [, value] of Object.entries(snap)) {
        expect(value).toBe(true);
      }
    });

    it('snapshot includes the 5 registered hardening flags', () => {
      const snap = service.snapshot();
      expect(Object.keys(snap)).toContain('payment.failClosedUnknownState');
      expect(Object.keys(snap)).toContain('idempotency.awaitWrite');
      expect(Object.keys(snap)).toContain('auth.failClosedRateLimit');
      expect(Object.keys(snap)).toContain('webhook.atomicDedup');
      expect(Object.keys(snap)).toContain('whatsapp.strictLock');
    });
  });

  describe('env var override', () => {
    it('FF_PAYMENT__FAILCLOSEDUNKNOWNSTATE=false flips the flag off', () => {
      process.env.FF_PAYMENT__FAILCLOSEDUNKNOWNSTATE = 'false';
      expect(service.isEnabled('payment.failClosedUnknownState')).toBe(false);
    });

    it('FF_PAYMENT__FAILCLOSEDUNKNOWNSTATE=true keeps the flag on', () => {
      process.env.FF_PAYMENT__FAILCLOSEDUNKNOWNSTATE = 'true';
      expect(service.isEnabled('payment.failClosedUnknownState')).toBe(true);
    });

    it('env var values are case-insensitive and trimmed', () => {
      process.env.FF_PAYMENT__FAILCLOSEDUNKNOWNSTATE = '  FALSE  ';
      expect(service.isEnabled('payment.failClosedUnknownState')).toBe(false);
      process.env.FF_PAYMENT__FAILCLOSEDUNKNOWNSTATE = 'True';
      expect(service.isEnabled('payment.failClosedUnknownState')).toBe(true);
    });

    it('unrecognized env var values fall through to the default', () => {
      process.env.FF_PAYMENT__FAILCLOSEDUNKNOWNSTATE = 'maybe';
      expect(service.isEnabled('payment.failClosedUnknownState')).toBe(true);
    });

    it('different flags use different env var names', () => {
      process.env.FF_AUTH__FAILCLOSEDRATELIMIT = 'false';
      expect(service.isEnabled('auth.failClosedRateLimit')).toBe(false);
      // Other flags unaffected
      expect(service.isEnabled('payment.failClosedUnknownState')).toBe(true);
    });
  });

  describe('unknown flag protection', () => {
    it('throws when asked about a flag that is not in FLAG_DEFAULTS', () => {
      expect(() => service.isEnabled('not.a.real.flag')).toThrow(/Unknown feature flag/);
    });
  });

  describe('snapshot reflects env var overrides', () => {
    it('snapshot returns the effective values, not the defaults', () => {
      process.env.FF_AUTH__FAILCLOSEDRATELIMIT = 'false';
      process.env.FF_WHATSAPP__STRICTLOCK = 'false';
      const snap = service.snapshot();
      expect(snap['auth.failClosedRateLimit']).toBe(false);
      expect(snap['whatsapp.strictLock']).toBe(false);
      // Untouched flags still default to true
      expect(snap['payment.failClosedUnknownState']).toBe(true);
    });
  });
});
