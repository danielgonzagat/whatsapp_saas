import { describe, expect, it } from 'vitest';

import {
  STREAM_INTERRUPTED_MESSAGE,
  clampThreadSearchLimit,
  consumeSseBuffer,
  createKloelStreamError,
  describeStreamAbortReason,
  extractSseDataPayload,
  extractWrappedPayload,
  isRecord,
  normalizeThreadSearchQuery,
  toErrorMessage,
} from './kloel-conversations.helpers';
import type { KloelStreamErrorEvent } from './kloel-stream-events';

describe('isRecord', () => {
  it('accepts plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('rejects null, undefined, primitives and arrays', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord(0)).toBe(false);
    expect(isRecord('')).toBe(false);
    expect(isRecord('abc')).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2])).toBe(false);
  });
});

describe('toErrorMessage', () => {
  it('returns Error.message when present and non-empty', () => {
    expect(toErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('falls back when Error.message is whitespace-only', () => {
    expect(toErrorMessage(new Error('   '), 'fallback')).toBe('fallback');
  });

  it('extracts string `message` from plain records', () => {
    expect(toErrorMessage({ message: 'plain' }, 'fallback')).toBe('plain');
  });

  it('ignores non-string `message` fields', () => {
    expect(toErrorMessage({ message: 42 }, 'fallback')).toBe('fallback');
  });

  it('falls back for null/undefined/primitive errors', () => {
    expect(toErrorMessage(null, 'fb')).toBe('fb');
    expect(toErrorMessage(undefined, 'fb')).toBe('fb');
    expect(toErrorMessage('whatever', 'fb')).toBe('fb');
  });
});

describe('extractWrappedPayload', () => {
  it('returns inner data when wrapped', () => {
    expect(extractWrappedPayload<{ x: number }>({ data: { x: 1 } })).toEqual({ x: 1 });
  });

  it('passes through arrays', () => {
    const arr = [1, 2, 3];
    expect(extractWrappedPayload(arr)).toBe(arr);
  });

  it('passes through primitives', () => {
    expect(extractWrappedPayload<string>('raw')).toBe('raw');
    expect(extractWrappedPayload<number>(7)).toBe(7);
  });

  it('passes through records that lack a `data` field', () => {
    const r = { other: true };
    expect(extractWrappedPayload(r)).toBe(r);
  });

  it('unwraps even when `data` is null (presence wins over value)', () => {
    expect(extractWrappedPayload({ data: null })).toBeNull();
  });
});

describe('createKloelStreamError', () => {
  it('uses event.content first', () => {
    const ev: KloelStreamErrorEvent = { type: 'error', content: 'visible', error: 'code_x' };
    const err = createKloelStreamError(ev);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('visible');
    expect(err.code).toBe('code_x');
  });

  it('falls back to event.error when content is empty', () => {
    const ev: KloelStreamErrorEvent = { type: 'error', content: '', error: 'code_y' };
    const err = createKloelStreamError(ev);
    expect(err.message).toBe('code_y');
    expect(err.code).toBe('code_y');
  });

  it('uses default sentinel when both content and error are missing', () => {
    const ev = { type: 'error' } as unknown as KloelStreamErrorEvent;
    const err = createKloelStreamError(ev);
    expect(err.message).toBe('stream_failed');
    expect(err.code).toBe('stream_failed');
  });
});

describe('describeStreamAbortReason', () => {
  it('returns null for cancelled_by_client (silent abort)', () => {
    expect(describeStreamAbortReason('cancelled_by_client')).toBeNull();
  });

  it('maps stream_idle_timeout to PT-BR user copy', () => {
    expect(describeStreamAbortReason('stream_idle_timeout')).toMatch(/inativa/i);
  });

  it('passes other string reasons through verbatim', () => {
    expect(describeStreamAbortReason('network_lost')).toBe('network_lost');
  });

  it('coerces non-string reasons to stream_aborted', () => {
    expect(describeStreamAbortReason(undefined)).toBe('stream_aborted');
    expect(describeStreamAbortReason(42)).toBe('stream_aborted');
    expect(describeStreamAbortReason({})).toBe('stream_aborted');
  });
});

describe('STREAM_INTERRUPTED_MESSAGE', () => {
  it('is a non-empty PT-BR user-facing string', () => {
    expect(STREAM_INTERRUPTED_MESSAGE.length).toBeGreaterThan(10);
    expect(STREAM_INTERRUPTED_MESSAGE).toMatch(/interrompida/);
  });
});

describe('consumeSseBuffer', () => {
  it('splits on newline and returns the trailing partial line as the remainder', () => {
    const out = consumeSseBuffer('a\nb\nc');
    expect(out.lines).toEqual(['a', 'b']);
    expect(out.remainder).toBe('c');
  });

  it('returns an empty remainder when the buffer ends with a newline', () => {
    const out = consumeSseBuffer('one\ntwo\n');
    expect(out.lines).toEqual(['one', 'two']);
    expect(out.remainder).toBe('');
  });

  it('handles an empty buffer', () => {
    const out = consumeSseBuffer('');
    expect(out.lines).toEqual([]);
    expect(out.remainder).toBe('');
  });

  it('treats a single line with no newline as a remainder, not a delivered line', () => {
    const out = consumeSseBuffer('partial');
    expect(out.lines).toEqual([]);
    expect(out.remainder).toBe('partial');
  });
});

describe('extractSseDataPayload', () => {
  it('returns the JSON portion after `data: `', () => {
    expect(extractSseDataPayload('data: {"x":1}')).toBe('{"x":1}');
  });

  it('returns null for non-data lines (e.g. comments, blank, event:)', () => {
    expect(extractSseDataPayload('')).toBeNull();
    expect(extractSseDataPayload(':keepalive')).toBeNull();
    expect(extractSseDataPayload('event: status')).toBeNull();
  });

  it('returns null for the [DONE] sentinel', () => {
    expect(extractSseDataPayload('data: [DONE]')).toBeNull();
  });

  it('returns null when the prefix is present but the body is empty', () => {
    expect(extractSseDataPayload('data: ')).toBeNull();
  });
});

describe('clampThreadSearchLimit', () => {
  it('keeps in-range values', () => {
    expect(clampThreadSearchLimit(5)).toBe(5);
    expect(clampThreadSearchLimit(1)).toBe(1);
    expect(clampThreadSearchLimit(20)).toBe(20);
  });

  it('clamps below 1 to 1', () => {
    expect(clampThreadSearchLimit(0)).toBe(1);
    expect(clampThreadSearchLimit(-7)).toBe(1);
  });

  it('clamps above 20 to 20', () => {
    expect(clampThreadSearchLimit(21)).toBe(20);
    expect(clampThreadSearchLimit(9_999)).toBe(20);
  });

  it('truncates fractional values', () => {
    expect(clampThreadSearchLimit(3.9)).toBe(3);
  });

  it('treats non-finite values as 1', () => {
    expect(clampThreadSearchLimit(Number.NaN)).toBe(1);
    expect(clampThreadSearchLimit(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('normalizeThreadSearchQuery', () => {
  it('trims whitespace and keeps queries with ≥2 chars', () => {
    expect(normalizeThreadSearchQuery('  hi  ')).toBe('hi');
    expect(normalizeThreadSearchQuery('hello')).toBe('hello');
  });

  it('returns null for short or empty queries', () => {
    expect(normalizeThreadSearchQuery('')).toBeNull();
    expect(normalizeThreadSearchQuery('   ')).toBeNull();
    expect(normalizeThreadSearchQuery('a')).toBeNull();
  });

  it('coerces non-string inputs safely', () => {
    expect(normalizeThreadSearchQuery(42)).toBe('42');
    expect(normalizeThreadSearchQuery(null)).toBeNull();
    expect(normalizeThreadSearchQuery(undefined)).toBeNull();
  });
});
