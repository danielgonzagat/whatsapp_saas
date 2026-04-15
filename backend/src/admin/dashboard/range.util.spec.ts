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

  describe('7D window is inclusive of today (7 distinct days)', () => {
    it('covers 2026-04-09T00 → 2026-04-15T23:59:59.999', () => {
      const r = resolve('7D');
      expect(r.from.toISOString()).toBe('2026-04-09T00:00:00.000Z');
      expect(r.to.toISOString()).toBe('2026-04-15T23:59:59.999Z');
    });

    it('previous-period is the 7 days immediately before that', () => {
      const r = resolve('7D', 'PREVIOUS');
      expect(r.previous?.from.toISOString().slice(0, 10)).toBe('2026-04-02');
      expect(r.previous?.to.toISOString().slice(0, 10)).toBe('2026-04-08');
    });
  });

  describe('30D and 90D windows', () => {
    it('30D runs 30 days back', () => {
      const r = resolve('30D');
      expect(r.from.toISOString().slice(0, 10)).toBe('2026-03-17');
      expect(r.to.toISOString().slice(0, 10)).toBe('2026-04-15');
    });
    it('90D runs 90 days back', () => {
      const r = resolve('90D');
      expect(r.from.toISOString().slice(0, 10)).toBe('2026-01-16');
    });
  });

  describe('12M', () => {
    it('runs 12 months back from `now`', () => {
      const r = resolve('12M');
      expect(r.from.toISOString().slice(0, 7)).toBe('2025-04');
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
