import { Test, TestingModule } from '@nestjs/testing';
import { MarketplaceTreasuryBucket, MarketplaceTreasuryLedgerKind } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MarketplaceTreasuryService } from '../marketplace-treasury/marketplace-treasury.service';
import { AdminAuditService } from '../admin/audit/admin-audit.service';
import { StripeWebhookLedgerService } from './stripe-webhook-ledger.service';

describe('StripeWebhookLedgerService', () => {
  let service: StripeWebhookLedgerService;
  let prisma: {
    checkoutPayment: { findFirst: jest.Mock; updateMany: jest.Mock };
    checkoutOrder: { findUnique: jest.Mock };
    connectAccountBalance: { findUnique: jest.Mock };
    connectMaturationRule: { findMany: jest.Mock };
  };
  let marketplaceTreasury: { append: jest.Mock; readBalance: jest.Mock };
  let adminAudit: { append: jest.Mock };

  beforeEach(async () => {
    prisma = {
      checkoutPayment: {
        findFirst: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      checkoutOrder: { findUnique: jest.fn() },
      connectAccountBalance: { findUnique: jest.fn().mockResolvedValue(null) },
      connectMaturationRule: { findMany: jest.fn().mockResolvedValue([]) },
    };
    marketplaceTreasury = {
      append: jest.fn().mockResolvedValue(undefined),
      readBalance: jest.fn().mockResolvedValue({ pendingInCents: '0' }),
    };
    adminAudit = { append: jest.fn().mockResolvedValue(undefined) };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StripeWebhookLedgerService,
        { provide: PrismaService, useValue: prisma },
        { provide: MarketplaceTreasuryService, useValue: marketplaceTreasury },
        { provide: AdminAuditService, useValue: adminAudit },
      ],
    }).compile();
    service = module.get(StripeWebhookLedgerService);
  });

  describe('persistConnectPostSaleSnapshot', () => {
    it('no-ops when snapshot is undefined', async () => {
      await service.persistConnectPostSaleSnapshot('pi_1', undefined);
      expect(prisma.checkoutPayment.updateMany).not.toHaveBeenCalled();
    });

    it('serializes bigint amounts to strings into webhookData', async () => {
      prisma.checkoutPayment.findFirst.mockResolvedValue({
        orderId: 'o-1',
        webhookData: { existing: true },
        order: { workspaceId: 'ws-1' },
      });
      await service.persistConnectPostSaleSnapshot('pi_1', {
        transferGroup: 'tg-1',
        sellerStripeAccountId: 'acct_seller',
        sellerDestinationAmountCents: 9999n,
        transfers: [
          {
            role: 'seller',
            accountId: 'acct_seller',
            amountCents: 9999n,
            stripeTransferId: 'tr_1',
          },
        ],
      });
      const [arg] = prisma.checkoutPayment.updateMany.mock.calls[0] as [
        {
          data: {
            webhookData: {
              existing: boolean;
              connectPostSale: {
                sellerDestinationAmountCents: string;
                transfers: Array<{ amountCents: string }>;
              };
            };
          };
        },
      ];
      expect(arg.data.webhookData.existing).toBe(true);
      expect(arg.data.webhookData.connectPostSale.sellerDestinationAmountCents).toBe('9999');
      expect(arg.data.webhookData.connectPostSale.transfers[0].amountCents).toBe('9999');
    });
  });

  describe('appendMarketplaceTreasurySaleCredit', () => {
    it('no-ops when no splitInput in webhookData', async () => {
      prisma.checkoutPayment.findFirst.mockResolvedValue({ webhookData: {} });
      await service.appendMarketplaceTreasurySaleCredit('pi_1');
      expect(marketplaceTreasury.append).not.toHaveBeenCalled();
    });

    it('credits PENDING bucket with marketplace fee + interest', async () => {
      prisma.checkoutPayment.findFirst.mockResolvedValue({
        webhookData: { splitInput: { marketplaceFeeCents: '500', interestCents: '100' } },
      });
      await service.appendMarketplaceTreasurySaleCredit('pi_1');
      expect(marketplaceTreasury.append).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'credit',
          bucket: MarketplaceTreasuryBucket.PENDING,
          amountInCents: 600n,
          kind: MarketplaceTreasuryLedgerKind.MARKETPLACE_FEE_CREDIT,
        }),
      );
    });

    it('skips append when totalCredit <= 0', async () => {
      prisma.checkoutPayment.findFirst.mockResolvedValue({
        webhookData: { splitInput: { marketplaceFeeCents: '0', interestCents: '0' } },
      });
      await service.appendMarketplaceTreasurySaleCredit('pi_1');
      expect(marketplaceTreasury.append).not.toHaveBeenCalled();
    });
  });

  describe('appendMarketplaceTreasuryReversal', () => {
    it('no-ops when marketplaceDebit <= 0', async () => {
      await service.appendMarketplaceTreasuryReversal({
        triggerKind: 'refund',
        triggerId: 're_1',
        paymentIntentId: 'pi_1',
        requestedAmountCents: 1000n,
        stakeholderReversedAmountCents: 900n,
        marketplaceDebitCents: 0n,
      });
      expect(marketplaceTreasury.append).not.toHaveBeenCalled();
    });

    it('debits all from AVAILABLE when pending bucket empty', async () => {
      marketplaceTreasury.readBalance.mockResolvedValue({ pendingInCents: '0' });
      await service.appendMarketplaceTreasuryReversal({
        triggerKind: 'refund',
        triggerId: 're_1',
        paymentIntentId: 'pi_1',
        requestedAmountCents: 1000n,
        stakeholderReversedAmountCents: 900n,
        marketplaceDebitCents: 100n,
      });
      const [append] = marketplaceTreasury.append.mock.calls[0] as [
        { direction: string; bucket: MarketplaceTreasuryBucket; amountInCents: bigint },
      ];
      expect(append.direction).toBe('debit');
      expect(append.bucket).toBe(MarketplaceTreasuryBucket.AVAILABLE);
      expect(append.amountInCents).toBe(100n);
    });

    it('splits debit across PENDING and AVAILABLE buckets', async () => {
      marketplaceTreasury.readBalance.mockResolvedValue({ pendingInCents: '60' });
      await service.appendMarketplaceTreasuryReversal({
        triggerKind: 'dispute',
        triggerId: 'dp_1',
        paymentIntentId: 'pi_1',
        requestedAmountCents: 1000n,
        stakeholderReversedAmountCents: 900n,
        marketplaceDebitCents: 100n,
      });
      expect(marketplaceTreasury.append).toHaveBeenCalledTimes(2);
      const buckets = (marketplaceTreasury.append.mock.calls as Array<
        [{ bucket: MarketplaceTreasuryBucket }]
      >).map(([call]) => call.bucket);
      expect(buckets).toContain(MarketplaceTreasuryBucket.PENDING);
      expect(buckets).toContain(MarketplaceTreasuryBucket.AVAILABLE);
    });
  });

  describe('appendMarketplaceTreasuryPayoutAudit', () => {
    it('records action + amount + status in admin audit', async () => {
      await service.appendMarketplaceTreasuryPayoutAudit({
        action: 'payout.paid',
        payoutId: 'po_1',
        requestId: 'req_1',
        amountCents: 1000n,
        currency: 'BRL',
        status: 'paid',
      });
      const [auditCall] = adminAudit.append.mock.calls[0] as [
        {
          action: string;
          entityType: string;
          entityId: string;
          details: { amountCents: string; status: string };
        },
      ];
      expect(auditCall.action).toBe('payout.paid');
      expect(auditCall.entityType).toBe('marketplace_treasury');
      expect(auditCall.entityId).toBe('BRL');
      expect(auditCall.details.amountCents).toBe('1000');
      expect(auditCall.details.status).toBe('paid');
    });
  });

  describe('appendConnectPayoutAudit', () => {
    it('enriches audit with workspaceId/accountType from accountBalance', async () => {
      prisma.connectAccountBalance.findUnique.mockResolvedValue({
        workspaceId: 'ws-1',
        accountType: 'SELLER',
        stripeAccountId: 'acct_seller',
      });
      await service.appendConnectPayoutAudit({
        action: 'payout.paid',
        accountBalanceId: 'bal-1',
        payoutId: 'po_1',
        requestId: 'req_1',
        amountCents: 1000n,
        status: 'paid',
      });
      const [auditCall] = adminAudit.append.mock.calls[0] as [
        {
          details: { workspaceId: string; accountType: string; stripeAccountId: string };
        },
      ];
      expect(auditCall.details.workspaceId).toBe('ws-1');
      expect(auditCall.details.accountType).toBe('SELLER');
      expect(auditCall.details.stripeAccountId).toBe('acct_seller');
    });
  });
});
