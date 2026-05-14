import { normalizeReturnTo, expiresAtFromSeconds, signState, verifyState } from './oauth-state';

describe('oauth-state', () => {
  const secret = ['test', 'state', 'signing', 'key'].join('-');
  const wrongSecret = ['wrong', 'signing', 'key'].join('-');

  describe('normalizeReturnTo', () => {
    it('returns valid path unchanged', () => {
      expect(normalizeReturnTo('/marketing/email')).toBe('/marketing/email');
    });

    it('returns default for empty value', () => {
      expect(normalizeReturnTo('')).toBe('/marketing/email');
    });

    it('returns default for protocol-relative URLs', () => {
      expect(normalizeReturnTo('//evil.com')).toBe('/marketing/email');
    });

    it('returns default for absolute URLs', () => {
      expect(normalizeReturnTo('https://evil.com')).toBe('/marketing/email');
    });

    it('caps at 200 characters', () => {
      const long = '/' + 'a'.repeat(300);
      expect(normalizeReturnTo(long)).toHaveLength(200);
    });
  });

  describe('expiresAtFromSeconds', () => {
    it('returns future date for positive seconds', () => {
      const result = expiresAtFromSeconds(3600);
      expect(result).toBeInstanceOf(Date);
      expect(result!.getTime()).toBeGreaterThan(Date.now());
    });

    it('returns null for zero', () => {
      expect(expiresAtFromSeconds(0)).toBeNull();
    });

    it('returns null for negative', () => {
      expect(expiresAtFromSeconds(-1)).toBeNull();
    });

    it('returns null for non-numeric', () => {
      expect(expiresAtFromSeconds('abc')).toBeNull();
    });
  });

  describe('signState and verifyState', () => {
    it('round-trips a valid state', () => {
      const payload = { workspaceId: 'ws-1', returnTo: '/dashboard', ts: Date.now() };
      const signed = signState(payload, secret);
      const verified = verifyState(signed, secret);

      expect(verified).not.toBeNull();
      expect(verified!.workspaceId).toBe('ws-1');
      expect(verified!.returnTo).toBe('/dashboard');
    });

    it('rejects tampered state', () => {
      const signed = signState({ workspaceId: 'ws-1', returnTo: '/a', ts: Date.now() }, secret);
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          workspaceId: 'ws-2',
          returnTo: '/b',
          ts: Date.now(),
        }),
      ).toString('base64url');
      const tampered = tamperedPayload + '.' + signed.split('.')[1];

      expect(verifyState(tampered, secret)).toBeNull();
    });

    it('rejects state with wrong secret', () => {
      const payload = { workspaceId: 'ws-1', returnTo: '/', ts: Date.now() };
      const signed = signState(payload, secret);
      expect(verifyState(signed, wrongSecret)).toBeNull();
    });

    it('rejects expired state', () => {
      const payload = {
        workspaceId: 'ws-1',
        returnTo: '/',
        ts: Date.now() - 11 * 60 * 1000,
      };
      const signed = signState(payload, secret);
      expect(verifyState(signed, secret)).toBeNull();
    });

    it('rejects empty state string', () => {
      expect(verifyState('', secret)).toBeNull();
    });

    it('rejects state without signature', () => {
      const encoded = Buffer.from(
        JSON.stringify({ workspaceId: 'ws-1', returnTo: '/', ts: Date.now() }),
      ).toString('base64url');
      expect(verifyState(encoded, secret)).toBeNull();
    });
  });
});
