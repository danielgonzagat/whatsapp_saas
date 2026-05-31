import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  awaitCloserOrTimeout,
  closeWithWarn,
  collectRedisDuplicateOverrides,
  extractWorkspaceIdFromJobData,
  hasErrorEmitter,
  logBullMqBackgroundError,
  resolveQueueAttempts,
  resolveQueueBackoffMs,
} from '../queue.helpers';

describe('collectRedisDuplicateOverrides', () => {
  it('returns an empty object when no args are provided', () => {
    expect(collectRedisDuplicateOverrides([])).toEqual({});
  });

  it('merges plain object overrides preserving the order', () => {
    const merged = collectRedisDuplicateOverrides([{ db: 1, family: 6 }, { db: 2 }]);
    expect(merged).toEqual({ db: 2, family: 6 });
  });

  it('skips non-object and array entries silently', () => {
    const merged = collectRedisDuplicateOverrides([
      null,
      undefined,
      'redis://x',
      42,
      ['db', 3],
      { keepAlive: 30 },
    ]);
    expect(merged).toEqual({ keepAlive: 30 });
  });

  it('returns a fresh object on every call (no shared mutable state)', () => {
    const a = collectRedisDuplicateOverrides([{ db: 1 }]);
    const b = collectRedisDuplicateOverrides([{ db: 1 }]);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe('extractWorkspaceIdFromJobData', () => {
  it('returns the top-level workspaceId string when present', () => {
    expect(extractWorkspaceIdFromJobData({ workspaceId: 'ws_abc' })).toBe('ws_abc');
  });

  it('falls back to nested workspace.id when workspaceId is missing', () => {
    expect(extractWorkspaceIdFromJobData({ workspace: { id: 'ws_nested' } })).toBe('ws_nested');
  });

  it('prefers the top-level workspaceId over a nested workspace.id', () => {
    expect(
      extractWorkspaceIdFromJobData({
        workspaceId: 'ws_top',
        workspace: { id: 'ws_nested' },
      }),
    ).toBe('ws_top');
  });

  it('ignores non-string workspaceId values', () => {
    expect(extractWorkspaceIdFromJobData({ workspaceId: 42 })).toBeUndefined();
  });

  it('returns undefined when nested workspace is not a plain object', () => {
    expect(extractWorkspaceIdFromJobData({ workspace: 'ws_str' })).toBeUndefined();
    expect(extractWorkspaceIdFromJobData({ workspace: ['ws'] })).toBeUndefined();
    expect(extractWorkspaceIdFromJobData({ workspace: null })).toBeUndefined();
  });

  it('returns undefined for null, primitives and arrays', () => {
    expect(extractWorkspaceIdFromJobData(null)).toBeUndefined();
    expect(extractWorkspaceIdFromJobData(undefined)).toBeUndefined();
    expect(extractWorkspaceIdFromJobData('payload')).toBeUndefined();
    expect(extractWorkspaceIdFromJobData(123)).toBeUndefined();
    expect(extractWorkspaceIdFromJobData([{ workspaceId: 'ws' }])).toBeUndefined();
  });
});

describe('hasErrorEmitter', () => {
  it('returns true for objects exposing an `on` function', () => {
    const emitter = { on: () => undefined };
    expect(hasErrorEmitter(emitter)).toBe(true);
  });

  it('returns false when `on` is not callable', () => {
    expect(hasErrorEmitter({ on: 'not-a-function' })).toBe(false);
    expect(hasErrorEmitter({ on: null })).toBe(false);
  });

  it('returns false for null, undefined and primitives', () => {
    expect(hasErrorEmitter(null)).toBe(false);
    expect(hasErrorEmitter(undefined)).toBe(false);
    expect(hasErrorEmitter(0)).toBe(false);
    expect(hasErrorEmitter('on')).toBe(false);
  });

  it('returns false for objects without an `on` property', () => {
    expect(hasErrorEmitter({ emit: () => undefined })).toBe(false);
  });
});

describe('resolveQueueAttempts', () => {
  it('defaults to 3 when the value is missing or unparseable', () => {
    expect(resolveQueueAttempts(undefined)).toBe(3);
    expect(resolveQueueAttempts('')).toBe(3);
    expect(resolveQueueAttempts('not-a-number')).toBe(3);
  });

  it('falls back to 3 for zero and negative values', () => {
    expect(resolveQueueAttempts('0')).toBe(3);
    expect(resolveQueueAttempts('-5')).toBe(3);
  });

  it('returns the parsed value clamped to a minimum of 1', () => {
    expect(resolveQueueAttempts('1')).toBe(1);
    expect(resolveQueueAttempts('7')).toBe(7);
  });
});

describe('resolveQueueBackoffMs', () => {
  it('defaults to 5000 when the value is missing or unparseable', () => {
    expect(resolveQueueBackoffMs(undefined)).toBe(5000);
    expect(resolveQueueBackoffMs('')).toBe(5000);
    expect(resolveQueueBackoffMs('NaN')).toBe(5000);
  });

  it('falls back to 5000 for zero and negative values', () => {
    expect(resolveQueueBackoffMs('0')).toBe(5000);
    expect(resolveQueueBackoffMs('-1000')).toBe(5000);
  });

  it('clamps the parsed value to a minimum of 1000', () => {
    expect(resolveQueueBackoffMs('500')).toBe(1000);
    expect(resolveQueueBackoffMs('1000')).toBe(1000);
    expect(resolveQueueBackoffMs('15000')).toBe(15000);
  });
});

// ─── logBullMqBackgroundError ─────────────────────────────────────────

describe('logBullMqBackgroundError', () => {
  it('logs a warning with the label and error message', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logBullMqBackgroundError('queue:flow-jobs', new Error('connection lost'));
    expect(warn).toHaveBeenCalledWith('[QUEUE] queue:flow-jobs background error: connection lost');
    warn.mockRestore();
  });
});

// ─── closeWithWarn ────────────────────────────────────────────────────

describe('closeWithWarn', () => {
  it('calls close and returns the promise', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    await closeWithWarn({ close }, 'test-queue');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('warns when close rejects', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const close = vi.fn().mockRejectedValue(new Error('already closed'));
    await closeWithWarn({ close }, 'test-dlq');
    const [label, errorArg] = warn.mock.calls[0] as [string, Error];
    expect(label).toBe('[SHUTDOWN] test-dlq close failed:');
    expect(errorArg).toBeInstanceOf(Error);
    warn.mockRestore();
  });
});

// ─── awaitCloserOrTimeout ─────────────────────────────────────────────

describe('awaitCloserOrTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves when all closers resolve before the timeout', async () => {
    const closers = [Promise.resolve('a'), Promise.resolve('b')];
    const promise = awaitCloserOrTimeout(closers, 1000);
    await vi.runAllTimersAsync();
    await expect(promise).resolves.toBeUndefined();
  });

  it('resolves when the timeout elapses first', async () => {
    const closers = [new Promise(() => {})]; // never settles
    const promise = awaitCloserOrTimeout(closers, 1000);
    vi.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeUndefined();
  });
});
