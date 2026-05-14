import {
  TimeToValueService,
  type TimeToValueDistribution,
} from './time-to-value.service';

function ms(minutes: number): number {
  return minutes * 60 * 1000;
}

function d(date: string): Date {
  return new Date(date);
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + ms(minutes));
}

describe('TimeToValueService', () => {
  let service: TimeToValueService;

  beforeEach(() => {
    service = new TimeToValueService();
  });

  // ---------------------------------------------------------------------------
  // No events
  // ---------------------------------------------------------------------------
  describe('with no events recorded', () => {
    it('getTimeToValueMs returns null for any workspace', () => {
      expect(service.getTimeToValueMs('wks_1')).toBeNull();
    });

    it('getMedianTimeToValueMs returns 0', () => {
      expect(service.getMedianTimeToValueMs()).toBe(0);
    });

    it('getDistribution returns empty entries with zero stats', () => {
      const dist = service.getDistribution();
      expect(dist.entries).toEqual([]);
      expect(dist.count).toBe(0);
      expect(dist.minMs).toBe(0);
      expect(dist.maxMs).toBe(0);
      expect(dist.meanMs).toBe(0);
      expect(dist.medianMs).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Partial events — only lead, no value
  // ---------------------------------------------------------------------------
  describe('with only lead.created but no value event', () => {
    it('getTimeToValueMs returns null (value not yet reached)', () => {
      service.recordEvent('wks_1', 'commerce.lead.created', d('2026-05-01T10:00:00Z'));
      expect(service.getTimeToValueMs('wks_1')).toBeNull();
    });

    it('median and distribution ignore workspaces with partial data', () => {
      service.recordEvent('wks_1', 'commerce.lead.created', d('2026-05-01T10:00:00Z'));
      expect(service.getMedianTimeToValueMs()).toBe(0);
      expect(service.getDistribution().count).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Partial events — only value, no lead
  // ---------------------------------------------------------------------------
  describe('with only a value event but no lead.created', () => {
    it('getTimeToValueMs returns null (lead not yet tracked)', () => {
      service.recordEvent('wks_2', 'commerce.payment.approved', d('2026-05-05T12:00:00Z'));
      expect(service.getTimeToValueMs('wks_2')).toBeNull();
    });

    it('does not crash when lead arrives later with epoch marker displaced', () => {
      service.recordEvent('wks_3', 'commerce.crm.deal_won', d('2026-05-10T09:00:00Z'));
      service.recordEvent('wks_3', 'commerce.lead.created', d('2026-05-10T08:00:00Z'));
      expect(service.getTimeToValueMs('wks_3')).toBe(ms(60));
    });
  });

  // ---------------------------------------------------------------------------
  // Happy path — lead created, then value confirmed
  // ---------------------------------------------------------------------------
  describe('happy path — lead created then value confirmed', () => {
    const lead = d('2026-05-01T10:00:00Z');

    it('computes TTV for commerce.payment.approved', () => {
      service.recordEvent('wks_1', 'commerce.lead.created', lead);
      service.recordEvent('wks_1', 'commerce.payment.approved', addMinutes(lead, 45));
      expect(service.getTimeToValueMs('wks_1')).toBe(ms(45));
    });

    it('computes TTV for commerce.post_sale.first_value_obtained', () => {
      service.recordEvent('wks_2', 'commerce.lead.created', lead);
      service.recordEvent('wks_2', 'commerce.post_sale.first_value_obtained', addMinutes(lead, 120));
      expect(service.getTimeToValueMs('wks_2')).toBe(ms(120));
    });

    it('computes TTV for commerce.crm.deal_won', () => {
      service.recordEvent('wks_3', 'commerce.lead.created', lead);
      service.recordEvent('wks_3', 'commerce.crm.deal_won', addMinutes(lead, 200));
      expect(service.getTimeToValueMs('wks_3')).toBe(ms(200));
    });
  });

  // ---------------------------------------------------------------------------
  // Multiple workspaces — median and distribution
  // ---------------------------------------------------------------------------
  describe('multiple workspaces with complete data', () => {
    const base = d('2026-05-01T10:00:00Z');

    beforeEach(() => {
      service.recordEvent('a', 'commerce.lead.created', base);
      service.recordEvent('a', 'commerce.payment.approved', addMinutes(base, 30));

      service.recordEvent('b', 'commerce.lead.created', base);
      service.recordEvent('b', 'commerce.crm.deal_won', addMinutes(base, 90));

      service.recordEvent('c', 'commerce.lead.created', base);
      service.recordEvent('c', 'commerce.post_sale.first_value_obtained', addMinutes(base, 150));
    });

    it('getTimeToValueMs returns correct value per workspace', () => {
      expect(service.getTimeToValueMs('a')).toBe(ms(30));
      expect(service.getTimeToValueMs('b')).toBe(ms(90));
      expect(service.getTimeToValueMs('c')).toBe(ms(150));
    });

    it('getMedianTimeToValueMs returns the middle duration', () => {
      expect(service.getMedianTimeToValueMs()).toBe(ms(90));
    });

    it('getDistribution returns sorted entries and correct stats (odd count)', () => {
      const dist = service.getDistribution();
      expect(dist.count).toBe(3);
      expect(dist.entries.map((e) => e.workspaceId)).toEqual(['a', 'b', 'c']);
      expect(dist.entries.map((e) => e.durationMs)).toEqual([ms(30), ms(90), ms(150)]);
      expect(dist.minMs).toBe(ms(30));
      expect(dist.maxMs).toBe(ms(150));
      expect(dist.meanMs).toBe(ms(90));
      expect(dist.medianMs).toBe(ms(90));
    });
  });

  // ---------------------------------------------------------------------------
  // Median with even number of workspaces
  // ---------------------------------------------------------------------------
  describe('median with even number of durations', () => {
    const base = d('2026-05-01T10:00:00Z');

    beforeEach(() => {
      service.recordEvent('a', 'commerce.lead.created', base);
      service.recordEvent('a', 'commerce.payment.approved', addMinutes(base, 10));

      service.recordEvent('b', 'commerce.lead.created', base);
      service.recordEvent('b', 'commerce.payment.approved', addMinutes(base, 30));

      service.recordEvent('c', 'commerce.lead.created', base);
      service.recordEvent('c', 'commerce.payment.approved', addMinutes(base, 50));

      service.recordEvent('d', 'commerce.lead.created', base);
      service.recordEvent('d', 'commerce.payment.approved', addMinutes(base, 70));
    });

    it('getMedianTimeToValueMs averages the two middle values', () => {
      expect(service.getMedianTimeToValueMs()).toBe(ms(40));
    });

    it('getDistribution reports correct medianMs', () => {
      expect(service.getDistribution().medianMs).toBe(ms(40));
    });
  });

  // ---------------------------------------------------------------------------
  // Events out of order
  // ---------------------------------------------------------------------------
  describe('events recorded out of chronological order', () => {
    it('uses earliest lead.created when multiple are recorded', () => {
      service.recordEvent('wks_1', 'commerce.lead.created', d('2026-05-05T12:00:00Z'));
      service.recordEvent('wks_1', 'commerce.lead.created', d('2026-05-04T12:00:00Z'));
      service.recordEvent('wks_1', 'commerce.payment.approved', d('2026-05-06T12:00:00Z'));
      expect(service.getTimeToValueMs('wks_1')).toBe(ms(2880));
    });

    it('uses earliest value event when multiple value events are recorded', () => {
      service.recordEvent('wks_2', 'commerce.lead.created', d('2026-05-01T10:00:00Z'));
      service.recordEvent('wks_2', 'commerce.payment.approved', d('2026-05-10T10:00:00Z'));
      service.recordEvent('wks_2', 'commerce.crm.deal_won', d('2026-05-05T10:00:00Z'));
      expect(service.getTimeToValueMs('wks_2')).toBe(ms(5760));
    });

    it('handles value event arriving before lead event (both eventually received)', () => {
      service.recordEvent('wks_3', 'commerce.payment.approved', d('2026-05-05T12:00:00Z'));
      service.recordEvent('wks_3', 'commerce.lead.created', d('2026-05-01T10:00:00Z'));
      expect(service.getTimeToValueMs('wks_3')).toBe(ms(5880));
    });

    it('replaces epoch-marker leadCreatedAt when real lead event arrives after value', () => {
      service.recordEvent('wks_4', 'commerce.crm.deal_won', d('2026-05-05T12:00:00Z'));
      service.recordEvent('wks_4', 'commerce.lead.created', d('2026-05-01T10:00:00Z'));
      expect(service.getTimeToValueMs('wks_4')).toBe(ms(5880));
    });
  });

  // ---------------------------------------------------------------------------
  // Workspace isolation
  // ---------------------------------------------------------------------------
  describe('workspace isolation', () => {
    it('does not leak state between workspaces', () => {
      service.recordEvent('a', 'commerce.lead.created', d('2026-05-01T10:00:00Z'));
      service.recordEvent('a', 'commerce.payment.approved', d('2026-05-01T10:30:00Z'));

      service.recordEvent('b', 'commerce.lead.created', d('2026-05-10T10:00:00Z'));
      service.recordEvent('b', 'commerce.post_sale.first_value_obtained', d('2026-05-11T10:00:00Z'));

      expect(service.getTimeToValueMs('a')).toBe(ms(30));
      expect(service.getTimeToValueMs('b')).toBe(ms(1440));
      expect(service.getTimeToValueMs('c')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Mixed complete and incomplete — median/distribution only uses complete
  // ---------------------------------------------------------------------------
  describe('mixed complete and incomplete workspaces', () => {
    const base = d('2026-05-01T10:00:00Z');

    beforeEach(() => {
      service.recordEvent('a', 'commerce.lead.created', base);
      service.recordEvent('a', 'commerce.payment.approved', addMinutes(base, 10));

      service.recordEvent('b', 'commerce.lead.created', base);
      service.recordEvent('b', 'commerce.payment.approved', addMinutes(base, 50));

      service.recordEvent('c', 'commerce.lead.created', base);

      service.recordEvent('d', 'commerce.payment.approved', addMinutes(base, 100));
    });

    it('getMedianTimeToValueMs ignores incomplete workspaces', () => {
      expect(service.getMedianTimeToValueMs()).toBe(ms(30));
    });

    it('getDistribution count excludes incomplete workspaces', () => {
      expect(service.getDistribution().count).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown event names
  // ---------------------------------------------------------------------------
  describe('unknown event names', () => {
    it('does not affect tracked state', () => {
      service.recordEvent('wks_1', 'commerce.lead.created', d('2026-05-01T10:00:00Z'));
      service.recordEvent('wks_1', 'commerce.cart.abandoned', d('2026-05-02T10:00:00Z'));
      service.recordEvent('wks_1', 'commerce.payment.approved', d('2026-05-03T10:00:00Z'));
      expect(service.getTimeToValueMs('wks_1')).toBe(ms(2880));
    });
  });

  // ---------------------------------------------------------------------------
  // Distribution stats — percentiles
  // ---------------------------------------------------------------------------
  describe('distribution percentile computation', () => {
    const base = d('2026-01-01T00:00:00Z');

    beforeEach(() => {
      for (let i = 0; i < 100; i++) {
        const wid = `wks_${i}`;
        service.recordEvent(wid, 'commerce.lead.created', base);
        service.recordEvent(wid, 'commerce.payment.approved', addMinutes(base, (i + 1) * 10));
      }
    });

    it('computes p75 correctly', () => {
      const dist = service.getDistribution();
      expect(dist.p75Ms).toBe(ms(10 * 75));
    });

    it('computes p90 correctly', () => {
      const dist = service.getDistribution();
      expect(dist.p90Ms).toBe(ms(10 * 90));
    });

    it('computes p95 correctly', () => {
      const dist = service.getDistribution();
      expect(dist.p95Ms).toBe(ms(10 * 95));
    });

    it('computes p99 correctly', () => {
      const dist = service.getDistribution();
      expect(dist.p99Ms).toBe(ms(10 * 99));
    });
  });

  // ---------------------------------------------------------------------------
  // Edge: value event with same timestamp as lead
  // ---------------------------------------------------------------------------
  describe('instant value (same timestamp)', () => {
    it('returns zero duration', () => {
      const ts = d('2026-05-01T10:00:00Z');
      service.recordEvent('wks_1', 'commerce.lead.created', ts);
      service.recordEvent('wks_1', 'commerce.payment.approved', ts);
      expect(service.getTimeToValueMs('wks_1')).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Edge: negative duration prevented (value before lead with no correction)
  // ---------------------------------------------------------------------------
  describe('value before lead with no subsequent correction', () => {
    it('returns null (epoch marker not overridden)', () => {
      service.recordEvent('wks_1', 'commerce.payment.approved', d('2026-05-01T10:00:00Z'));
      expect(service.getTimeToValueMs('wks_1')).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Large scale: many workspaces, single-value workspaces ignored
  // ---------------------------------------------------------------------------
  describe('large scale — hundreds of workspaces', () => {
    it('handles many workspaces without performance degradation', () => {
      const base = d('2026-01-01T00:00:00Z');
      for (let i = 0; i < 500; i++) {
        service.recordEvent(`wks_${i}`, 'commerce.lead.created', base);
        if (i % 2 === 0) {
          service.recordEvent(`wks_${i}`, 'commerce.payment.approved', addMinutes(base, i + 1));
        }
      }
      const dist = service.getDistribution();
      expect(dist.count).toBe(250);
      expect(dist.minMs).toBeGreaterThan(0);
    });
  });
});
