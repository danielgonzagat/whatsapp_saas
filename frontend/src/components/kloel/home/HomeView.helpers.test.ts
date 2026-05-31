import { describe, it, expect } from 'vitest';
import {
  DEFAULT_FIRST_NAME,
  DEFAULT_GREETING,
  formatBrDate,
  formatCustomDateRangeLabel,
  getFirstName,
  getGreeting,
  isCustomRangeReady,
  parseReferenceDate,
  resolveActiveRangeLabel,
  shouldFloatRangePopover,
} from './HomeView.helpers';

describe('HomeView.helpers', () => {
  describe('getGreeting', () => {
    it('returns default greeting when no date', () => {
      expect(getGreeting(null)).toBe(DEFAULT_GREETING);
      expect(getGreeting(undefined)).toBe(DEFAULT_GREETING);
    });

    it('returns "Bom dia" between 5 and 11:59', () => {
      const at5 = new Date();
      at5.setHours(5, 0, 0, 0);
      expect(getGreeting(at5)).toBe('Bom dia');

      const at11 = new Date();
      at11.setHours(11, 59, 0, 0);
      expect(getGreeting(at11)).toBe('Bom dia');
    });

    it('returns "Boa tarde" between 12 and 17:59', () => {
      const at12 = new Date();
      at12.setHours(12, 0, 0, 0);
      expect(getGreeting(at12)).toBe('Boa tarde');

      const at17 = new Date();
      at17.setHours(17, 59, 0, 0);
      expect(getGreeting(at17)).toBe('Boa tarde');
    });

    it('returns "Boa noite" at or after 18', () => {
      const at18 = new Date();
      at18.setHours(18, 0, 0, 0);
      expect(getGreeting(at18)).toBe('Boa noite');

      const at23 = new Date();
      at23.setHours(23, 59, 0, 0);
      expect(getGreeting(at23)).toBe('Boa noite');
    });

    it('returns "Boa madrugada" between 0 and 4:59', () => {
      const at0 = new Date();
      at0.setHours(0, 0, 0, 0);
      expect(getGreeting(at0)).toBe('Boa madrugada');

      const at4 = new Date();
      at4.setHours(4, 59, 0, 0);
      expect(getGreeting(at4)).toBe('Boa madrugada');
    });
  });

  describe('parseReferenceDate', () => {
    it('returns null for empty/undefined input', () => {
      expect(parseReferenceDate(null)).toBeNull();
      expect(parseReferenceDate(undefined)).toBeNull();
      expect(parseReferenceDate('')).toBeNull();
    });

    it('returns null for invalid date strings', () => {
      expect(parseReferenceDate('not-a-date')).toBeNull();
      expect(parseReferenceDate('xyz')).toBeNull();
    });

    it('parses valid ISO date strings', () => {
      const result = parseReferenceDate('2026-05-15T12:00:00.000Z');
      expect(result).toBeInstanceOf(Date);
      expect(result?.getTime()).toBe(new Date('2026-05-15T12:00:00.000Z').getTime());
    });

    it('parses YYYY-MM-DD without time', () => {
      const result = parseReferenceDate('2026-05-15');
      expect(result).toBeInstanceOf(Date);
      expect(Number.isNaN(result?.getTime() ?? NaN)).toBe(false);
    });
  });

  describe('getFirstName', () => {
    it('returns DEFAULT_FIRST_NAME for null/undefined/empty', () => {
      expect(getFirstName(null)).toBe(DEFAULT_FIRST_NAME);
      expect(getFirstName(undefined)).toBe(DEFAULT_FIRST_NAME);
      expect(getFirstName('')).toBe(DEFAULT_FIRST_NAME);
    });

    it('returns DEFAULT_FIRST_NAME for whitespace-only input', () => {
      expect(getFirstName('   ')).toBe(DEFAULT_FIRST_NAME);
      expect(getFirstName('\t\n')).toBe(DEFAULT_FIRST_NAME);
    });

    it('returns the first whitespace-delimited token', () => {
      expect(getFirstName('Maria Silva')).toBe('Maria');
      expect(getFirstName('João Pedro da Silva')).toBe('João');
    });

    it('trims surrounding whitespace before splitting', () => {
      expect(getFirstName('   Ana    Souza  ')).toBe('Ana');
    });

    it('handles single-word names', () => {
      expect(getFirstName('Daniel')).toBe('Daniel');
    });
  });

  describe('formatBrDate', () => {
    it('returns empty string for empty input', () => {
      expect(formatBrDate('')).toBe('');
    });

    it('converts YYYY-MM-DD to DD/MM/YYYY', () => {
      expect(formatBrDate('2026-05-15')).toBe('15/05/2026');
      expect(formatBrDate('2025-01-01')).toBe('01/01/2025');
    });

    it('reverses every hyphenated triple even without padding', () => {
      // Mirrors the legacy `split('-').reverse().join('/')` behaviour byte-for-byte.
      expect(formatBrDate('2026-1-5')).toBe('5/1/2026');
    });
  });

  describe('formatCustomDateRangeLabel', () => {
    it('returns null when either date is missing', () => {
      expect(formatCustomDateRangeLabel('', '2026-05-15')).toBeNull();
      expect(formatCustomDateRangeLabel('2026-05-01', '')).toBeNull();
      expect(formatCustomDateRangeLabel('', '')).toBeNull();
    });

    it('returns formatted "DD/MM/YYYY até DD/MM/YYYY" when both present', () => {
      expect(formatCustomDateRangeLabel('2026-05-01', '2026-05-15')).toBe(
        '01/05/2026 até 15/05/2026',
      );
    });
  });

  describe('resolveActiveRangeLabel', () => {
    it('returns custom-range label when period=custom and both dates present', () => {
      expect(
        resolveActiveRangeLabel({
          period: 'custom',
          customStartDate: '2026-05-01',
          customEndDate: '2026-05-15',
          serverLabel: 'server-label',
          fallbackLabel: 'fallback',
        }),
      ).toBe('01/05/2026 até 15/05/2026');
    });

    it('falls back to server label when period=custom but dates incomplete', () => {
      expect(
        resolveActiveRangeLabel({
          period: 'custom',
          customStartDate: '2026-05-01',
          customEndDate: '',
          serverLabel: 'Últimos 30 dias',
          fallbackLabel: 'fallback',
        }),
      ).toBe('Últimos 30 dias');
    });

    it('uses server label when period is not custom', () => {
      expect(
        resolveActiveRangeLabel({
          period: '30d',
          customStartDate: '',
          customEndDate: '',
          serverLabel: 'Últimos 30 dias',
          fallbackLabel: 'fallback',
        }),
      ).toBe('Últimos 30 dias');
    });

    it('uses fallback when no server label and no custom range', () => {
      expect(
        resolveActiveRangeLabel({
          period: 'today',
          customStartDate: '',
          customEndDate: '',
          serverLabel: null,
          fallbackLabel: 'Últimos 7 dias',
        }),
      ).toBe('Últimos 7 dias');
    });

    it('treats empty string server label as missing and uses fallback', () => {
      expect(
        resolveActiveRangeLabel({
          period: 'today',
          customStartDate: '',
          customEndDate: '',
          serverLabel: '',
          fallbackLabel: 'Últimos 7 dias',
        }),
      ).toBe('Últimos 7 dias');
    });
  });

  describe('shouldFloatRangePopover', () => {
    it('is true only when open is strictly true', () => {
      expect(shouldFloatRangePopover(true)).toBe(true);
      expect(shouldFloatRangePopover(false)).toBe(false);
    });
  });

  describe('isCustomRangeReady', () => {
    it('returns false when either side missing', () => {
      expect(isCustomRangeReady('', '2026-05-15')).toBe(false);
      expect(isCustomRangeReady('2026-05-01', '')).toBe(false);
      expect(isCustomRangeReady('', '')).toBe(false);
    });

    it('returns true when both sides present', () => {
      expect(isCustomRangeReady('2026-05-01', '2026-05-15')).toBe(true);
    });
  });
});
