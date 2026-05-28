import {
  PAYMENT_KEYWORDS,
  aggregateEventTaxonomy,
  averageRoundedOrNull,
  buildLatestContactActionMap,
  computeReplyAggregates,
  filterImpactableEvents,
  groupInboundByContact,
  safeRate,
  summarizeDailyTimeline,
  summarizeTopIntents,
} from './autopilot-analytics-insights.helpers';

describe('autopilot-analytics-insights.helpers', () => {
  describe('PAYMENT_KEYWORDS', () => {
    it('exposes the canonical Portuguese payment cues', () => {
      expect([...PAYMENT_KEYWORDS]).toEqual([
        'paguei',
        'pago',
        'pix',
        'pague',
        'comprei',
        'compre',
        'boleto',
        'assinatura',
      ]);
    });

    it('is frozen so callers cannot mutate the cue list', () => {
      expect(Object.isFrozen(PAYMENT_KEYWORDS)).toBe(true);
    });
  });

  describe('filterImpactableEvents', () => {
    const ts = new Date('2026-05-01T12:00:00Z');

    it('keeps rows whose status is executed', () => {
      const rows = [
        { contactId: 'c1', createdAt: ts, action: 'SEND', status: 'executed' },
        { contactId: 'c2', createdAt: ts, action: 'SEND', status: 'failed' },
      ];
      expect(filterImpactableEvents(rows)).toEqual([rows[0]]);
    });

    it('treats null/undefined status as executed', () => {
      const rows = [
        { contactId: 'c1', createdAt: ts, action: 'SEND', status: null },
        { contactId: 'c2', createdAt: ts, action: 'SEND', status: '' },
      ];
      expect(filterImpactableEvents(rows)).toEqual(rows);
    });

    it('keeps CONVERSION rows regardless of status', () => {
      const rows = [
        { contactId: 'c1', createdAt: ts, action: 'CONVERSION', status: 'failed' },
        { contactId: 'c2', createdAt: ts, action: 'CONVERSION', status: 'error' },
      ];
      expect(filterImpactableEvents(rows)).toEqual(rows);
    });

    it('drops non-CONVERSION rows with a non-executed status', () => {
      const rows = [
        { contactId: 'c1', createdAt: ts, action: 'SEND', status: 'error' },
        { contactId: 'c2', createdAt: ts, action: 'NOOP', status: 'skipped' },
      ];
      expect(filterImpactableEvents(rows)).toEqual([]);
    });
  });

  describe('buildLatestContactActionMap', () => {
    const t1 = new Date('2026-05-01T10:00:00Z');
    const t2 = new Date('2026-05-01T11:00:00Z');
    const t3 = new Date('2026-05-01T12:00:00Z');

    it('returns an empty map for an empty input', () => {
      expect(buildLatestContactActionMap([])).toEqual(new Map());
    });

    it('keeps only the newest timestamp per contact', () => {
      const rows = [
        { contactId: 'c1', createdAt: t1, action: 'SEND', status: 'executed' },
        { contactId: 'c1', createdAt: t3, action: 'SEND', status: 'executed' },
        { contactId: 'c1', createdAt: t2, action: 'SEND', status: 'executed' },
        { contactId: 'c2', createdAt: t2, action: 'SEND', status: 'executed' },
      ];
      const map = buildLatestContactActionMap(rows);
      expect(map.get('c1')).toBe(t3.getTime());
      expect(map.get('c2')).toBe(t2.getTime());
      expect(map.size).toBe(2);
    });

    it('skips rows with a null contactId', () => {
      const rows = [
        { contactId: null, createdAt: t1, action: 'SEND', status: 'executed' },
        { contactId: 'c1', createdAt: t2, action: 'SEND', status: 'executed' },
      ];
      const map = buildLatestContactActionMap(rows);
      expect([...map.keys()]).toEqual(['c1']);
    });
  });

  describe('groupInboundByContact', () => {
    const t1 = new Date('2026-05-01T10:00:00Z');
    const t2 = new Date('2026-05-01T11:00:00Z');

    it('groups dates by contactId preserving input order', () => {
      const map = groupInboundByContact([
        { contactId: 'c1', createdAt: t1 },
        { contactId: 'c2', createdAt: t1 },
        { contactId: 'c1', createdAt: t2 },
      ]);
      expect(map.get('c1')).toEqual([t1, t2]);
      expect(map.get('c2')).toEqual([t1]);
    });

    it('skips rows whose contactId is null', () => {
      const map = groupInboundByContact([
        { contactId: null, createdAt: t1 },
        { contactId: 'c1', createdAt: t2 },
      ]);
      expect([...map.keys()]).toEqual(['c1']);
    });

    it('returns an empty map for an empty input', () => {
      expect(groupInboundByContact([])).toEqual(new Map());
    });
  });

  describe('computeReplyAggregates', () => {
    const actionTs = new Date('2026-05-01T10:00:00Z').getTime();
    const earlyReply = new Date('2026-05-01T09:00:00Z'); // BEFORE action — must be ignored
    const reply1 = new Date('2026-05-01T10:30:00Z'); // 30min after
    const reply2 = new Date('2026-05-01T11:30:00Z'); // 90min after

    it('counts only replies after the action timestamp', () => {
      const contactActions = new Map([['c1', actionTs]]);
      const inbound = new Map([['c1', [earlyReply, reply1, reply2]]]);
      const contactMap = new Map([['c1', { id: 'c1', phone: '+55', name: 'Alice' }]]);

      const result = computeReplyAggregates(contactActions, inbound, contactMap);
      expect(result.repliedContacts).toBe(1);
      // earlyReply (09:00) is filtered out because it is before actionTs (10:00)
      expect(result.totalReplies).toBe(2);
      // first surviving reply is reply1 — its delay drives the sample
      expect(result.replyDelays).toEqual([30]);
    });

    it('discards replies whose createdAt is <= actionTs', () => {
      const contactActions = new Map([['c1', actionTs]]);
      const inbound = new Map([['c1', [earlyReply]]]);
      const contactMap = new Map([['c1', { id: 'c1', phone: '+55', name: 'Alice' }]]);

      const result = computeReplyAggregates(contactActions, inbound, contactMap);
      expect(result.repliedContacts).toBe(0);
      expect(result.totalReplies).toBe(0);
      expect(result.replyDelays).toEqual([]);
      expect(result.samples).toEqual([]);
    });

    it('emits a sample using contact name when available', () => {
      const contactActions = new Map([['c1', actionTs]]);
      const inbound = new Map([['c1', [reply1, reply2]]]);
      const contactMap = new Map([['c1', { id: 'c1', phone: '+55', name: 'Alice' }]]);

      const result = computeReplyAggregates(contactActions, inbound, contactMap);
      expect(result.samples).toEqual([
        { contactId: 'c1', contact: 'Alice', replyAt: reply1, delayMinutes: 30 },
      ]);
      expect(result.replyDelays).toEqual([30]);
    });

    it('falls back to phone when contact name is null', () => {
      const contactActions = new Map([['c1', actionTs]]);
      const inbound = new Map([['c1', [reply1]]]);
      const contactMap = new Map([['c1', { id: 'c1', phone: '+55', name: null }]]);

      const result = computeReplyAggregates(contactActions, inbound, contactMap);
      expect(result.samples[0]?.contact).toBe('+55');
    });

    it('caps samples at the configured limit', () => {
      const contactActions = new Map<string, number>();
      const inbound = new Map<string, Date[]>();
      const contactMap = new Map<string, { id: string; phone: string; name: string | null }>();
      for (let i = 0; i < 10; i++) {
        const id = `c${i}`;
        contactActions.set(id, actionTs);
        inbound.set(id, [reply1]);
        contactMap.set(id, { id, phone: `+55-${i}`, name: null });
      }

      const result = computeReplyAggregates(contactActions, inbound, contactMap);
      expect(result.samples).toHaveLength(5);
      expect(result.repliedContacts).toBe(10);
    });

    it('honors a custom sample limit', () => {
      const contactActions = new Map([['c1', actionTs]]);
      const inbound = new Map([['c1', [reply1]]]);
      const contactMap = new Map([['c1', { id: 'c1', phone: '+55', name: 'Alice' }]]);

      const result = computeReplyAggregates(contactActions, inbound, contactMap, 0);
      expect(result.samples).toEqual([]);
    });

    it('skips sample emission when contact is missing from contactMap', () => {
      const contactActions = new Map([['c-missing', actionTs]]);
      const inbound = new Map([['c-missing', [reply1]]]);
      const contactMap = new Map<string, { id: string; phone: string; name: string | null }>();

      const result = computeReplyAggregates(contactActions, inbound, contactMap);
      expect(result.repliedContacts).toBe(1);
      expect(result.samples).toEqual([]);
    });

    it('handles contacts with no inbound messages cleanly', () => {
      const contactActions = new Map([['c1', actionTs]]);
      const inbound = new Map<string, Date[]>();
      const contactMap = new Map([['c1', { id: 'c1', phone: '+55', name: 'Alice' }]]);

      const result = computeReplyAggregates(contactActions, inbound, contactMap);
      expect(result.repliedContacts).toBe(0);
      expect(result.totalReplies).toBe(0);
    });
  });

  describe('averageRoundedOrNull', () => {
    it('returns null for an empty array', () => {
      expect(averageRoundedOrNull([])).toBeNull();
    });

    it('rounds the mean to the nearest integer', () => {
      expect(averageRoundedOrNull([10, 20, 30])).toBe(20);
      expect(averageRoundedOrNull([1, 2, 4])).toBe(2); // 7/3 = 2.33 → 2
      expect(averageRoundedOrNull([1, 2, 3, 4])).toBe(3); // 10/4 = 2.5 → 3
    });

    it('handles single-element arrays', () => {
      expect(averageRoundedOrNull([42])).toBe(42);
    });
  });

  describe('safeRate', () => {
    it('returns the ratio when denominator is positive', () => {
      expect(safeRate(3, 10)).toBe(0.3);
    });

    it('returns 0 when denominator is zero', () => {
      expect(safeRate(5, 0)).toBe(0);
    });

    it('returns 0 when denominator is negative', () => {
      expect(safeRate(5, -1)).toBe(0);
    });
  });

  describe('aggregateEventTaxonomy', () => {
    it('returns zeros and empty buckets for empty input', () => {
      expect(aggregateEventTaxonomy([])).toEqual({
        executed: 0,
        errors: 0,
        intents: {},
        actions: {},
      });
    });

    it('counts executed vs errors and ignores other statuses', () => {
      const result = aggregateEventTaxonomy([
        { intent: 'BUY', action: 'SEND', status: 'executed' },
        { intent: 'BUY', action: 'SEND', status: 'error' },
        { intent: 'ASK', action: 'NOOP', status: 'failed' },
        { intent: 'ASK', action: 'NOOP', status: 'skipped' },
      ]);
      expect(result.executed).toBe(1);
      expect(result.errors).toBe(2);
    });

    it('buckets intents and actions, defaulting null to UNKNOWN', () => {
      const result = aggregateEventTaxonomy([
        { intent: null, action: null, status: 'executed' },
        { intent: 'BUY', action: 'SEND', status: 'executed' },
        { intent: 'BUY', action: null, status: 'executed' },
      ]);
      expect(result.intents).toEqual({ UNKNOWN: 1, BUY: 2 });
      expect(result.actions).toEqual({ UNKNOWN: 2, SEND: 1 });
    });
  });

  describe('summarizeTopIntents', () => {
    it('returns an empty string for an empty bucket', () => {
      expect(summarizeTopIntents({})).toBe('');
    });

    it('orders by count desc and takes the top N', () => {
      const result = summarizeTopIntents({ BUY: 10, ASK: 30, GREET: 5, COMPLAIN: 20 }, 3);
      expect(result).toBe('ASK:30, COMPLAIN:20, BUY:10');
    });

    it('defaults to top 3', () => {
      const result = summarizeTopIntents({ A: 4, B: 3, C: 2, D: 1 });
      expect(result.split(', ')).toHaveLength(3);
    });
  });

  describe('summarizeDailyTimeline', () => {
    it("returns 'n/a' for non-array input", () => {
      expect(summarizeDailyTimeline(null)).toBe('n/a');
      expect(summarizeDailyTimeline(undefined)).toBe('n/a');
      expect(summarizeDailyTimeline({})).toBe('n/a');
    });

    it('renders Date timestamps as ISO strings sorted ascending', () => {
      const d2 = new Date('2026-05-02T00:00:00Z');
      const d1 = new Date('2026-05-01T00:00:00Z');
      const result = summarizeDailyTimeline([
        { createdAt: d2, _count: { _all: 5 } },
        { createdAt: d1, _count: { _all: 2 } },
      ]);
      expect(result).toBe('2026-05-01T00:00:00.000Z:2, 2026-05-02T00:00:00.000Z:5');
    });

    it("coerces missing counts to 0 and unknown createdAt to 'unknown'", () => {
      const result = summarizeDailyTimeline([
        { createdAt: null, _count: null },
        { createdAt: undefined, _count: { _all: 'oops' } },
      ]);
      expect(result.split(', ').sort()).toEqual(['unknown:0', 'unknown:0']);
    });

    it('returns an empty string for an empty array', () => {
      expect(summarizeDailyTimeline([])).toBe('');
    });
  });
});
