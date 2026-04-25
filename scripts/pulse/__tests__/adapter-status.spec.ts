import { describe, it, expect } from '@jest/globals';
import { isAdapterStatus, ADAPTER_STATUSES, type AdapterStatus } from '../types.adapter-status';

describe('adapter-status', () => {
  describe('isAdapterStatus', () => {
    it('should return true for valid adapter status values', () => {
      const validStatuses: AdapterStatus[] = [
        'ready',
        'not_available',
        'stale',
        'invalid',
        'optional_not_configured',
      ];

      validStatuses.forEach((status) => {
        expect(isAdapterStatus(status)).toBe(true);
      });
    });

    it('should return false for invalid string values', () => {
      const invalidValues = ['READY', 'unknown', '', 'pending', 'configured'];

      invalidValues.forEach((value) => {
        expect(isAdapterStatus(value)).toBe(false);
      });
    });

    it('should return false for non-string values', () => {
      const nonStringValues = [null, undefined, 123, {}, [], true];

      nonStringValues.forEach((value) => {
        expect(isAdapterStatus(value)).toBe(false);
      });
    });

    it('should work with unknown types', () => {
      const unknownValue: unknown = 'ready';
      if (isAdapterStatus(unknownValue)) {
        const status: AdapterStatus = unknownValue;
        expect(status).toBe('ready');
      }
    });
  });

  describe('ADAPTER_STATUSES constant', () => {
    it('should contain exactly 5 status values', () => {
      expect(ADAPTER_STATUSES).toHaveLength(5);
    });

    it('should be readonly', () => {
      expect(Object.isFrozen(ADAPTER_STATUSES)).toBe(true);
    });

    it('should contain all expected statuses', () => {
      expect(ADAPTER_STATUSES).toEqual(
        expect.arrayContaining([
          'ready',
          'not_available',
          'stale',
          'invalid',
          'optional_not_configured',
        ]),
      );
    });
  });
});
