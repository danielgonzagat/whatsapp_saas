import { PaymentWebhookController } from '../src/webhooks/payment-webhook.controller';
import { StripeWebhookLedgerService } from '../src/webhooks/stripe-webhook-ledger.service';

export type ConnectEventsWebhookPrismaMock = {
  workspace: {
    findUnique: jest.Mock;
  };
  connectAccountBalance: {
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
  kloelSale: {
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

type ConnectEventsTransactionInput =
  | ((tx: ConnectEventsWebhookPrismaMock) => Promise<unknown>)
  | Array<Promise<unknown>>;

export function buildConnectEventsWebhookController() {
  const stripeWebhookProcessor = {
    processSaleSucceeded: jest.fn(),
  };
  const connectReversalService = {
    processRefund: jest.fn().mockResolvedValue({
      paymentIntentId: 'pi_test_123',
      triggerId: 're_1',
      reversedTransfers: 2,
      ledgerDebits: 2,
      reversedAmountCents: 9_010n,
    }),
    processDispute: jest.fn().mockResolvedValue({
      paymentIntentId: 'pi_test_123',
      triggerId: 'dp_1',
      reversedTransfers: 3,
      ledgerDebits: 3,
      reversedAmountCents: 9_010n,
    }),
  };
  const connectPayoutService = {
    handleFailedPayout: jest.fn().mockResolvedValue(undefined),
  };
  const marketplaceTreasuryPayoutService = {
    handleFailedPayout: jest.fn().mockResolvedValue(undefined),
  };
  const adminAudit = {
    append: jest.fn().mockResolvedValue(undefined),
  };
  const financialAlert = {
    webhookProcessingFailed: jest.fn(),
  };
  const marketplaceTreasury = {
    readBalance: jest.fn().mockResolvedValue({
      currency: 'BRL',
      availableInCents: 0,
      pendingInCents: 100_000,
      reservedInCents: 0,
      updatedAt: new Date('2026-04-19T00:00:00Z').toISOString(),
    }),
    append: jest.fn().mockResolvedValue(undefined),
  };
  const autopilot = {
    markConversion: jest.fn().mockResolvedValue(undefined),
    triggerPostPurchaseFlow: jest.fn().mockResolvedValue(undefined),
  };
  const whatsapp = {
    sendMessage: jest.fn().mockResolvedValue(undefined),
  };
  const prisma: ConnectEventsWebhookPrismaMock = {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({ id: 'ws-1' }),
    },
    connectAccountBalance: {
      findUnique: jest.fn().mockResolvedValue({
        workspaceId: 'ws-1',
        accountType: 'SELLER',
        stripeAccountId: 'acct_seller_1',
      }),
    },
    checkoutPayment: {
      findFirst: jest.fn().mockResolvedValue({
        orderId: 'order-1',
        order: { workspaceId: 'ws-1' },
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
    kloelSale: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest
      .fn()
      .mockImplementation(async (operation: ConnectEventsTransactionInput) =>
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
    ledger as never,
  );

  return {
    controller,
    prisma,
    webhooksService,
    connectReversalService,
    connectPayoutService,
    marketplaceTreasury,
    marketplaceTreasuryPayoutService,
    adminAudit,
    financialAlert,
  };
}
