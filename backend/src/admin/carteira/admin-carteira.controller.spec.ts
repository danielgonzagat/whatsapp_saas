import { BadRequestException } from '@nestjs/common';

import { AdminCarteiraController } from './admin-carteira.controller';

describe('AdminCarteiraController', () => {
  function buildController() {
    const wallet = {
      readBalance: jest.fn(),
      listLedger: jest.fn(),
    };
    const reconcile = {
      reconcile: jest.fn(),
    };
    const platformPayout = {
      createPayout: jest.fn().mockResolvedValue({
        payoutId: 'po_platform_123',
        status: 'pending',
        amountCents: 5_000n,
        currency: 'BRL',
      }),
    };
    const audit = {
      append: jest.fn().mockResolvedValue(undefined),
      list: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'audit-1',
            action: 'admin.carteira.payout_requested',
            createdAt: new Date('2026-04-19T20:00:00Z'),
            details: {
              requestId: 'platform_po_req_1',
              payoutId: 'po_platform_123',
              status: 'pending',
              amountCents: '5000',
            },
            adminUser: {
              id: 'admin-1',
              name: 'Admin',
              email: 'admin@kloel.com',
              role: 'OWNER',
            },
          },
          {
            id: 'audit-2',
            action: 'system.carteira.payout_paid',
            createdAt: new Date('2026-04-19T20:05:00Z'),
            details: {
              requestId: 'platform_po_req_1',
              payoutId: 'po_platform_123',
              status: 'paid',
              amountCents: '5000',
              currency: 'BRL',
            },
            adminUser: null,
          },
        ],
        total: 2,
      }),
    };

    return {
      wallet,
      reconcile,
      platformPayout,
      audit,
      controller: new AdminCarteiraController(
        wallet as never,
        reconcile as never,
        platformPayout as never,
        audit as never,
      ),
    };
  }

  it('requests a platform payout and appends an admin audit row', async () => {
    const { controller, platformPayout, audit } = buildController();

    const result = await controller.createPayout(
      {
        amountCents: 5_000,
        requestId: 'platform_po_req_1',
        currency: 'BRL',
      },
      {
        id: 'admin-1',
      } as never,
    );

    expect(platformPayout.createPayout).toHaveBeenCalledWith({
      amountCents: 5_000n,
      requestId: 'platform_po_req_1',
      currency: 'BRL',
    });
    expect(audit.append).toHaveBeenCalledWith({
      adminUserId: 'admin-1',
      action: 'admin.carteira.payout_requested',
      entityType: 'platform_wallet',
      entityId: 'BRL',
      details: {
        requestId: 'platform_po_req_1',
        payoutId: 'po_platform_123',
        status: 'pending',
        amountCents: '5000',
      },
    });
    expect(result).toEqual({
      success: true,
      payoutId: 'po_platform_123',
      status: 'pending',
      amountCents: '5000',
      currency: 'BRL',
    });
  });

  it('rejects invalid payout payloads before touching services', async () => {
    const { controller, platformPayout, audit } = buildController();

    await expect(
      controller.createPayout(
        {
          amountCents: 0,
          currency: 'BRL',
        },
        {
          id: 'admin-1',
        } as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(platformPayout.createPayout).not.toHaveBeenCalled();
    expect(audit.append).not.toHaveBeenCalled();
  });

  it('audits payout request failures before rethrowing the error', async () => {
    const { controller, platformPayout, audit } = buildController();
    platformPayout.createPayout.mockRejectedValueOnce(new Error('stripe timeout'));

    await expect(
      controller.createPayout(
        {
          amountCents: 5_000,
          requestId: 'platform_po_req_fail',
          currency: 'BRL',
        },
        {
          id: 'admin-1',
        } as never,
      ),
    ).rejects.toThrow('stripe timeout');

    expect(audit.append).toHaveBeenCalledWith({
      adminUserId: 'admin-1',
      action: 'admin.carteira.payout_request_failed',
      entityType: 'platform_wallet',
      entityId: 'BRL',
      details: {
        requestId: 'platform_po_req_fail',
        amountCents: '5000',
        currency: 'BRL',
        error: 'stripe timeout',
      },
    });
  });

  it('lists platform payout audit events for operator visibility', async () => {
    const { controller, audit } = buildController();

    const result = await controller.listPayouts('0', '20');

    expect(audit.list).toHaveBeenCalledWith({
      action: 'carteira.payout',
      entityType: 'platform_wallet',
      skip: 0,
      take: 20,
    });
    expect(result).toEqual({
      items: [
        {
          id: 'audit-1',
          action: 'admin.carteira.payout_requested',
          createdAt: '2026-04-19T20:00:00.000Z',
          requestId: 'platform_po_req_1',
          payoutId: 'po_platform_123',
          status: 'pending',
          amountCents: '5000',
          currency: null,
          error: null,
          adminUser: {
            id: 'admin-1',
            name: 'Admin',
            email: 'admin@kloel.com',
            role: 'OWNER',
          },
        },
        {
          id: 'audit-2',
          action: 'system.carteira.payout_paid',
          createdAt: '2026-04-19T20:05:00.000Z',
          requestId: 'platform_po_req_1',
          payoutId: 'po_platform_123',
          status: 'paid',
          amountCents: '5000',
          currency: 'BRL',
          error: null,
          adminUser: null,
        },
      ],
      total: 2,
    });
  });
});
