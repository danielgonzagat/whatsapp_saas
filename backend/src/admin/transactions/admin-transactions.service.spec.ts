import { OrderStatus, PaymentStatus } from '@prisma/client';

import { AdminTransactionAction } from './dto/operate-transaction.dto';
import { AdminTransactionsService } from './admin-transactions.service';

describe('AdminTransactionsService — Stripe refunds', () => {
  it('refunds Stripe payments through Stripe refunds API', async () => {
    const prisma = {
      checkoutOrder: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          orderNumber: 'KLOEL-001',
          workspaceId: 'ws-1',
          status: OrderStatus.PAID,
          totalInCents: 13_990,
          refundedAt: null,
          metadata: null,
          payment: {
            id: 'payment-1',
            gateway: 'stripe',
            externalId: 'pi_stripe_123',
            status: PaymentStatus.APPROVED,
          },
        }),
      },
      $transaction: jest.fn(async (cb: any) =>
        cb({
          checkoutPayment: { update: jest.fn().mockResolvedValue({}) },
          checkoutOrder: { update: jest.fn().mockResolvedValue({}) },
          kloelSale: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
          kloelWallet: { findUnique: jest.fn().mockResolvedValue(null) },
          kloelWalletTransaction: { create: jest.fn() },
        }),
      ),
    };
    const stripe = {
      stripe: {
        refunds: {
          create: jest.fn().mockResolvedValue({ id: 're_1' }),
        },
      },
    };
    const service = new AdminTransactionsService(
      prisma as any,
      { append: jest.fn().mockResolvedValue(undefined) } as any,
      { appendWithinTx: jest.fn().mockResolvedValue(undefined) } as any,
      stripe as any,
    );

    await service.operate('order-1', 'admin-1', AdminTransactionAction.REFUND, 'refund stripe');

    expect(stripe.stripe.refunds.create).toHaveBeenCalledWith({
      payment_intent: 'pi_stripe_123',
    });
  });
});
