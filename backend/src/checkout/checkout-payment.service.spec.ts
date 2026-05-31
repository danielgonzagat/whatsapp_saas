import { NotFoundException } from '@nestjs/common';

import {
  buildCheckoutPaymentServiceTestEnv,
  type CheckoutPaymentServiceTestEnv,
} from './checkout-payment.service.spec.harness';

/**
 * Orchestrator spec for CheckoutPaymentService.processPayment.
 *
 * Gate-fix2-D (2026-05-28) split the original 720-LOC spec into themed
 * sub-specs so each surface area stays reviewable in isolation:
 *
 *   - checkout-payment.service.providers.spec.ts  — PIX / boleto / card / router mismatch / Connect autoprovision
 *   - checkout-payment.service.fraud.spec.ts      — FraudEngine block/review/require_3ds + approved-flow post-payment effects
 *   - checkout-payment.service.e2e-guard.spec.ts  — EnvCheckoutPaymentE2EGuard environment toggle
 *
 * This file keeps the cross-cutting baseline expectations (order-not-found
 * propagates a NotFoundException; Stripe-arm exceptions surface to the caller
 * AND fire the FinancialAlertService) so the suite still has a load-bearing
 * top-level describe.
 */
describe('CheckoutPaymentService.processPayment — baseline', () => {
  let env: CheckoutPaymentServiceTestEnv;

  beforeEach(async () => {
    env = await buildCheckoutPaymentServiceTestEnv();
  });

  it('throws NotFoundException when the order does not exist', async () => {
    env.prisma.checkoutOrder.findFirst.mockResolvedValueOnce(null);

    await expect(
      env.service.processPayment({
        orderId: 'missing',
        workspaceId: 'ws-1',
        customerName: 'Teste',
        customerEmail: 'test@example.com',
        paymentMethod: 'PIX',
        totalInCents: 10_000,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rethrows Stripe card errors and notifies FinancialAlertService', async () => {
    const stripeError = new Error('stripe unavailable');
    env.stripeCharge.createSaleCharge.mockRejectedValueOnce(stripeError);

    await expect(
      env.service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Cliente',
        customerEmail: 'cliente@example.com',
        paymentMethod: 'CREDIT_CARD',
        totalInCents: 10_000,
      }),
    ).rejects.toThrow('stripe unavailable');

    expect(env.financialAlert.paymentFailed).toHaveBeenCalledWith(
      stripeError,
      expect.objectContaining({
        workspaceId: 'ws-1',
        orderId: 'order-1',
        gateway: 'stripe',
      }),
    );
  });
});
