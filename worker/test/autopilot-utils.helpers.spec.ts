import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  countReplyWords,
  extractFirstJsonObject,
  isAutonomousEnabled,
  isCiaAutonomyMode,
  isCiaProactiveCycleEnabled,
  isExplicitProactiveOutreachAllowed,
  isRecentLiveConversation,
  messageMatchesProductText,
  normalizeAction,
  normalizeJsonObject,
  normalizeMatchableText,
  scoreToProbabilityBucket,
} from '../processors/autopilot/autopilot-utils.helpers';

describe('countReplyWords', () => {
  it('returns 1 for null / undefined / empty strings', () => {
    expect(countReplyWords(null)).toBe(1);
    expect(countReplyWords(undefined)).toBe(1);
    expect(countReplyWords('')).toBe(1);
    expect(countReplyWords('   ')).toBe(1);
  });

  it('counts whitespace-separated words', () => {
    expect(countReplyWords('hello')).toBe(1);
    expect(countReplyWords('hello world')).toBe(2);
    expect(countReplyWords('  hello  world  ')).toBe(2);
    expect(countReplyWords('a b c d e')).toBe(5);
  });

  it('treats tabs/newlines as separators', () => {
    expect(countReplyWords('hello\tworld\nfoo')).toBe(3);
  });
});

describe('isRecentLiveConversation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-28T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false on empty / non-array input', () => {
    expect(isRecentLiveConversation([])).toBe(false);
    expect(isRecentLiveConversation(null as unknown as [])).toBe(false);
    expect(isRecentLiveConversation(undefined as unknown as [])).toBe(false);
  });

  it('returns true when the latest message is within 24h', () => {
    const tenHoursAgo = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString();
    expect(isRecentLiveConversation([{ content: 'oi', createdAt: tenHoursAgo }])).toBe(true);
  });

  it('returns false when the latest message is older than 24h', () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString();
    expect(isRecentLiveConversation([{ content: 'oi', createdAt: thirtyHoursAgo }])).toBe(false);
  });

  it('picks the most recent timestamp from a mixed batch', () => {
    const old = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    expect(
      isRecentLiveConversation([
        { content: 'velho', createdAt: old },
        { content: 'novo', createdAt: recent },
      ]),
    ).toBe(true);
  });

  it('ignores invalid / missing createdAt values', () => {
    expect(
      isRecentLiveConversation([{ content: 'a', createdAt: 'not-a-date' }, { content: 'b' }]),
    ).toBe(false);
  });
});

describe('normalizeAction', () => {
  it('passes through allowed values unchanged', () => {
    for (const allowed of [
      'SEND_OFFER',
      'SEND_PRICE',
      'SEND_CALENDAR',
      'HANDLE_OBJECTION',
      'TRANSFER_AGENT',
      'FOLLOW_UP',
      'FOLLOW_UP_STRONG',
      'ANTI_CHURN',
      'QUALIFY',
      'GHOST_CLOSER',
      'LEAD_UNLOCKER',
    ]) {
      expect(normalizeAction(allowed)).toBe(allowed);
    }
  });

  it('uppercases lowercase input before matching', () => {
    expect(normalizeAction('send_offer')).toBe('SEND_OFFER');
    expect(normalizeAction('Qualify')).toBe('QUALIFY');
  });

  it('maps legacy aliases to canonical values', () => {
    expect(normalizeAction('OFFER')).toBe('SEND_OFFER');
    expect(normalizeAction('OBJECTION')).toBe('HANDLE_OBJECTION');
    expect(normalizeAction('UPSELL')).toBe('FOLLOW_UP');
  });

  it('falls back to FOLLOW_UP for unknown / empty input', () => {
    expect(normalizeAction('TOTALLY_UNKNOWN')).toBe('FOLLOW_UP');
    expect(normalizeAction('')).toBe('FOLLOW_UP');
    expect(normalizeAction(undefined as unknown as string)).toBe('FOLLOW_UP');
  });
});

describe('isAutonomousEnabled', () => {
  it('returns true for LIVE / BACKLOG / FULL', () => {
    expect(isAutonomousEnabled({ autonomy: { mode: 'LIVE' } })).toBe(true);
    expect(isAutonomousEnabled({ autonomy: { mode: 'backlog' } })).toBe(true);
    expect(isAutonomousEnabled({ autonomy: { mode: 'FULL' } })).toBe(true);
  });

  it('returns false for HUMAN_ONLY / SUSPENDED regardless of legacy flag', () => {
    expect(
      isAutonomousEnabled({
        autonomy: { mode: 'HUMAN_ONLY' },
        autopilot: { enabled: true },
      }),
    ).toBe(false);
    expect(
      isAutonomousEnabled({
        autonomy: { mode: 'SUSPENDED' },
        autopilot: { enabled: true },
      }),
    ).toBe(false);
  });

  it('OFF falls back to autopilot.enabled', () => {
    expect(isAutonomousEnabled({ autonomy: { mode: 'OFF' } })).toBe(false);
    expect(
      isAutonomousEnabled({
        autonomy: { mode: 'OFF' },
        autopilot: { enabled: true },
      }),
    ).toBe(true);
  });

  it('missing autonomy mode falls back to autopilot.enabled', () => {
    expect(isAutonomousEnabled({})).toBe(false);
    expect(isAutonomousEnabled({ autopilot: { enabled: true } })).toBe(true);
    expect(isAutonomousEnabled({ autopilot: { enabled: false } })).toBe(false);
  });
});

describe('isCiaAutonomyMode', () => {
  it('returns true only for LIVE / BACKLOG / FULL', () => {
    expect(isCiaAutonomyMode({ autonomy: { mode: 'LIVE' } })).toBe(true);
    expect(isCiaAutonomyMode({ autonomy: { mode: 'BACKLOG' } })).toBe(true);
    expect(isCiaAutonomyMode({ autonomy: { mode: 'FULL' } })).toBe(true);
  });

  it('returns false for everything else, including legacy autopilot.enabled', () => {
    expect(isCiaAutonomyMode({})).toBe(false);
    expect(isCiaAutonomyMode({ autonomy: { mode: 'OFF' } })).toBe(false);
    expect(isCiaAutonomyMode({ autopilot: { enabled: true } })).toBe(false);
    expect(isCiaAutonomyMode({ autonomy: { mode: 'HUMAN_ONLY' } })).toBe(false);
  });
});

describe('isExplicitProactiveOutreachAllowed', () => {
  const originalAllow = process.env.ALLOW_PROACTIVE_OUTREACH;

  afterEach(() => {
    if (originalAllow === undefined) {
      delete process.env.ALLOW_PROACTIVE_OUTREACH;
    } else {
      process.env.ALLOW_PROACTIVE_OUTREACH = originalAllow;
    }
  });

  it('is gated off by default when env not set', () => {
    delete process.env.ALLOW_PROACTIVE_OUTREACH;
    expect(isExplicitProactiveOutreachAllowed({ autonomy: { proactiveEnabled: true } })).toBe(
      false,
    );
  });

  it('requires env to be true-ish AND a workspace flag to be true', () => {
    process.env.ALLOW_PROACTIVE_OUTREACH = 'true';
    expect(isExplicitProactiveOutreachAllowed({})).toBe(false);
    expect(isExplicitProactiveOutreachAllowed({ autonomy: { proactiveEnabled: true } })).toBe(true);
    expect(isExplicitProactiveOutreachAllowed({ autopilot: { proactiveEnabled: true } })).toBe(
      true,
    );
  });

  it('accepts other truthy env spellings', () => {
    for (const value of ['1', 'on', 'yes', 'TRUE']) {
      process.env.ALLOW_PROACTIVE_OUTREACH = value;
      expect(isExplicitProactiveOutreachAllowed({ autonomy: { proactiveEnabled: true } })).toBe(
        true,
      );
    }
  });

  it('rejects falsy env spellings', () => {
    for (const value of ['false', '0', 'off', 'no', '']) {
      process.env.ALLOW_PROACTIVE_OUTREACH = value;
      expect(isExplicitProactiveOutreachAllowed({ autonomy: { proactiveEnabled: true } })).toBe(
        false,
      );
    }
  });
});

describe('isCiaProactiveCycleEnabled', () => {
  const originalAllow = process.env.ALLOW_PROACTIVE_OUTREACH;
  const originalCycle = process.env.CIA_ENABLE_PROACTIVE_CYCLE;

  afterEach(() => {
    if (originalAllow === undefined) {
      delete process.env.ALLOW_PROACTIVE_OUTREACH;
    } else {
      process.env.ALLOW_PROACTIVE_OUTREACH = originalAllow;
    }
    if (originalCycle === undefined) {
      delete process.env.CIA_ENABLE_PROACTIVE_CYCLE;
    } else {
      process.env.CIA_ENABLE_PROACTIVE_CYCLE = originalCycle;
    }
  });

  it('returns false when proactive outreach is blocked by env', () => {
    process.env.ALLOW_PROACTIVE_OUTREACH = 'false';
    process.env.CIA_ENABLE_PROACTIVE_CYCLE = 'true';
    expect(isCiaProactiveCycleEnabled({ autonomy: { proactiveEnabled: true } })).toBe(false);
  });

  it('returns true when both env switches and the workspace flag are aligned', () => {
    process.env.ALLOW_PROACTIVE_OUTREACH = 'true';
    process.env.CIA_ENABLE_PROACTIVE_CYCLE = 'true';
    expect(isCiaProactiveCycleEnabled({ autonomy: { proactiveEnabled: true } })).toBe(true);
  });

  it('hard-disables the cycle when override is explicitly off', () => {
    process.env.ALLOW_PROACTIVE_OUTREACH = 'true';
    process.env.CIA_ENABLE_PROACTIVE_CYCLE = 'off';
    expect(isCiaProactiveCycleEnabled({ autonomy: { proactiveEnabled: true } })).toBe(false);
  });

  it('falls through to workspace flag when override is unknown', () => {
    process.env.ALLOW_PROACTIVE_OUTREACH = 'true';
    process.env.CIA_ENABLE_PROACTIVE_CYCLE = 'maybe';
    expect(isCiaProactiveCycleEnabled({ autonomy: { proactiveEnabled: true } })).toBe(true);
    expect(isCiaProactiveCycleEnabled({ autonomy: { proactiveEnabled: false } })).toBe(false);
  });
});

describe('normalizeMatchableText', () => {
  it('lowercases, strips diacritics, and collapses whitespace', () => {
    expect(normalizeMatchableText('Olá  MUNDO!')).toBe('ola mundo');
    expect(normalizeMatchableText('   ')).toBe('');
    expect(normalizeMatchableText('')).toBe('');
  });

  it('replaces non-alphanumeric chars with spaces', () => {
    expect(normalizeMatchableText('foo-bar/baz_qux')).toBe('foo bar baz qux');
  });

  it('handles accented Portuguese gracefully', () => {
    expect(normalizeMatchableText('Câmera fotográfica')).toBe('camera fotografica');
  });
});

describe('messageMatchesProductText', () => {
  const normalized = normalizeMatchableText('quero comprar uma camera fotografica nova');

  it('returns true when the candidate is a substring of the message', () => {
    expect(messageMatchesProductText(normalized, 'Câmera Fotográfica')).toBe(true);
  });

  it('returns true when every >=4-char keyword matches', () => {
    expect(messageMatchesProductText(normalized, 'fotografica profissional 4k')).toBe(true);
  });

  it('returns false when no keywords intersect', () => {
    expect(messageMatchesProductText(normalized, 'suplemento alimentar')).toBe(false);
  });

  it('returns false for empty candidate text', () => {
    expect(messageMatchesProductText(normalized, '')).toBe(false);
  });

  it('ignores short tokens (<4 chars)', () => {
    expect(messageMatchesProductText('xyz', 'foo')).toBe(false);
  });
});

describe('normalizeJsonObject', () => {
  it('returns a shallow copy for plain objects', () => {
    const input = { a: 1, b: 'two' };
    const out = normalizeJsonObject(input);
    expect(out).toEqual(input);
    expect(out).not.toBe(input);
  });

  it('returns empty object for arrays, primitives, null, undefined', () => {
    expect(normalizeJsonObject([1, 2, 3])).toEqual({});
    expect(normalizeJsonObject('string')).toEqual({});
    expect(normalizeJsonObject(42)).toEqual({});
    expect(normalizeJsonObject(null)).toEqual({});
    expect(normalizeJsonObject(undefined)).toEqual({});
  });
});

describe('extractFirstJsonObject', () => {
  it('parses pure JSON objects', () => {
    expect(extractFirstJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it('extracts the first JSON object from wrapped text', () => {
    expect(extractFirstJsonObject('noise before {"x":2,"y":"hi"} noise after')).toEqual({
      x: 2,
      y: 'hi',
    });
  });

  it('returns null for empty / unparseable input', () => {
    expect(extractFirstJsonObject('')).toBeNull();
    expect(extractFirstJsonObject('not json at all')).toBeNull();
    expect(extractFirstJsonObject('{ bad json')).toBeNull();
  });

  it('returns null when extracted braces still fail to parse', () => {
    expect(extractFirstJsonObject('prefix { not: real json } suffix')).toBeNull();
  });
});

describe('scoreToProbabilityBucket', () => {
  it('maps boundary scores to expected buckets', () => {
    expect(scoreToProbabilityBucket(0)).toBe('LOW');
    expect(scoreToProbabilityBucket(39)).toBe('LOW');
    expect(scoreToProbabilityBucket(40)).toBe('MEDIUM');
    expect(scoreToProbabilityBucket(64)).toBe('MEDIUM');
    expect(scoreToProbabilityBucket(65)).toBe('HIGH');
    expect(scoreToProbabilityBucket(84)).toBe('HIGH');
    expect(scoreToProbabilityBucket(85)).toBe('VERY_HIGH');
    expect(scoreToProbabilityBucket(100)).toBe('VERY_HIGH');
  });

  it('treats out-of-range / negative inputs deterministically', () => {
    expect(scoreToProbabilityBucket(-10)).toBe('LOW');
    expect(scoreToProbabilityBucket(1000)).toBe('VERY_HIGH');
  });
});
