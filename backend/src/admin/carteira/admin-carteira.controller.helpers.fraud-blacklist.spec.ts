import { FraudBlacklistType } from '@prisma/client';

import {
  buildFraudBlacklistAddedDetails,
  buildFraudBlacklistEntityId,
  buildFraudBlacklistRemovedDetails,
  mapFraudBlacklistRow,
  type FraudBlacklistRowLike,
} from './admin-carteira.controller.helpers';

describe('admin-carteira.controller.helpers — fraud-blacklist', () => {
  describe('mapFraudBlacklistRow', () => {
    function row(overrides: Partial<FraudBlacklistRowLike> = {}): FraudBlacklistRowLike {
      return {
        id: 'fb_1',
        type: FraudBlacklistType.EMAIL,
        value: 'fraud@example.com',
        reason: 'chargeback',
        addedBy: 'admin-1',
        expiresAt: null,
        createdAt: new Date('2026-04-19T20:15:00.000Z'),
        ...overrides,
      };
    }

    it('serialises createdAt and a null expiresAt verbatim', () => {
      expect(mapFraudBlacklistRow(row())).toEqual({
        id: 'fb_1',
        type: FraudBlacklistType.EMAIL,
        value: 'fraud@example.com',
        reason: 'chargeback',
        addedBy: 'admin-1',
        expiresAt: null,
        createdAt: '2026-04-19T20:15:00.000Z',
      });
    });

    it('serialises a Date expiresAt to ISO string', () => {
      const result = mapFraudBlacklistRow(row({ expiresAt: new Date('2027-01-01T00:00:00.000Z') }));
      expect(result.expiresAt).toBe('2027-01-01T00:00:00.000Z');
    });
  });

  describe('buildFraudBlacklistEntityId', () => {
    it('joins the type and value with a colon', () => {
      expect(buildFraudBlacklistEntityId(FraudBlacklistType.EMAIL, 'foo@example.com')).toBe(
        'EMAIL:foo@example.com',
      );
    });
  });

  describe('buildFraudBlacklistAddedDetails', () => {
    it('serialises the audit detail body from the row', () => {
      const row: FraudBlacklistRowLike = {
        id: 'fb_2',
        type: FraudBlacklistType.CPF,
        value: '12345678900',
        reason: 'test',
        addedBy: 'admin-1',
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
        createdAt: new Date('2026-04-19T20:15:00.000Z'),
      };
      expect(buildFraudBlacklistAddedDetails(row)).toEqual({
        fraudBlacklistId: 'fb_2',
        type: FraudBlacklistType.CPF,
        value: '12345678900',
        reason: 'test',
        expiresAt: '2027-01-01T00:00:00.000Z',
      });
    });

    it('emits null when the row has no expiry', () => {
      const row: FraudBlacklistRowLike = {
        id: 'fb_3',
        type: FraudBlacklistType.IP,
        value: '203.0.113.1',
        reason: 'manual',
        addedBy: null,
        expiresAt: null,
        createdAt: new Date('2026-04-19T20:15:00.000Z'),
      };
      expect(buildFraudBlacklistAddedDetails(row).expiresAt).toBeNull();
    });
  });

  describe('buildFraudBlacklistRemovedDetails', () => {
    it('echoes the supplied fields verbatim', () => {
      expect(
        buildFraudBlacklistRemovedDetails({
          type: FraudBlacklistType.EMAIL,
          value: 'fraud@example.com',
          removedCount: 1,
        }),
      ).toEqual({
        type: FraudBlacklistType.EMAIL,
        value: 'fraud@example.com',
        removedCount: 1,
      });
    });
  });
});
