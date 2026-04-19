import { BadRequestException, NotFoundException } from '@nestjs/common';

import { ConnectController } from './connect.controller';

describe('ConnectController', () => {
  function buildController() {
    const prisma = {
      connectAccountBalance: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cab_seller',
            workspaceId: 'ws-1',
            stripeAccountId: 'acct_seller',
            accountType: 'SELLER',
            createdAt: new Date('2026-01-01T00:00:00Z'),
          },
          {
            id: 'cab_affiliate',
            workspaceId: 'ws-1',
            stripeAccountId: 'acct_affiliate',
            accountType: 'AFFILIATE',
            createdAt: new Date('2026-01-02T00:00:00Z'),
          },
        ]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'cab_seller',
          workspaceId: 'ws-1',
          stripeAccountId: 'acct_seller',
          accountType: 'SELLER',
        }),
      },
    };
    const connectService = {
      getOnboardingStatus: jest.fn(async (stripeAccountId: string) => ({
        stripeAccountId,
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
        requirementsCurrentlyDue: [],
      })),
    };
    const ledgerService = {
      getBalance: jest.fn(async (accountBalanceId: string) => ({
        accountBalanceId,
        stripeAccountId: accountBalanceId === 'cab_affiliate' ? 'acct_affiliate' : 'acct_seller',
        accountType: accountBalanceId === 'cab_affiliate' ? 'AFFILIATE' : 'SELLER',
        pendingCents: 100n,
        availableCents: 200n,
        lifetimeReceivedCents: 900n,
        lifetimePaidOutCents: 300n,
        lifetimeChargebacksCents: 0n,
      })),
    };
    const connectPayoutService = {
      createPayout: jest.fn().mockResolvedValue({
        payoutId: 'po_123',
        status: 'pending',
        accountBalanceId: 'cab_seller',
        stripeAccountId: 'acct_seller',
        amountCents: 500n,
      }),
    };

    return {
      prisma,
      connectService,
      ledgerService,
      connectPayoutService,
      controller: new ConnectController(
        prisma as never,
        connectService as never,
        ledgerService as never,
        connectPayoutService as never,
      ),
    };
  }

  it('lists local connect balances with ledger snapshots and onboarding state', async () => {
    const { controller, prisma, ledgerService, connectService } = buildController();

    const result = await controller.listAccounts('ws-1');

    expect(prisma.connectAccountBalance.findMany).toHaveBeenCalledWith({
      where: { workspaceId: 'ws-1' },
      orderBy: [{ accountType: 'asc' }, { createdAt: 'asc' }],
    });
    expect(ledgerService.getBalance).toHaveBeenCalledTimes(2);
    expect(connectService.getOnboardingStatus).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      accounts: [
        expect.objectContaining({
          accountBalanceId: 'cab_seller',
          stripeAccountId: 'acct_seller',
          pendingCents: '100',
          availableCents: '200',
        }),
        expect.objectContaining({
          accountBalanceId: 'cab_affiliate',
          stripeAccountId: 'acct_affiliate',
          pendingCents: '100',
          availableCents: '200',
        }),
      ],
    });
  });

  it('creates a payout for a balance that belongs to the workspace', async () => {
    const { controller, prisma, connectPayoutService } = buildController();

    const result = await controller.createPayout('ws-1', {
      accountBalanceId: 'cab_seller',
      amountCents: 500,
      requestId: 'po_req_1',
      currency: 'brl',
    });

    expect(prisma.connectAccountBalance.findFirst).toHaveBeenCalledWith({
      where: { id: 'cab_seller', workspaceId: 'ws-1' },
    });
    expect(connectPayoutService.createPayout).toHaveBeenCalledWith({
      accountBalanceId: 'cab_seller',
      amountCents: 500n,
      requestId: 'po_req_1',
      currency: 'brl',
    });
    expect(result).toEqual({
      success: true,
      payoutId: 'po_123',
      status: 'pending',
      accountBalanceId: 'cab_seller',
      stripeAccountId: 'acct_seller',
      amountCents: '500',
    });
  });

  it('rejects invalid payout payloads before hitting services', async () => {
    const { controller, connectPayoutService } = buildController();

    await expect(
      controller.createPayout('ws-1', {
        accountBalanceId: '',
        amountCents: 500,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      controller.createPayout('ws-1', {
        accountBalanceId: 'cab_seller',
        amountCents: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(connectPayoutService.createPayout).not.toHaveBeenCalled();
  });

  it('rejects payouts for balances outside the workspace boundary', async () => {
    const { controller, prisma, connectPayoutService } = buildController();
    prisma.connectAccountBalance.findFirst.mockResolvedValueOnce(null);

    await expect(
      controller.createPayout('ws-1', {
        accountBalanceId: 'cab_other',
        amountCents: 500,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(connectPayoutService.createPayout).not.toHaveBeenCalled();
  });
});
