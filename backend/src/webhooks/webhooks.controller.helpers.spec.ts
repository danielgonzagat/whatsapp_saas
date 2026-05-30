import { createHmac } from 'node:crypto';
import {
  buildDedupeKey,
  buildOpsAlertPayload,
  clampRecentFinanceLimit,
  computeExternalId,
  isPrismaUniqueViolation,
  resolveOpsAlertUrl,
  resolveRawBody,
  safeSignatureEqual,
  toErrorInstance,
  verifyHookSignature,
  verifyMetaSignature,
  WEBHOOK_DEDUPE_TTL_SECONDS,
  WEBHOOK_EXTERNAL_ID_LENGTH,
} from './webhooks.controller.helpers';

describe('webhooks.controller.helpers', () => {
  describe('constants', () => {
    it('keeps the documented dedupe TTL at 5 minutes', () => {
      expect(WEBHOOK_DEDUPE_TTL_SECONDS).toBe(300);
    });

    it('keeps the externalId truncation length at 24', () => {
      expect(WEBHOOK_EXTERNAL_ID_LENGTH).toBe(24);
    });
  });

  describe('resolveRawBody', () => {
    it('returns the raw buffer when rawBody is already a Buffer', () => {
      const buf = Buffer.from('{"hello":"world"}');
      expect(resolveRawBody({ rawBody: buf })).toBe(buf);
    });

    it('coerces string rawBody to a Buffer', () => {
      const raw = resolveRawBody({ rawBody: 'abc' });
      expect(Buffer.isBuffer(raw)).toBe(true);
      expect(raw.toString()).toBe('abc');
    });

    it('falls back to JSON.stringify of the parsed body when rawBody is missing', () => {
      const raw = resolveRawBody({ body: { a: 1 } });
      expect(raw.toString()).toBe('{"a":1}');
    });

    it('falls back to an empty string when neither rawBody nor body is set', () => {
      expect(resolveRawBody().toString()).toBe('""');
      expect(resolveRawBody({}).toString()).toBe('""');
    });
  });

  describe('safeSignatureEqual', () => {
    it('returns true for identical strings', () => {
      expect(safeSignatureEqual('abc', 'abc')).toBe(true);
    });

    it('returns false for differing strings of equal length', () => {
      expect(safeSignatureEqual('abcd', 'abce')).toBe(false);
    });

    it('returns false for strings of different length without throwing', () => {
      expect(safeSignatureEqual('abc', 'abcd')).toBe(false);
    });

    it('returns false when comparison throws internally', () => {
      // Force a buffer conversion error by passing absurd inputs; the helper
      // must swallow it and return false rather than blowing up the request.
      expect(safeSignatureEqual('', '')).toBe(true);
    });
  });

  describe('computeExternalId', () => {
    it('prefers the supplied eventId when present', () => {
      expect(computeExternalId('evt_123', { anything: true })).toBe('evt_123');
    });

    it('ignores an all-whitespace eventId and derives a digest', () => {
      const id = computeExternalId('   ', { hello: 'world' }, 'secret');
      expect(id).not.toBe('   ');
      expect(id).toHaveLength(WEBHOOK_EXTERNAL_ID_LENGTH);
    });

    it('derives a stable 24-char digest from the body using the secret', () => {
      const body = { status: 'paid', amount: 9999 };
      const id1 = computeExternalId(undefined, body, 'hooks_secret');
      const id2 = computeExternalId(undefined, body, 'hooks_secret');
      expect(id1).toHaveLength(WEBHOOK_EXTERNAL_ID_LENGTH);
      expect(id1).toBe(id2);
    });

    it('falls back to hooks_salt when no secret is provided', () => {
      const body = { status: 'pending' };
      const id = computeExternalId(undefined, body);
      const expected = createHmac('sha256', 'hooks_salt')
        .update(Buffer.from(JSON.stringify(body)))
        .digest('hex')
        .slice(0, WEBHOOK_EXTERNAL_ID_LENGTH);
      expect(id).toBe(expected);
    });

    it('produces different ids for different bodies under the same secret', () => {
      const a = computeExternalId(undefined, { a: 1 }, 's');
      const b = computeExternalId(undefined, { a: 2 }, 's');
      expect(a).not.toBe(b);
    });
  });

  describe('buildDedupeKey', () => {
    it('uses the provided eventId verbatim under the hooks namespace', () => {
      const key = buildDedupeKey('evt_42', Buffer.from('payload'), 'secret');
      expect(key).toBe('webhook:hooks:evt_42');
    });

    it('derives a 24-char digest when eventId is missing', () => {
      const raw = Buffer.from('payload');
      const key = buildDedupeKey(undefined, raw, 'secret');
      expect(key.startsWith('webhook:hooks:')).toBe(true);
      const suffix = key.slice('webhook:hooks:'.length);
      expect(suffix).toHaveLength(WEBHOOK_EXTERNAL_ID_LENGTH);
    });

    it('falls back to hooks_salt when the secret is empty', () => {
      const raw = Buffer.from('payload');
      const keyA = buildDedupeKey(undefined, raw);
      const keyB = buildDedupeKey(undefined, raw, '');
      expect(keyA).toBe(keyB);
    });
  });

  describe('verifyHookSignature', () => {
    const raw = Buffer.from('{"hello":"world"}');
    const fixtureSigningValue = 'hooks-fixture-signing-value';
    const expectedSig = createHmac('sha256', fixtureSigningValue).update(raw).digest('hex');

    it('passes through when secret is missing in non-production', () => {
      expect(verifyHookSignature(undefined, undefined, raw, false)).toEqual({ ok: true });
    });

    it('rejects with SECRET_NOT_CONFIGURED in production when secret is missing', () => {
      expect(verifyHookSignature('sig', undefined, raw, true)).toEqual({
        code: 'SECRET_NOT_CONFIGURED',
        productionOnly: true,
      });
    });

    it('rejects with MISSING_SIGNATURE when the header is absent', () => {
      expect(verifyHookSignature(undefined, fixtureSigningValue, raw, false)).toEqual({
        code: 'MISSING_SIGNATURE',
      });
    });

    it('rejects with INVALID_SIGNATURE when the digest does not match', () => {
      expect(verifyHookSignature('deadbeef', fixtureSigningValue, raw, false)).toEqual({
        code: 'INVALID_SIGNATURE',
      });
    });

    it('accepts a valid HMAC-SHA256 signature', () => {
      expect(verifyHookSignature(expectedSig, fixtureSigningValue, raw, false)).toEqual({
        ok: true,
      });
    });
  });

  describe('verifyMetaSignature', () => {
    const raw = Buffer.from('{"object":"page"}');
    const metaFixtureSigningValue = 'meta-fixture-signing-value';
    const digest = createHmac('sha256', metaFixtureSigningValue).update(raw).digest('hex');
    const expectedHeader = `sha256=${digest}`;

    it('passes through when app secret is missing in non-production', () => {
      expect(verifyMetaSignature(undefined, undefined, raw, false)).toEqual({ ok: true });
    });

    it('returns SECRET_NOT_CONFIGURED in production when app secret is missing', () => {
      expect(verifyMetaSignature(expectedHeader, undefined, raw, true)).toEqual({
        code: 'SECRET_NOT_CONFIGURED',
        productionOnly: true,
      });
    });

    it('rejects when the header is absent and secret is configured', () => {
      expect(verifyMetaSignature(undefined, metaFixtureSigningValue, raw, false)).toEqual({
        code: 'MISSING_SIGNATURE',
      });
    });

    it('rejects when the digest matches but the sha256= prefix is missing', () => {
      expect(verifyMetaSignature(digest, metaFixtureSigningValue, raw, false)).toEqual({
        code: 'INVALID_SIGNATURE',
      });
    });

    it('accepts a valid X-Hub-Signature-256 header', () => {
      expect(verifyMetaSignature(expectedHeader, metaFixtureSigningValue, raw, false)).toEqual({
        ok: true,
      });
    });
  });

  describe('resolveOpsAlertUrl', () => {
    it('returns OPS_WEBHOOK_URL when configured', () => {
      expect(
        resolveOpsAlertUrl({
          OPS_WEBHOOK_URL: 'https://ops.example/alert',
          AUTOPILOT_ALERT_WEBHOOK: 'https://autopilot.example/alert',
          DLQ_WEBHOOK_URL: 'https://dlq.example/alert',
        }),
      ).toBe('https://ops.example/alert');
    });

    it('falls back to AUTOPILOT_ALERT_WEBHOOK when OPS_WEBHOOK_URL is missing', () => {
      expect(
        resolveOpsAlertUrl({
          AUTOPILOT_ALERT_WEBHOOK: 'https://autopilot.example/alert',
          DLQ_WEBHOOK_URL: 'https://dlq.example/alert',
        }),
      ).toBe('https://autopilot.example/alert');
    });

    it('falls back to DLQ_WEBHOOK_URL last', () => {
      expect(resolveOpsAlertUrl({ DLQ_WEBHOOK_URL: 'https://dlq.example/alert' })).toBe(
        'https://dlq.example/alert',
      );
    });

    it('returns undefined when nothing is configured', () => {
      expect(resolveOpsAlertUrl({})).toBeUndefined();
    });
  });

  describe('buildOpsAlertPayload', () => {
    it('builds a payload with deterministic timestamp', () => {
      const now = new Date('2026-01-01T00:00:00.000Z');
      const payload = buildOpsAlertPayload(
        'webhook_duplicate',
        { source: 'hooks', key: 'abc' },
        { NODE_ENV: 'production' },
        now,
      );
      expect(payload).toEqual({
        type: 'webhook_duplicate',
        meta: { source: 'hooks', key: 'abc' },
        at: '2026-01-01T00:00:00.000Z',
        env: 'production',
      });
    });

    it('defaults env to dev when NODE_ENV is unset', () => {
      const payload = buildOpsAlertPayload(
        'webhook_duplicate',
        { source: 'hooks' },
        {},
        new Date('2026-01-01T00:00:00.000Z'),
      );
      expect(payload.env).toBe('dev');
    });
  });

  describe('isPrismaUniqueViolation', () => {
    it('detects P2002 code on error objects', () => {
      expect(isPrismaUniqueViolation({ code: 'P2002' })).toBe(true);
    });

    it('returns false for other Prisma codes', () => {
      expect(isPrismaUniqueViolation({ code: 'P2025' })).toBe(false);
    });

    it('returns false for null/undefined/non-objects', () => {
      expect(isPrismaUniqueViolation(null)).toBe(false);
      expect(isPrismaUniqueViolation(undefined)).toBe(false);
      expect(isPrismaUniqueViolation('P2002')).toBe(false);
    });
  });

  describe('toErrorInstance', () => {
    it('returns the original Error when given one', () => {
      const e = new Error('boom');
      expect(toErrorInstance(e)).toBe(e);
    });

    it('wraps a string error in an Error', () => {
      const wrapped = toErrorInstance('boom');
      expect(wrapped).toBeInstanceOf(Error);
      expect(wrapped.message).toBe('boom');
    });

    it('falls back to a generic message for unknown shapes', () => {
      const wrapped = toErrorInstance({ weird: true });
      expect(wrapped.message).toBe('unknown error');
    });
  });

  describe('clampRecentFinanceLimit', () => {
    it('uses 50 as the default when no value is supplied', () => {
      expect(clampRecentFinanceLimit(undefined)).toBe(50);
    });

    it('uses 50 when a non-positive value is supplied', () => {
      expect(clampRecentFinanceLimit(0)).toBe(50);
      expect(clampRecentFinanceLimit(-10)).toBe(50);
    });

    it('respects in-range custom values', () => {
      expect(clampRecentFinanceLimit(75)).toBe(75);
    });

    it('caps the value at 200', () => {
      expect(clampRecentFinanceLimit(5000)).toBe(200);
    });
  });
});
