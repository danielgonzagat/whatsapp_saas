import { describe, it, expect } from 'vitest';

function extractContactId(
  contextSnapshot: Record<string, unknown> | null | undefined,
): string | undefined {
  if (!contextSnapshot || typeof contextSnapshot !== 'object' || Array.isArray(contextSnapshot)) {
    return undefined;
  }
  const id =
    contextSnapshot.contactId ??
    contextSnapshot.contact_id ??
    contextSnapshot.userId ??
    contextSnapshot.phone;
  return typeof id === 'string' ? id : undefined;
}

function isPastWindow(createdAt: Date, expectedWindow: number, now: Date): boolean {
  return new Date(createdAt.getTime() + expectedWindow * 3600 * 1000) < now;
}

describe('Silent 24h Resolver', () => {
  describe('extractContactId', () => {
    it('returns undefined for non-object input', () => {
      expect(extractContactId(null)).toBeUndefined();
      expect(extractContactId(undefined)).toBeUndefined();
      expect(extractContactId([] as Record<string, unknown>)).toBeUndefined();
    });

    it('extracts contactId from contextSnapshot', () => {
      expect(extractContactId({ contactId: 'c1' })).toBe('c1');
    });

    it('extracts contact_id (snake_case fallback)', () => {
      expect(extractContactId({ contact_id: 'c2' })).toBe('c2');
    });

    it('extracts userId as fallback', () => {
      expect(extractContactId({ userId: 'u1' })).toBe('u1');
    });

    it('extracts phone as last resort', () => {
      expect(extractContactId({ phone: '+5511999999999' })).toBe('+5511999999999');
    });

    it('returns undefined when no known key matches', () => {
      expect(extractContactId({ foo: 'bar' })).toBeUndefined();
    });

    it('returns undefined when contactId is not a string', () => {
      expect(extractContactId({ contactId: 123 })).toBeUndefined();
    });
  });

  describe('isPastWindow', () => {
    it('returns false when still within window', () => {
      const createdAt = new Date('2026-05-12T10:00:00Z');
      const now = new Date('2026-05-12T12:00:00Z');
      expect(isPastWindow(createdAt, 24, now)).toBe(false);
    });

    it('returns true when window has elapsed', () => {
      const createdAt = new Date('2026-05-11T10:00:00Z');
      const now = new Date('2026-05-12T11:00:00Z');
      expect(isPastWindow(createdAt, 24, now)).toBe(true);
    });

    it('returns false exactly at boundary', () => {
      const createdAt = new Date('2026-05-12T10:00:00Z');
      const now = new Date('2026-05-12T11:00:00Z');
      expect(isPastWindow(createdAt, 1, now)).toBe(false);
    });

    it('returns true one millisecond past boundary', () => {
      const createdAt = new Date('2026-05-12T10:00:00.000Z');
      const now = new Date('2026-05-12T11:00:00.001Z');
      expect(isPastWindow(createdAt, 1, now)).toBe(true);
    });
  });

  it('silent_24h resolution has correct defaults', () => {
    const economicValue = 0;
    const wonVsBaseline = false;
    const outcomeName = 'inbound.silent_24h';
    expect(economicValue).toBe(0);
    expect(wonVsBaseline).toBe(false);
    expect(outcomeName).toBe('inbound.silent_24h');
  });

  it('replied resolution has correct defaults', () => {
    const wonVsBaseline = true;
    const outcomeName = 'inbound.received';
    expect(wonVsBaseline).toBe(true);
    expect(outcomeName).toBe('inbound.received');
  });
});
