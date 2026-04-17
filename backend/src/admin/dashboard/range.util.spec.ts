import { resolveAdminHomeRange, type AdminHomePeriod, type AdminHomeCompare } from './range.util';

const FROZEN_NOW = new Date('2026-04-15T14:30:00.000Z');

describe('resolveAdminHomeRange', () => {
  const resolve = (period: AdminHomePeriod, compare: AdminHomeCompare = 'PREVIOUS') =>
    resolveAdminHomeRange({ period, compare, now: FROZEN_NOW });

  describe('TODAY', () => {
    it('covers the full UTC day of `now`', () => {
      const r = resolve('TODAY');
      expect(r.from.toISOString()).toBe('2026-04-15T00:00:00.000Z');
      expect(r.to.toISOString()).toBe('2026-04-15T23:59:59.999Z');
      expect(r.label).toBe('Hoje');
    });

    it('previous-period is the full prior UTC day', () => {
      const r = resolve('TODAY', 'PREVIOUS');
      expect(r.previous?.from.toISOString()).toBe('2026-04-14T00:00:00.000Z');
      expect(r.previous?.to.toISOString()).toBe('2026-04-14T23:59:59.999Z');
    });

    it('YoY is the same UTC day one year earlier', () => {
      const r = resolve('TODAY', 'YOY');
      expect(r.previous?.from.toISOString()).toBe('2025-04-15T00:00:00.000Z');
      expect(r.previous?.to.toISOString()).toBe('2025-04-15T23:59:59.999Z');
    });
  });

  describe('30D window', () => {
    it('30D runs 30 days back', () => {
      const r = resolve('30D');
      expect(r.from.toISOString().slice(0, 10)).toBe('2026-03-17');
      expect(r.to.toISOString().slice(0, 10)).toBe('2026-04-15');
    });
  });

  describe('CUSTOM', () => {
    it('requires both endpoints', () => {
      expect(() => resolveAdminHomeRange({ period: 'CUSTOM', now: FROZEN_NOW })).toThrow(
        /requires both/,
      );
    });
    it('rejects inverted range', () => {
      expect(() =>
        resolveAdminHomeRange({
          period: 'CUSTOM',
          from: new Date('2026-04-10'),
          to: new Date('2026-04-01'),
          now: FROZEN_NOW,
        }),
      ).toThrow(/from.*<=.*to/);
    });
    it('normalizes to full-day boundaries', () => {
      const r = resolveAdminHomeRange({
        period: 'CUSTOM',
        from: new Date('2026-04-01T12:34:56Z'),
        to: new Date('2026-04-10T08:00:00Z'),
        now: FROZEN_NOW,
      });
      expect(r.from.toISOString()).toBe('2026-04-01T00:00:00.000Z');
      expect(r.to.toISOString()).toBe('2026-04-10T23:59:59.999Z');
    });
  });

  describe('compare=NONE', () => {
    it('returns previous as null', () => {
      const r = resolveAdminHomeRange({ period: '30D', compare: 'NONE', now: FROZEN_NOW });
      expect(r.previous).toBeNull();
    });
  });
});
