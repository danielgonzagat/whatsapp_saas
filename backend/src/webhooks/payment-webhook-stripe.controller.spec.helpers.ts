import { PaymentWebhookStripeController } from './payment-webhook-stripe.controller';
import { StripeWebhookLedgerService } from './stripe-webhook-ledger.service';

type MockRedis = {
  set: jest.Mock;
  lpush: jest.Mock;
  ltrim: jest.Mock;
};

function mockRedis(): MockRedis {
  return {
    set: jest.fn().mockResolvedValue('OK'),
    lpush: jest.fn().mockResolvedValue(1),
    ltrim: jest.fn().mockResolvedValue('OK'),
  };
}

type TransactionInput = ((tx: unknown) => Promise<unknown>) | Array<Promise<unknown>>;

function mockPrisma() {
  return {
    workspace: { findUnique: jest.fn().mockResolvedValue({ id: 'ws-1' }) },
    checkoutPayment: {
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    checkoutOrder: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    connectMaturationRule: { findMany: jest.fn().mockResolvedValue([]) },
    contact: { findFirst: jest.fn().mockResolvedValue(null) },
    payment: { findFirst: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    connectAccountBalance: { findUnique: jest.fn() },
    kloelSale: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn().mockImplementation((op: TransactionInput) =>
      Array.isArray(op)
        ? Promise.all(op)
        : op({
            checkoutOrder: {
              findFirst: jest
                .fn()
                .mockResolvedValue({ status: 'PROCESSING', totalInCents: 13_990, metadata: {} }),
              updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            },
            kloelSale: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
          }),
    ),
  };
}

export function buildController() {
  const stripeWebhookProcessor = {
    processSaleSucceeded: jest.fn().mockResolvedValue({
      paymentIntentId: 'pi_sale_1',
      transfersDispatched: 4,
      ledgerEntriesCreated: 5,
      skippedReason: undefined,
      connectPostSale: {
        transferGroup: 'sale:order-1',
        sellerStripeAccountId: 'acct_seller',
        sellerDestinationAmountCents: 656n,
        transfers: [],
      },
    }),
  };
  const autopilot = {
    markConversion: jest.fn().mockResolvedValue(undefined),
    triggerPostPurchaseFlow: jest.fn().mockResolvedValue(undefined),
  };
  const whatsapp = { sendMessage: jest.fn().mockResolvedValue(undefined) };
  const prisma = mockPrisma();
  const redis = mockRedis();
  const webhooksService = {
    logWebhookEvent: jest.fn().mockResolvedValue({ id: 'we_1' }),
    markWebhookProcessed: jest.fn().mockResolvedValue(undefined),
    markWebhookFailed: jest.fn().mockResolvedValue(undefined),
  };
  const connectReversalService = {
    processRefund: jest.fn(),
    processDispute: jest.fn(),
  };
  const connectPayoutService = { handleFailedPayout: jest.fn() };
  const marketplaceTreasury = {
    append: jest.fn().mockResolvedValue(undefined),
    readBalance: jest.fn().mockResolvedValue({ pendingInCents: 2_000, availableInCents: 5_000 }),
  };
  const marketplaceTreasuryPayoutService = { handleFailedPayout: jest.fn() };
  const adminAudit = { append: jest.fn().mockResolvedValue(undefined) };
  const financialAlert = { webhookProcessingFailed: jest.fn() };
  const ledger = new StripeWebhookLedgerService(
    prisma as never,
    marketplaceTreasury as never,
    adminAudit as never,
  );

  const controller = new PaymentWebhookStripeController(
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

export function makeReq(
  body: unknown,
  rawBody = '',
): { body: unknown; rawBody: string; url: string } {
  return { body, rawBody, url: '/webhook/payment/stripe' };
}
