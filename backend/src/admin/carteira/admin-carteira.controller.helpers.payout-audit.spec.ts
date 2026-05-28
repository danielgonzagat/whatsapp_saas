import {
  mapPayoutAuditItem,
  type PayoutAuditItemLike,
} from './admin-carteira.controller.helpers';

describe('admin-carteira.controller.helpers — payout audit', () => {
  describe('mapPayoutAuditItem', () => {
    function item(overrides: Partial<PayoutAuditItemLike> = {}): PayoutAuditItemLike {
      return {
        id: 'aud_1',
        action: 'admin.carteira.payout_requested',
        createdAt: new Date('2026-04-19T22:10:00.000Z'),
        details: {
          requestId: 'req_1',
          payoutId: 'po_1',
          status: 'pending',
          amountCents: '5000',
          currency: 'BRL',
        },
        adminUser: { id: 'admin-1' },
        ...overrides,
      };
    }

    it('serialises every string detail field and includes adminUser', () => {
      expect(mapPayoutAuditItem(item())).toEqual({
        id: 'aud_1',
        action: 'admin.carteira.payout_requested',
        createdAt: '2026-04-19T22:10:00.000Z',
        requestId: 'req_1',
        payoutId: 'po_1',
        status: 'pending',
        amountCents: '5000',
        currency: 'BRL',
        error: null,
        adminUser: { id: 'admin-1' },
      });
    });

    it('falls back to null for non-string detail fields', () => {
      const result = mapPayoutAuditItem(
        item({
          details: { requestId: 'req_1', amountCents: 5000 /* number, not string */ },
        }),
      );
      expect(result.payoutId).toBeNull();
      expect(result.status).toBeNull();
      expect(result.amountCents).toBeNull();
      expect(result.currency).toBeNull();
      expect(result.error).toBeNull();
    });

    it('treats malformed details (array, null, primitive) as an empty object', () => {
      expect(mapPayoutAuditItem(item({ details: null })).requestId).toBeNull();
      expect(mapPayoutAuditItem(item({ details: [] })).requestId).toBeNull();
      expect(mapPayoutAuditItem(item({ details: 'oops' })).requestId).toBeNull();
    });

    it('returns adminUser null when the field is missing or non-object', () => {
      expect(mapPayoutAuditItem(item({ adminUser: undefined })).adminUser).toBeNull();
      expect(mapPayoutAuditItem(item({ adminUser: 'string' })).adminUser).toBeNull();
      expect(mapPayoutAuditItem(item({ adminUser: null })).adminUser).toBeNull();
    });
  });
});
