import { BadRequestException } from '@nestjs/common';

import {
  makeChargeResult,
  type CheckoutPaymentCreateArgs,
  type CheckoutPaymentTxCallback,
  type CheckoutPaymentTxClient,
} from './checkout-payment.service.fixtures';
import {
  buildCheckoutPaymentServiceTestEnv,
  type CheckoutPaymentServiceTestEnv,
} from './checkout-payment.service.spec.harness';

/**
 * Fraud-engine + post-payment sub-spec for CheckoutPaymentService.processPayment.
 *
 * Carved out of `checkout-payment.service.spec.ts` (Gate-fix2-D, 2026-05-28) so
 * the FraudEngine decisions (block / review / require_3ds) and approved-flow
 * post-payment effects stay reviewable in isolation from the provider-routing
 * arms.
 */
describe('CheckoutPaymentService.processPayment — fraud + post-payment', () => {
  let env: CheckoutPaymentServiceTestEnv;

  beforeEach(async () => {
    env = await buildCheckoutPaymentServiceTestEnv();
  });

  it('runs post-payment effects when the payment is approved', async () => {
    env.stripeCharge.createSaleCharge.mockResolvedValueOnce(
      makeChargeResult({
        stripePaymentIntent: {
          id: 'pi_approved_1',
          status: 'succeeded',
          next_action: null,
        },
      }),
    );
    const tx: CheckoutPaymentTxClient = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async (args: CheckoutPaymentCreateArgs) => ({
          id: 'pay_approved_1',
          ...args.data,
        })),
      },
      checkoutOrder: {
        findFirst: jest.fn(async () => ({ status: 'PENDING' })),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    env.prisma.$transaction.mockImplementation(async (cb: CheckoutPaymentTxCallback) => cb(tx));

    const result = await env.service.processPayment({
      orderId: 'order-1',
      workspaceId: 'ws-1',
      customerName: 'Cliente Aprovado',
      customerEmail: 'approved@example.com',
      paymentMethod: 'CREDIT_CARD',
      totalInCents: 10_000,
    });

    expect(result.approved).toBe(true);
    expect(env.postPaymentEffects.markLeadConverted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1' }),
      'ws-1',
    );
    expect(env.postPaymentEffects.sendPurchaseSignals).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'order-1' }),
      139.9,
    );
  });

  it('blocks the checkout before hitting Stripe when the antifraud engine returns block', async () => {
    env.fraudEngine.evaluate.mockResolvedValueOnce({
      action: 'block',
      score: 1,
      reasons: [{ signal: 'blacklist', detail: 'CPF matched: auto_chargeback' }],
    });

    await expect(
      env.service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Cliente Bloqueado',
        customerEmail: 'blocked@example.com',
        customerCPF: '123.456.789-09',
        paymentMethod: 'CREDIT_CARD',
        totalInCents: 10_000,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(env.stripeCharge.createSaleCharge).not.toHaveBeenCalled();
    expect(env.auditService.log).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      action: 'CHECKOUT_PAYMENT_BLOCKED_BY_FRAUD',
      resource: 'CheckoutOrder',
      resourceId: 'order-1',
      details: {
        orderId: 'order-1',
        paymentMethod: 'CREDIT_CARD',
        chargedTotalInCents: 13_990,
        fraudDecision: {
          action: 'block',
          score: 1,
          reasonSignals: ['blacklist'],
          reasons: [{ signal: 'blacklist', detail: 'CPF matched: auto_chargeback' }],
        },
      },
    });
  });

  it('holds the checkout for manual review before hitting Stripe when the antifraud engine returns review', async () => {
    env.fraudEngine.evaluate.mockResolvedValueOnce({
      action: 'review',
      score: 0.6,
      reasons: [{ signal: 'velocity', detail: 'too many attempts from same device' }],
    });

    await expect(
      env.service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Cliente Em Revisão',
        customerEmail: 'review@example.com',
        customerCPF: '123.456.789-09',
        paymentMethod: 'CREDIT_CARD',
        totalInCents: 10_000,
      }),
    ).rejects.toThrow(BadRequestException);

    expect(env.stripeCharge.createSaleCharge).not.toHaveBeenCalled();
    expect(env.auditService.log).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      action: 'CHECKOUT_PAYMENT_REVIEW_REQUIRED',
      resource: 'CheckoutOrder',
      resourceId: 'order-1',
      details: {
        orderId: 'order-1',
        paymentMethod: 'CREDIT_CARD',
        chargedTotalInCents: 13_990,
        fraudDecision: {
          action: 'review',
          score: 0.6,
          reasonSignals: ['velocity'],
          reasons: [{ signal: 'velocity', detail: 'too many attempts from same device' }],
        },
      },
    });
  });

  it('forces 3DS on card payments when the antifraud engine returns require_3ds', async () => {
    const tx: CheckoutPaymentTxClient = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async (args: CheckoutPaymentCreateArgs) => ({
          id: 'pay_3ds_1',
          ...args.data,
        })),
      },
      checkoutOrder: {
        findFirst: jest.fn(),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    env.prisma.$transaction.mockImplementation(async (cb: CheckoutPaymentTxCallback) => cb(tx));
    env.fraudEngine.evaluate.mockResolvedValueOnce({
      action: 'require_3ds',
      score: 0.4,
      reasons: [{ signal: 'high_amount', detail: 'step-up required' }],
    });

    await env.service.processPayment({
      orderId: 'order-1',
      workspaceId: 'ws-1',
      customerName: 'Cliente 3DS',
      customerEmail: '3ds@example.com',
      customerCPF: '123.456.789-09',
      paymentMethod: 'CREDIT_CARD',
      totalInCents: 10_000,
    });

    expect(env.stripeCharge.createSaleCharge).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentMethodTypes: ['card'],
        paymentMethodOptions: {
          card: {
            request_three_d_secure: 'any',
          },
        },
      }),
    );
    expect(env.auditService.log).toHaveBeenCalledWith({
      workspaceId: 'ws-1',
      action: 'CHECKOUT_PAYMENT_3DS_REQUIRED',
      resource: 'CheckoutOrder',
      resourceId: 'order-1',
      details: {
        orderId: 'order-1',
        paymentMethod: 'CREDIT_CARD',
        chargedTotalInCents: 13_990,
        fraudDecision: {
          action: 'require_3ds',
          score: 0.4,
          reasonSignals: ['high_amount'],
          reasons: [{ signal: 'high_amount', detail: 'step-up required' }],
        },
      },
    });
  });
});
