import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  asProviderError,
  asReasonString,
  assertProviderSendResult,
  errorMessage,
  errorStatus,
  isSameLockToken,
  resolveActionLockConfig,
  shouldBypassActionLock,
  sleep,
} from '../providers/whatsapp-engine.helpers';
// ─── asProviderError ───────────────────────────────────────────────────

describe('asProviderError', () => {
  it('returns an empty object for null / undefined', () => {
    expect(asProviderError(null)).toEqual({});
    expect(asProviderError(undefined)).toEqual({});
  });

  it('returns an empty object for primitives', () => {
    expect(asProviderError('not-an-error')).toEqual({});
    expect(asProviderError(42)).toEqual({});
    expect(asProviderError(true)).toEqual({});
  });

  it('returns the object as-is when it is already an object', () => {
    const err = { message: 'boom', response: { status: 500 } };
    expect(asProviderError(err)).toBe(err);
  });

  it('handles Error instances (they are objects)', () => {
    const err = new Error('test');
    const result = asProviderError(err);
    expect(result.message).toBe('test');
  });
});

// ─── errorMessage ──────────────────────────────────────────────────────

describe('errorMessage', () => {
  it('returns the message property when present', () => {
    expect(errorMessage({ message: 'oops' })).toBe('oops');
  });

  it('falls back to unknown_error for empty / missing message', () => {
    expect(errorMessage({})).toBe('unknown_error');
    expect(errorMessage(null)).toBe('unknown_error');
    expect(errorMessage('some string')).toBe('unknown_error');
  });

  it('handles Error instances', () => {
    expect(errorMessage(new Error('test error'))).toBe('test error');
  });
});

// ─── errorStatus ───────────────────────────────────────────────────────

describe('errorStatus', () => {
  it('returns the response.status when present', () => {
    expect(errorStatus({ response: { status: 429 } })).toBe(429);
    expect(errorStatus({ response: { status: 500 } })).toBe(500);
  });

  it('returns undefined when there is no response or status', () => {
    expect(errorStatus({})).toBeUndefined();
    expect(errorStatus({ response: {} })).toBeUndefined();
    expect(errorStatus(null)).toBeUndefined();
    expect(errorStatus('nope')).toBeUndefined();
  });
});

// ─── asReasonString ────────────────────────────────────────────────────

describe('asReasonString', () => {
  it('returns the value when it is a non-empty string', () => {
    expect(asReasonString('rate-limited', 'fallback')).toBe('rate-limited');
    expect(asReasonString('  ok  ', 'fallback')).toBe('  ok  ');
  });

  it('returns the fallback for empty / whitespace-only strings', () => {
    expect(asReasonString('', 'fallback')).toBe('fallback');
    expect(asReasonString('   ', 'fallback')).toBe('fallback');
  });

  it('returns the fallback for non-strings', () => {
    expect(asReasonString(undefined, 'fb')).toBe('fb');
    expect(asReasonString(null, 'fb')).toBe('fb');
    expect(asReasonString(42, 'fb')).toBe('fb');
    expect(asReasonString(true, 'fb')).toBe('fb');
    expect(asReasonString({}, 'fb')).toBe('fb');
  });
});
// ─── assertProviderSendResult ──────────────────────────────────────────

describe('assertProviderSendResult', () => {
  it('returns the result unchanged when successful', () => {
    const res = { success: true, id: 'msg-1' };
    expect(assertProviderSendResult(res, 'text')).toBe(res);
  });

  it('returns the result when success is not explicitly false', () => {
    const res = { id: 'msg-2' };
    expect(assertProviderSendResult(res, 'media')).toBe(res);
  });

  it('throws on null result', () => {
    expect(() => assertProviderSendResult(null, 'text')).toThrow(
      'Meta text returned empty response',
    );
  });

  it('throws on undefined result', () => {
    expect(() => assertProviderSendResult(undefined, 'media')).toThrow(
      'Meta media returned empty response',
    );
  });

  it('throws with the error string when result.error is a string', () => {
    expect(() => assertProviderSendResult({ error: 'auth_failed' }, 'text')).toThrow('auth_failed');
  });

  it('throws with the reason when result.error is an object with reason', () => {
    expect(() => assertProviderSendResult({ error: {}, reason: 'bad_gateway' }, 'text')).toThrow(
      'bad_gateway',
    );
  });

  it('throws with the message when result.error is an object with message', () => {
    expect(() =>
      assertProviderSendResult({ error: {}, message: 'timeout', reason: '' }, 'text'),
    ).toThrow('timeout');
  });

  it('throws with fallback message when no reason / message on error object', () => {
    expect(() => assertProviderSendResult({ error: {} }, 'text')).toThrow('unknown_text_error');
  });

  it('throws on explicit success: false', () => {
    expect(() =>
      assertProviderSendResult({ success: false, reason: 'quota_exceeded' }, 'media'),
    ).toThrow('quota_exceeded');

    expect(() => assertProviderSendResult({ success: false }, 'media')).toThrow(
      'Meta media send failed',
    );
  });
});

// ─── sleep ─────────────────────────────────────────────────────────────

describe('sleep', () => {
  it('resolves after approximately the given duration', async () => {
    const start = Date.now();
    await sleep(50);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  it('resolves immediately for 0 ms', async () => {
    await sleep(0);
  });
});

// ─── isSameLockToken ───────────────────────────────────────────────────

describe('isSameLockToken', () => {
  it('returns true for identical tokens', () => {
    expect(isSameLockToken('abc', 'abc')).toBe(true);
  });

  it('returns false for different tokens', () => {
    expect(isSameLockToken('abc', 'def')).toBe(false);
  });

  it('returns false when current is null', () => {
    expect(isSameLockToken(null, 'abc')).toBe(false);
  });

  it('returns false for different-length tokens', () => {
    expect(isSameLockToken('ab', 'abc')).toBe(false);
    expect(isSameLockToken('abc', 'ab')).toBe(false);
  });

  it('performs timing-safe comparison (same-length different bytes)', () => {
    expect(isSameLockToken('aaa', 'aab')).toBe(false);
  });
});
// ─── shouldBypassActionLock ────────────────────────────────────────────

describe('shouldBypassActionLock', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete (process.env as Record<string, string | undefined>).WHATSAPP_ACTION_LOCK_TEST_ENFORCE;
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
    delete (process.env as Record<string, string | undefined>).VITEST;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('returns true in test mode without test-enforce', () => {
    process.env.NODE_ENV = 'test';
    expect(shouldBypassActionLock()).toBe(true);
  });

  it('returns true when VITEST is true without test-enforce', () => {
    process.env.VITEST = 'true';
    expect(shouldBypassActionLock()).toBe(true);
  });

  it('returns false when test-enforce is true even in test mode', () => {
    process.env.NODE_ENV = 'test';
    process.env.WHATSAPP_ACTION_LOCK_TEST_ENFORCE = 'true';
    expect(shouldBypassActionLock()).toBe(false);
  });

  it('returns false in production-like env', () => {
    process.env.NODE_ENV = 'production';
    expect(shouldBypassActionLock()).toBe(false);
  });

  it('returns false when no env vars are set', () => {
    expect(shouldBypassActionLock()).toBe(false);
  });
});

// ─── resolveActionLockConfig ───────────────────────────────────────────

describe('resolveActionLockConfig', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    delete (process.env as Record<string, string | undefined>).WHATSAPP_ACTION_LOCK_MS;
    delete (process.env as Record<string, string | undefined>).NODE_ENV;
    delete (process.env as Record<string, string | undefined>).VITEST;
  });

  afterEach(() => {
    process.env = { ...saved };
  });

  it('returns production defaults when no env vars are set', () => {
    const cfg = resolveActionLockConfig();
    expect(cfg.isTestEnv).toBe(false);
    expect(cfg.ttlMs).toBe(45000);
    expect(cfg.backoffMin).toBe(250);
    expect(cfg.backoffJitter).toBe(250);
  });

  it('returns test-mode config when NODE_ENV is test', () => {
    process.env.NODE_ENV = 'test';
    const cfg = resolveActionLockConfig();
    expect(cfg.isTestEnv).toBe(true);
    expect(cfg.ttlMs).toBe(45000);
    expect(cfg.backoffMin).toBe(50);
    expect(cfg.backoffJitter).toBe(50);
  });

  it('clamps ttlMs to the production minimum in non-test', () => {
    process.env.WHATSAPP_ACTION_LOCK_MS = '5000';
    const cfg = resolveActionLockConfig();
    expect(cfg.ttlMs).toBe(15000);
  });

  it('allows short ttlMs in test mode', () => {
    process.env.NODE_ENV = 'test';
    process.env.WHATSAPP_ACTION_LOCK_MS = '5000';
    const cfg = resolveActionLockConfig();
    expect(cfg.ttlMs).toBe(5000);
  });

  it('respects the configured ttlMs', () => {
    process.env.WHATSAPP_ACTION_LOCK_MS = '60000';
    const cfg = resolveActionLockConfig();
    expect(cfg.ttlMs).toBe(60000);
  });

  it('handles unparseable env var gracefully', () => {
    process.env.WHATSAPP_ACTION_LOCK_MS = 'not-a-number';
    const cfg = resolveActionLockConfig();
    expect(cfg.ttlMs).toBe(45000);
  });
});
