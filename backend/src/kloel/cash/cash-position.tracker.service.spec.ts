import { CashPositionTrackerService } from './cash-position.tracker.service';

const NOW = Date.parse('2026-05-14T12:00:00.000Z');
const WKS = 'wks_cash_test';

function iso(offsetDays: number): string {
  return new Date(NOW + offsetDays * 24 * 60 * 60 * 1000).toISOString();
}

describe('CashPositionTrackerService', () => {
  let service: CashPositionTrackerService;

  beforeEach(() => {
    service = new CashPositionTrackerService();
  });

  describe('getPosition', () => {
    it('returns zero position for empty workspace', () => {
      const pos = service.getPosition(WKS, 30, NOW);
      expect(pos.inflow).toBe(0n);
      expect(pos.outflow).toBe(0n);
      expect(pos.net).toBe(0n);
      expect(pos.eventCount).toBe(0);
      expect(pos.windowStart).toBeDefined();
      expect(pos.windowEnd).toBeDefined();
    });

    it('captures a single commerce.payment.approved as inflow', () => {
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-2), 50000n);
      const pos = service.getPosition(WKS, 30, NOW);
      expect(pos.inflow).toBe(50000n);
      expect(pos.outflow).toBe(0n);
      expect(pos.net).toBe(50000n);
      expect(pos.eventCount).toBe(1);
    });

    it('captures a single commerce.payment.refunded as outflow', () => {
      service.recordEvent(WKS, 'commerce.payment.refunded', iso(-1), 12000n);
      const pos = service.getPosition(WKS, 30, NOW);
      expect(pos.inflow).toBe(0n);
      expect(pos.outflow).toBe(12000n);
      expect(pos.net).toBe(-12000n);
      expect(pos.eventCount).toBe(1);
    });

    it('sums multiple approved events', () => {
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-3), 10000n);
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-2), 20000n);
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-1), 15000n);
      const pos = service.getPosition(WKS, 30, NOW);
      expect(pos.inflow).toBe(45000n);
      expect(pos.outflow).toBe(0n);
      expect(pos.net).toBe(45000n);
      expect(pos.eventCount).toBe(3);
    });

    it('sums multiple refunded events', () => {
      service.recordEvent(WKS, 'commerce.payment.refunded', iso(-4), 5000n);
      service.recordEvent(WKS, 'commerce.payment.refunded', iso(-2), 7000n);
      const pos = service.getPosition(WKS, 30, NOW);
      expect(pos.inflow).toBe(0n);
      expect(pos.outflow).toBe(12000n);
      expect(pos.net).toBe(-12000n);
      expect(pos.eventCount).toBe(2);
    });

    it('computes net correctly for mixed inflow and outflow', () => {
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-5), 100000n);
      service.recordEvent(WKS, 'commerce.payment.refunded', iso(-3), 30000n);
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-1), 20000n);
      const pos = service.getPosition(WKS, 30, NOW);
      expect(pos.inflow).toBe(120000n);
      expect(pos.outflow).toBe(30000n);
      expect(pos.net).toBe(90000n);
      expect(pos.eventCount).toBe(3);
    });

    it('includes events within the window', () => {
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-5), 10000n);
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-3), 20000n);
      const pos = service.getPosition(WKS, 7, NOW);
      expect(pos.inflow).toBe(30000n);
      expect(pos.eventCount).toBe(2);
    });

    it('excludes events outside the window', () => {
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-15), 50000n);
      service.recordEvent(WKS, 'commerce.payment.refunded', iso(-12), 10000n);
      const pos = service.getPosition(WKS, 7, NOW);
      expect(pos.inflow).toBe(0n);
      expect(pos.outflow).toBe(0n);
      expect(pos.net).toBe(0n);
      expect(pos.eventCount).toBe(0);
    });

    it('isolates workspaces', () => {
      service.recordEvent('wks_a', 'commerce.payment.approved', iso(-1), 10000n);
      service.recordEvent('wks_b', 'commerce.payment.approved', iso(-1), 5000n);
      const posA = service.getPosition('wks_a', 30, NOW);
      const posB = service.getPosition('wks_b', 30, NOW);
      expect(posA.inflow).toBe(10000n);
      expect(posB.inflow).toBe(5000n);
      expect(posA.eventCount).toBe(1);
      expect(posB.eventCount).toBe(1);
    });

    it('ignores unknown event names', () => {
      service.recordEvent(WKS, 'commerce.payment.initiated', iso(-1), 50000n);
      service.recordEvent(WKS, 'commerce.payment.declined', iso(-1), 20000n);
      service.recordEvent(WKS, 'commerce.lead.created', iso(-1), 10000n);
      const pos = service.getPosition(WKS, 30, NOW);
      expect(pos.inflow).toBe(0n);
      expect(pos.outflow).toBe(0n);
      expect(pos.net).toBe(0n);
      expect(pos.eventCount).toBe(3);
    });

    it('accumulates across multiple recordEvent calls', () => {
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-2), 5000n);
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-2), 5000n);
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-2), 5000n);
      const pos = service.getPosition(WKS, 30, NOW);
      expect(pos.inflow).toBe(15000n);
      expect(pos.eventCount).toBe(3);
    });

    it('window of zero days returns only events at exact asOf', () => {
      service.recordEvent(WKS, 'commerce.payment.approved', iso(0), 10000n);
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-1), 20000n);
      const pos = service.getPosition(WKS, 0, NOW);
      expect(pos.inflow).toBe(10000n);
      expect(pos.eventCount).toBe(1);
    });

    it('event at exact window boundary is included', () => {
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-7), 30000n);
      const pos = service.getPosition(WKS, 7, NOW);
      expect(pos.inflow).toBe(30000n);
      expect(pos.eventCount).toBe(1);
    });

    it('windowStart and windowEnd are valid ISO strings', () => {
      const pos = service.getPosition(WKS, 14, NOW);
      expect(pos.windowStart).toBe(iso(-14));
      expect(pos.windowEnd).toBe(iso(0));
    });
  });

  describe('computeRunwayDays', () => {
    it('returns finite runway when net is positive and burn is positive', () => {
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-10), 300000n);
      const result = service.computeRunwayDays(WKS, 90000n);
      expect(result.netPositionCents).toBe(300000n);
      expect(result.burnRateDailyCents).toBe(3000);
      expect(result.runwayDays).toBe(100);
    });

    it('returns zero runway when net is negative', () => {
      service.recordEvent(WKS, 'commerce.payment.refunded', iso(-3), 50000n);
      const result = service.computeRunwayDays(WKS, 10000n);
      expect(result.netPositionCents).toBe(-50000n);
      expect(result.runwayDays).toBe(0);
    });

    it('returns infinite runway when burn is zero and net is positive', () => {
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-1), 100000n);
      const result = service.computeRunwayDays(WKS, 0n);
      expect(result.runwayDays).toBe(Number.POSITIVE_INFINITY);
    });

    it('returns zero runway when burn is zero and net is zero', () => {
      const result = service.computeRunwayDays(WKS, 0n);
      expect(result.runwayDays).toBe(0);
      expect(result.netPositionCents).toBe(0n);
    });

    it('returns zero runway when burn is zero and net is negative', () => {
      service.recordEvent(WKS, 'commerce.payment.refunded', iso(-1), 50000n);
      const result = service.computeRunwayDays(WKS, 0n);
      expect(result.runwayDays).toBe(0);
    });

    it('uses all historical events regardless of window', () => {
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-60), 600000n);
      service.recordEvent(WKS, 'commerce.payment.refunded', iso(-50), 100000n);
      const result = service.computeRunwayDays(WKS, 150000n);
      expect(result.netPositionCents).toBe(500000n);
      expect(result.runwayDays).toBe(100);
    });
  });

  describe('clear', () => {
    it('resets all events', () => {
      service.recordEvent(WKS, 'commerce.payment.approved', iso(-1), 50000n);
      service.clear();
      const pos = service.getPosition(WKS, 30, NOW);
      expect(pos.eventCount).toBe(0);
      expect(pos.net).toBe(0n);
    });
  });
});
