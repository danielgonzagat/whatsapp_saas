import { BadRequestException } from '@nestjs/common';
import { FraudBlacklistType } from '@prisma/client';

import {
  normalizeCurrency,
  parseFraudBlacklistType,
  parseSkip,
  parseTake,
  requireNonEmpty,
  resolveTreasuryPayoutRequestId,
  trimOptional,
  validatePayoutAmount,
} from './admin-carteira.controller.helpers';

describe('admin-carteira.controller.helpers — validation', () => {
  describe('parseSkip', () => {
    it('returns undefined when the input is missing', () => {
      expect(parseSkip(undefined)).toBeUndefined();
      expect(parseSkip('')).toBeUndefined();
    });

    it('returns undefined when the input cannot be parsed as a number', () => {
      expect(parseSkip('abc')).toBeUndefined();
    });

    it('returns a non-negative truncated integer for valid input', () => {
      expect(parseSkip('25')).toBe(25);
      expect(parseSkip('25.9')).toBe(25);
    });

    it('clamps negative numbers to zero', () => {
      expect(parseSkip('-12')).toBe(0);
    });
  });

  describe('parseTake', () => {
    it('returns undefined for missing or unparseable input', () => {
      expect(parseTake(undefined)).toBeUndefined();
      expect(parseTake('')).toBeUndefined();
      expect(parseTake('NaN-ish')).toBeUndefined();
    });

    it('clamps the take to [1, 200]', () => {
      expect(parseTake('0')).toBe(1);
      expect(parseTake('1')).toBe(1);
      expect(parseTake('50')).toBe(50);
      expect(parseTake('200')).toBe(200);
      expect(parseTake('5000')).toBe(200);
    });

    it('truncates fractional values', () => {
      expect(parseTake('25.9')).toBe(25);
    });
  });

  describe('normalizeCurrency', () => {
    it('upper-cases and trims a valid currency code', () => {
      expect(normalizeCurrency('  brl  ')).toBe('BRL');
      expect(normalizeCurrency('usd')).toBe('USD');
    });

    it('falls back to BRL when the input is missing or empty', () => {
      expect(normalizeCurrency(undefined)).toBe('BRL');
      expect(normalizeCurrency('')).toBe('BRL');
      expect(normalizeCurrency('   ')).toBe('BRL');
    });
  });

  describe('parseFraudBlacklistType', () => {
    it('returns the parsed enum value when the input matches a member', () => {
      expect(parseFraudBlacklistType('email')).toBe(FraudBlacklistType.EMAIL);
      expect(parseFraudBlacklistType(' EMAIL ')).toBe(FraudBlacklistType.EMAIL);
    });

    it('throws BadRequestException for an unknown value', () => {
      expect(() => parseFraudBlacklistType('not-a-real-type')).toThrow(BadRequestException);
    });

    it('throws BadRequestException for a non-string input', () => {
      expect(() => parseFraudBlacklistType(undefined)).toThrow(BadRequestException);
      expect(() => parseFraudBlacklistType(42)).toThrow(BadRequestException);
    });
  });

  describe('trimOptional', () => {
    it('returns a trimmed string when the value is non-empty', () => {
      expect(trimOptional('  hello  ')).toBe('hello');
    });

    it('returns undefined for empty/whitespace/null input', () => {
      expect(trimOptional('')).toBeUndefined();
      expect(trimOptional('   ')).toBeUndefined();
      expect(trimOptional(undefined)).toBeUndefined();
      expect(trimOptional(null)).toBeUndefined();
    });
  });

  describe('validatePayoutAmount', () => {
    it('returns both the integer and BigInt form for a valid input', () => {
      expect(validatePayoutAmount(2500)).toEqual({
        amountCents: 2500,
        amountCentsBig: 2500n,
      });
    });

    it('truncates fractional values before validation', () => {
      expect(validatePayoutAmount(125.9)).toEqual({
        amountCents: 125,
        amountCentsBig: 125n,
      });
    });

    it.each([0, -1, NaN, Infinity, undefined, null])(
      'rejects %p with BadRequestException',
      (raw) => {
        expect(() => validatePayoutAmount(raw as never)).toThrow(BadRequestException);
      },
    );
  });

  describe('resolveTreasuryPayoutRequestId', () => {
    it('uses the trimmed caller-provided request id when available', () => {
      const generator = jest.fn();
      expect(resolveTreasuryPayoutRequestId('  custom_req_1  ', generator)).toBe('custom_req_1');
      expect(generator).not.toHaveBeenCalled();
    });

    it('falls back to the generator when the input is missing or empty', () => {
      const generator = jest.fn().mockReturnValue('aaaa-bbbb');
      expect(resolveTreasuryPayoutRequestId(undefined, generator)).toBe(
        'marketplace_treasury_po_aaaa-bbbb',
      );
      expect(resolveTreasuryPayoutRequestId('   ', generator)).toBe(
        'marketplace_treasury_po_aaaa-bbbb',
      );
      expect(generator).toHaveBeenCalledTimes(2);
    });
  });

  describe('requireNonEmpty', () => {
    it('returns the trimmed value when non-empty', () => {
      expect(requireNonEmpty('  abc  ', 'missing')).toBe('abc');
    });

    it('throws BadRequestException with the supplied message when empty', () => {
      expect(() => requireNonEmpty('', 'value is required')).toThrow(BadRequestException);
      expect(() => requireNonEmpty('   ', 'value is required')).toThrow('value is required');
      expect(() => requireNonEmpty(undefined, 'value is required')).toThrow('value is required');
    });
  });
});
