import { BadRequestException } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';

import { AdminTransactionsService } from './admin-transactions.service';
import { AdminTransactionAction } from './dto/operate-transaction.dto';

function buildPaidStripeOrder() {
  return {
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
  };
}

describe('AdminTransactionsService — Stripe runtime', () => {
  it('requests a Stripe refund without mutating legacy balances locally', async () => {
    const prisma = {
      checkoutOrder: {
        findUnique: jest.fn().mockResolvedValue(buildPaidStripeOrder()),
      },
      $transaction: jest.fn(),
    };
    const audit = {
      append: jest.fn().mockResolvedValue(undefined),
    };
    const stripe = {
      stripe: {
        refunds: {
          create: jest.fn().mockResolvedValue({ id: 're_1' }),
        },
      },
    };

    const service = new AdminTransactionsService(
      prisma as never,
      audit as never,
      { appendWithinTx: jest.fn() } as never,
      stripe as never,
    );

    await service.operate('order-1', 'admin-1', AdminTransactionAction.REFUND, 'refund stripe');

    expect(stripe.stripe.refunds.create).toHaveBeenCalledWith({
      payment_intent: 'pi_stripe_123',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.append).toHaveBeenCalledWith({
      adminUserId: 'admin-1',
      action: 'admin.transactions.refund_requested',
      entityType: 'CheckoutOrder',
      entityId: 'order-1',
      details: {
        workspaceId: 'ws-1',
        orderNumber: 'KLOEL-001',
        paymentId: 'payment-1',
        paymentGateway: 'stripe',
        externalPaymentId: 'pi_stripe_123',
        note: 'refund stripe',
        mode: 'webhook_driven',
      },
    });
  });

  it('rejects manual Stripe chargebacks and requires provider webhook flow', async () => {
    const prisma = {
      checkoutOrder: {
        findUnique: jest.fn().mockResolvedValue(buildPaidStripeOrder()),
      },
    };

    const service = new AdminTransactionsService(
      prisma as never,
      { append: jest.fn() } as never,
      { appendWithinTx: jest.fn() } as never,
      { stripe: { refunds: { create: jest.fn() } } } as never,
    );

    await expect(
      service.operate('order-1', 'admin-1', AdminTransactionAction.CHARGEBACK, 'cb stripe'),
    ).rejects.toThrow(
      new BadRequestException(
        'Chargeback manual não é suportado no runtime Stripe-only. Aguarde o webhook do provedor.',
      ),
    );
  });
});
