import { PaymentWebhookStripeController as PaymentWebhookController } from '../src/webhooks/payment-webhook-stripe.controller';
import { StripeWebhookLedgerService } from '../src/webhooks/stripe-webhook-ledger.service';

export type PaymentWebhookPrismaMock = {
  workspace: {
    findUnique: jest.Mock;
  };
  checkoutPayment: {
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  checkoutOrder: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    updateMany: jest.Mock;
  };
  connectMaturationRule: {
    findMany: jest.Mock;
  };
  contact: {
    findFirst: jest.Mock;
  };
  payment: {
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  connectAccountBalance: {
    findUnique: jest.Mock;
  };
  kloelSale: {
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

type PaymentWebhookTransactionInput =
  | ((tx: PaymentWebhookPrismaMock) => Promise<unknown>)
  | Array<Promise<unknown>>;

export function buildPaymentWebhookController() {
  const stripeWebhookProcessor = {
    processSaleSucceeded: jest.fn().mockResolvedValue({
      paymentIntentId: 'pi_sale_1',
      transfersDispatched: 4,
      ledgerEntriesCreated: 5,
      connectPostSale: {
        transferGroup: 'sale:order-1',
        sellerStripeAccountId: 'acct_seller',
        sellerDestinationAmountCents: 656n,
        transfers: [
          {
            role: 'supplier',
            accountId: 'acct_supplier',
            amountCents: 4_210n,
            stripeTransferId: 'tr_supplier_1',
          },
          {
            role: 'affiliate',
            accountId: 'acct_affiliate',
            amountCents: 3_604n,
            stripeTransferId: 'tr_affiliate_1',
          },
        ],
      },
    }),
  };
  const autopilot = {
    markConversion: jest.fn().mockResolvedValue(undefined),
    triggerPostPurchaseFlow: jest.fn().mockResolvedValue(undefined),
  };
  const whatsapp = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
  };
  const prisma: PaymentWebhookPrismaMock = {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({ id: 'ws-1' }),
    },
    checkoutPayment: {
      findFirst: jest.fn().mockResolvedValue({
        orderId: 'order-1',
        order: { workspaceId: 'ws-1' },
        webhookData: {
          splitInput: {
            marketplaceFeeCents: '990',
            interestCents: '3990',
          },
        },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    checkoutOrder: {
      findFirst: jest.fn().mockResolvedValue({ status: 'PAID' }),
      findUnique: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    connectMaturationRule: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    contact: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    payment: {
      findFirst: jest.fn().mockResolvedValue(null),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    connectAccountBalance: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'cab_seller_1',
        workspaceId: 'ws-1',
        accountType: 'SELLER',
        stripeAccountId: 'acct_seller_1',
      }),
    },
    kloelSale: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest
      .fn()
      .mockImplementation(async (operation: PaymentWebhookTransactionInput) =>
        Array.isArray(operation) ? Promise.all(operation) : operation(prisma),
      ),
  };
  const redis = {
    set: jest.fn().mockResolvedValue('OK'),
    lpush: jest.fn().mockResolvedValue(1),
    ltrim: jest.fn().mockResolvedValue('OK'),
  };
  const webhooksService = {
    logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we_1' }),
    markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
  };
  const connectReversalService = {
    processRefund: jest.fn(),
    processDispute: jest.fn(),
  };
  const connectPayoutService = {
    handleFailedPayout: jest.fn(),
  };
  const marketplaceTreasury = {
    append: jest.fn().mockResolvedValue(undefined),
    readBalance: jest.fn().mockResolvedValue({
      pendingInCents: 2_000,
      availableInCents: 5_000,
    }),
  };
  const marketplaceTreasuryPayoutService = {
    handleFailedPayout: jest.fn(),
  };
  const adminAudit = {
    append: jest.fn().mockResolvedValue(undefined),
  };
  const financialAlert = {
    webhookProcessingFailed: jest.fn(),
  };

  const ledger = new StripeWebhookLedgerService(
    prisma as never,
    marketplaceTreasury as never,
    adminAudit as never,
  );

  const controller = new PaymentWebhookController(
    autopilot as never,
    whatsapp as never,
    prisma as never,
    redis as never,
    webhooksService as never,
    stripeWebhookProcessor as never,
    connectReversalService as never,
    connectPayoutService as never,
    marketplaceTreasuryPayoutService as never,
    adminAudit as never,
    financialAlert as never,
    ledger,
  );

  return {
    controller,
    prisma,
    redis,
    webhooksService,
    autopilot,
    whatsapp,
    stripeWebhookProcessor,
    connectReversalService,
    connectPayoutService,
    marketplaceTreasury,
    marketplaceTreasuryPayoutService,
    adminAudit,
    financialAlert,
  };
}
