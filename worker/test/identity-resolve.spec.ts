import { describe, it, expect } from 'vitest';
import {
  normalizeCatalogPhone,
  expandComparablePhoneVariants,
  isWorkspaceSelfPhone,
  isWorkspaceSelfTarget,
  buildLidMap,
  resolveCanonicalChatId,
  resolveCatalogPhoneFromChatId,
  resolveLastMessageFromMe,
  isIndividualWahaChatId,
  resolveCatalogChatActivityTimestamp,
} from '../processors/autopilot/identity-resolve';

describe('normalizeCatalogPhone', () => {
  it('strips non-digit characters', () => {
    expect(normalizeCatalogPhone('+55 (11) 98765-4321')).toBe('5511987654321');
  });

  it('strips @c.us suffix', () => {
    expect(normalizeCatalogPhone('5511987654321@c.us')).toBe('5511987654321');
  });

  it('strips @s.whatsapp.net suffix', () => {
    expect(normalizeCatalogPhone('5511987654321@s.whatsapp.net')).toBe('5511987654321');
  });

  it('handles empty string', () => {
    expect(normalizeCatalogPhone('')).toBe('');
  });

  it('handles null/undefined', () => {
    expect(normalizeCatalogPhone(null as string)).toBe('');
  });
});

describe('expandComparablePhoneVariants', () => {
  it('adds 55 prefix for short numbers', () => {
    const variants = expandComparablePhoneVariants('11987654321');
    expect(variants).toContain('11987654321');
    expect(variants).toContain('5511987654321');
  });

  it('strips 55 prefix for long numbers', () => {
    const variants = expandComparablePhoneVariants('5511987654321');
    expect(variants).toContain('5511987654321');
    expect(variants).toContain('11987654321');
  });

  it('returns empty array for empty input', () => {
    expect(expandComparablePhoneVariants('')).toEqual([]);
  });

  it('returns empty array for null', () => {
    expect(expandComparablePhoneVariants(null)).toEqual([]);
  });

  it('returns single variant for non-Brazil numbers', () => {
    const variants = expandComparablePhoneVariants('1234567890');
    expect(variants).toEqual(['1234567890']);
  });

  it('does not strip 55 from numbers with length 11 or less', () => {
    const variants = expandComparablePhoneVariants('5511987654');
    expect(variants).toEqual(['5511987654']);
  });
});

describe('isWorkspaceSelfPhone', () => {
  it('returns true when phone matches', () => {
    expect(isWorkspaceSelfPhone('5511987654321', '11987654321')).toBe(true);
  });

  it('returns false when phones differ', () => {
    expect(isWorkspaceSelfPhone('5511987654321', '5511999999999')).toBe(false);
  });

  it('handles null workspace phone', () => {
    expect(isWorkspaceSelfPhone('5511987654321', null)).toBe(false);
  });

  it('handles null phone', () => {
    expect(isWorkspaceSelfPhone(null, '5511987654321')).toBe(false);
  });
});

describe('isWorkspaceSelfTarget', () => {
  const mockIdentity = {
    phone: '5511987654321',
    ids: ['5511987654321@c.us', 'lid_abc123'],
  };

  it('returns true when phone matches self phone', () => {
    expect(
      isWorkspaceSelfTarget({
        phone: '11987654321',
        selfIdentity: mockIdentity,
      }),
    ).toBe(true);
  });

  it('returns true when chatId matches self id', () => {
    expect(
      isWorkspaceSelfTarget({
        phone: '11999999999',
        chatId: '5511987654321@c.us',
        selfIdentity: mockIdentity,
      }),
    ).toBe(true);
  });

  it('returns false when neither phone nor chatId match', () => {
    expect(
      isWorkspaceSelfTarget({
        phone: '11999999999',
        chatId: '99999@c.us',
        selfIdentity: mockIdentity,
      }),
    ).toBe(false);
  });

  it('returns false when selfIdentity is null', () => {
    expect(isWorkspaceSelfTarget({ phone: '123', selfIdentity: null })).toBe(false);
  });

  it('returns false when selfIdentity is undefined', () => {
    expect(isWorkspaceSelfTarget({ phone: '123' })).toBe(false);
  });

  it('returns false when chatId is empty', () => {
    expect(
      isWorkspaceSelfTarget({
        chatId: '',
        phone: '11999999999',
        selfIdentity: mockIdentity,
      }),
    ).toBe(false);
  });
});

describe('buildLidMap', () => {
  it('maps lid to pn', () => {
    const map = buildLidMap([{ lid: 'lid_abc', pn: '5511987654321' }]);
    expect(map.get('lid_abc')).toBe('5511987654321');
  });

  it('maps normalized lid (no non-digits) to pn', () => {
    const map = buildLidMap([{ lid: 'lid-123-abc', pn: '5511987654321' }]);
    expect(map.get('lid123abc')).toBe('5511987654321');
  });

  it('skips entries with empty lid', () => {
    const map = buildLidMap([{ lid: '', pn: '123' }]);
    expect(map.size).toBe(0);
  });

  it('skips entries with empty pn', () => {
    const map = buildLidMap([{ lid: 'lid1', pn: '' }]);
    expect(map.size).toBe(0);
  });

  it('handles null array', () => {
    const map = buildLidMap(null as []);
    expect(map.size).toBe(0);
  });
});

describe('resolveCanonicalChatId', () => {
  it('returns normalized chatId as-is when no lidMap', () => {
    expect(resolveCanonicalChatId('5511987654321@c.us')).toBe('5511987654321@c.us');
  });

  it('resolves LID-based ID through lidMap', () => {
    const lidMap = new Map([['lid_abc', '5511987654321@c.us']]);
    expect(resolveCanonicalChatId('lid_abc', lidMap)).toBe('5511987654321@c.us');
  });

  it('returns empty for empty chatId', () => {
    expect(resolveCanonicalChatId('')).toBe('');
  });

  it('falls back to normalized LID when not in map', () => {
    const lidMap = new Map([['other', 'phone']]);
    expect(resolveCanonicalChatId('lid_xyz', lidMap)).toBe('lid_xyz');
  });
});

describe('resolveCatalogPhoneFromChatId', () => {
  it('normalizes chatId to phone', () => {
    expect(resolveCatalogPhoneFromChatId('5511987654321@c.us')).toBe('5511987654321');
  });

  it('resolves through lidMap', () => {
    const lidMap = new Map([['lid_abc', '5511987654321@c.us']]);
    expect(resolveCatalogPhoneFromChatId('lid_abc', lidMap)).toBe('5511987654321');
  });

  it('returns empty for empty chatId', () => {
    expect(resolveCatalogPhoneFromChatId('')).toBe('');
  });
});

describe('resolveLastMessageFromMe', () => {
  it('reads chat.lastMessage.fromMe', () => {
    expect(resolveLastMessageFromMe({ lastMessage: { fromMe: true } })).toBe(true);
    expect(resolveLastMessageFromMe({ lastMessage: { fromMe: false } })).toBe(false);
  });

  it('reads chat.lastMessage._data.id.fromMe', () => {
    expect(resolveLastMessageFromMe({ lastMessage: { _data: { id: { fromMe: true } } } })).toBe(
      true,
    );
  });

  it('reads chat.lastMessage.id.fromMe', () => {
    expect(resolveLastMessageFromMe({ lastMessage: { id: { fromMe: false } } })).toBe(false);
  });

  it('returns null when fromMe not found', () => {
    expect(resolveLastMessageFromMe({})).toBeNull();
  });

  it('returns null for null chat', () => {
    expect(resolveLastMessageFromMe(null as Record<string, unknown>)).toBeNull();
  });
});

describe('isIndividualWahaChatId', () => {
  it('returns true for c.us chatId', () => {
    expect(isIndividualWahaChatId('5511987654321@c.us')).toBe(true);
  });

  it('returns false for group chatId', () => {
    expect(isIndividualWahaChatId('123456@g.us')).toBe(false);
  });

  it('returns false for newsletter', () => {
    expect(isIndividualWahaChatId('123@newsletter')).toBe(false);
  });

  it('returns false for broadcast status', () => {
    expect(isIndividualWahaChatId('status@broadcast')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isIndividualWahaChatId('')).toBe(false);
  });

  it('is case-insensitive for group', () => {
    expect(isIndividualWahaChatId('123@G.US')).toBe(false);
  });
});

describe('resolveCatalogChatActivityTimestamp', () => {
  it('returns milliseconds for unix timestamp', () => {
    const result = resolveCatalogChatActivityTimestamp({ timestamp: 1700000000 });
    expect(result).toBe(1700000000000);
  });

  it('returns as-is for millisecond timestamps', () => {
    const result = resolveCatalogChatActivityTimestamp({ timestamp: 1700000000000 });
    expect(result).toBe(1700000000000);
  });

  it('parses ISO date strings', () => {
    const result = resolveCatalogChatActivityTimestamp({
      lastMessageRecvTimestamp: '2026-01-01T00:00:00Z',
    });
    expect(result).toBeGreaterThan(0);
  });

  it('returns 0 for empty object', () => {
    expect(resolveCatalogChatActivityTimestamp({})).toBe(0);
  });

  it('reads from conversationTimestamp', () => {
    const result = resolveCatalogChatActivityTimestamp({
      conversationTimestamp: 1700000000000,
    });
    expect(result).toBe(1700000000000);
  });

  it('reads from last_time', () => {
    const result = resolveCatalogChatActivityTimestamp({ last_time: 1700000000 });
    expect(result).toBe(1700000000000);
  });

  it('skips null/undefined values and finds next candidate', () => {
    const result = resolveCatalogChatActivityTimestamp({
      _chat: null,
      timestamp: 1700000000,
    });
    expect(result).toBe(1700000000000);
  });
});
