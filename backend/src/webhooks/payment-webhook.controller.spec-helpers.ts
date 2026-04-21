// Shared test factory for PaymentWebhookController specs.
// This module is imported by spec files; it runs inside the Jest environment.
import { PaymentWebhookController } from './payment-webhook.controller';

type PaymentWebhookPrismaMock = {
  workspace: {
    findUnique: jest.Mock;
  };
  checkoutPayment: {
    findFirst: jest.Mock;
    updateMany: jest.Mock;
  };
  checkoutOrder: {
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

export function buildController() {
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
            platformFeeCents: '990',
            interestCents: '3990',
          },
        },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    checkoutOrder: {
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
      }),
    },
    kloelSale: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest
      .fn()
      .mockImplementation(async (callback: (tx: PaymentWebhookPrismaMock) => Promise<unknown>) =>
        callback(prisma),
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
  const platformWallet = {
    append: jest.fn().mockResolvedValue(undefined),
  };
  const platformPayoutService = {
    handleFailedPayout: jest.fn(),
  };
  const adminAudit = {
    append: jest.fn().mockResolvedValue(undefined),
  };
  const financialAlert = {
    webhookProcessingFailed: jest.fn(),
  };

  const controller = new PaymentWebhookController(
    autopilot as never,
    whatsapp as never,
    prisma as never,
    redis as never,
    webhooksService as never,
    stripeWebhookProcessor as never,
    connectReversalService as never,
    connectPayoutService as never,
    platformWallet as never,
    platformPayoutService as never,
    adminAudit as never,
    financialAlert as never,
  );

  return {
    controller,
    prisma,
    redis,
    webhooksService,
    autopilot,
    whatsapp,
    stripeWebhookProcessor,
    platformWallet,
    adminAudit,
    financialAlert,
  };
}
