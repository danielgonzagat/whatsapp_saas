import {
  isJsonRecord,
  resolveEventIntent,
  resolveEventStatus,
  toInputJsonObject,
  toInputJsonValue,
  toUnsupportedJsonValue,
} from './mind-event-spine.helpers';
import type { MindEventName } from './mind-event-taxonomy';

describe('mind-event-spine.helpers', () => {
  describe('isJsonRecord', () => {
    it('accepts plain objects', () => {
      expect(isJsonRecord({})).toBe(true);
      expect(isJsonRecord({ a: 1 })).toBe(true);
    });

    it('rejects arrays, null, and primitives', () => {
      expect(isJsonRecord([])).toBe(false);
      expect(isJsonRecord(null)).toBe(false);
      expect(isJsonRecord('s')).toBe(false);
      expect(isJsonRecord(1)).toBe(false);
      expect(isJsonRecord(undefined)).toBe(false);
    });
  });

  describe('toUnsupportedJsonValue', () => {
    it('serialises bigint via String()', () => {
      expect(toUnsupportedJsonValue(BigInt(42))).toBe('42');
    });

    it('returns descriptive sentinels for non-serialisable types', () => {
      expect(toUnsupportedJsonValue(() => 1)).toBe('function');
      expect(toUnsupportedJsonValue(Symbol('s'))).toBe('symbol');
      expect(toUnsupportedJsonValue(undefined)).toBe('undefined');
    });

    it('returns "unsupported" for anything else', () => {
      // Cast through unknown to bypass TS narrowing of `never` branch.
      expect(toUnsupportedJsonValue({})).toBe('unsupported');
    });
  });

  describe('toInputJsonValue', () => {
    it('passes through primitive JSON-safe types', () => {
      expect(toInputJsonValue('hello')).toBe('hello');
      expect(toInputJsonValue(true)).toBe(true);
      expect(toInputJsonValue(0)).toBe(0);
    });

    it('returns null for null and undefined', () => {
      expect(toInputJsonValue(null)).toBeNull();
      expect(toInputJsonValue(undefined)).toBeNull();
    });

    it('stringifies non-finite numbers', () => {
      expect(toInputJsonValue(Number.NaN)).toBe('NaN');
      expect(toInputJsonValue(Number.POSITIVE_INFINITY)).toBe('Infinity');
    });

    it('serialises Date instances as ISO strings', () => {
      const date = new Date('2026-01-02T03:04:05.000Z');
      expect(toInputJsonValue(date)).toBe('2026-01-02T03:04:05.000Z');
    });

    it('recurses into arrays', () => {
      expect(toInputJsonValue([1, 'a', null, undefined])).toEqual([1, 'a', null, null]);
    });

    it('recurses into plain objects', () => {
      expect(toInputJsonValue({ a: 1, b: { c: 'x' } })).toEqual({
        a: 1,
        b: { c: 'x' },
      });
    });

    it('routes exotic values through toUnsupportedJsonValue', () => {
      expect(toInputJsonValue(BigInt(7))).toBe('7');
      expect(toInputJsonValue(() => 1)).toBe('function');
      expect(toInputJsonValue(Symbol('s'))).toBe('symbol');
    });
  });

  describe('toInputJsonObject', () => {
    it('drops undefined entries before recursing', () => {
      expect(toInputJsonObject({ keep: 1, drop: undefined, nested: { a: 'x' } })).toEqual({
        keep: 1,
        nested: { a: 'x' },
      });
    });

    it('returns an empty object for an empty record', () => {
      expect(toInputJsonObject({})).toEqual({});
    });

    it('forwards exotic values to toInputJsonValue', () => {
      expect(toInputJsonObject({ big: BigInt(1), bad: NaN })).toEqual({
        big: '1',
        bad: 'NaN',
      });
    });
  });

  describe('resolveEventIntent', () => {
    const cases: Array<[MindEventName, string]> = [
      ['sale.confirmed', 'sale_lifecycle'],
      ['checkout.created', 'checkout_lifecycle'],
      ['message.received', 'message_lifecycle'],
      ['lead.captured', 'lead_lifecycle'],
      ['campaign.launched', 'campaign_lifecycle'],
      ['product.created', 'product_lifecycle'],
      ['brain.observed', 'brain_lifecycle'],
      ['mind.product.observed', 'mind_lifecycle'],
      ['capability.invoked', 'capability_lifecycle'],
      ['contact.created', 'contact_lifecycle'],
      ['channel.message.received', 'channel_lifecycle'],
      ['identity.linked', 'identity_lifecycle'],
      ['concept.tagged', 'concept_lifecycle'],
    ];

    it.each(cases)('maps %s → %s', (eventType, expected) => {
      expect(resolveEventIntent(eventType)).toBe(expected);
    });

    it('falls back to commercial_lifecycle for unknown prefixes', () => {
      expect(resolveEventIntent('agent.job.due')).toBe('commercial_lifecycle');
      expect(resolveEventIntent('mystery.event')).toBe('commercial_lifecycle');
    });
  });

  describe('resolveEventStatus', () => {
    it('returns "skipped" for cancelled / refunded / abandoned / disconnected suffixes', () => {
      expect(resolveEventStatus('sale.cancelled')).toBe('skipped');
      expect(resolveEventStatus('sale.refunded')).toBe('skipped');
      expect(resolveEventStatus('checkout.abandoned')).toBe('skipped');
      expect(resolveEventStatus('channel.disconnected')).toBe('skipped');
    });

    it('returns "error" for failed / externally_blocked suffixes', () => {
      expect(resolveEventStatus('message.failed')).toBe('error');
      expect(resolveEventStatus('message.externally_blocked')).toBe('error');
    });

    it('returns "executed" for the default lifecycle outcomes', () => {
      expect(resolveEventStatus('sale.confirmed')).toBe('executed');
      expect(resolveEventStatus('product.created')).toBe('executed');
      expect(resolveEventStatus('mind.product.observed')).toBe('executed');
    });
  });
});
