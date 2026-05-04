import { describe, it, expect } from 'vitest';
import { extractExternalId } from '../flow-engine-external-id';

describe('extractExternalId', () => {
  it('returns null for null/undefined', () => {
    expect(extractExternalId(null)).toBeNull();
    expect(extractExternalId(undefined)).toBeNull();
  });
  it('returns null for primitives', () => {
    expect(extractExternalId('string')).toBeNull();
    expect(extractExternalId(123)).toBeNull();
    expect(extractExternalId(true)).toBeNull();
  });
  it('extracts id from first message in messages array', () => {
    expect(extractExternalId({ messages: [{ id: 'WA-msg-1' }] })).toBe('WA-msg-1');
  });
  it('extracts id from message.id directly', () => {
    expect(extractExternalId({ message: { id: 'direct-id' } })).toBe('direct-id');
  });
  it('extracts via first-string-candidate fallback', () => {
    expect(extractExternalId({ id: 'top-level-id' })).toBe('top-level-id');
    expect(extractExternalId({ messageId: 'msg-id' })).toBe('msg-id');
    expect(extractExternalId({ sid: 'session-id' })).toBe('session-id');
  });
  it('returns null when no id candidate found', () => {
    expect(extractExternalId({})).toBeNull();
    expect(extractExternalId({ messages: [] })).toBeNull();
  });
  it('prioritises messages over message over direct', () => {
    expect(
      extractExternalId({
        id: 'last',
        message: { id: 'second' },
        messages: [{ id: 'first' }],
      }),
    ).toBe('first');
  });
});
