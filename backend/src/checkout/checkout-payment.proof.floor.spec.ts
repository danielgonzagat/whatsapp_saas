import { BadRequestException, NotFoundException } from '@nestjs/common';

import {
  type CheckoutPaymentCreateArgs,
  type CheckoutPaymentTxCallback,
  type CheckoutPaymentTxClient,
} from './checkout-payment.service.fixtures';
import {
  buildCheckoutPaymentServiceTestEnv,
  type CheckoutPaymentServiceTestEnv,
} from './checkout-payment.service.spec.harness';

/**
 * Coverage-floor raise for CheckoutPaymentService — the two uncovered error
 * branches of the seller Stripe-account autoprovisioning path. The
 * providers sub-spec already covers the happy autoprovision (no account →
 * create) and the existing-account short-circuit; this spec proves the
 * REGRA DE PAGAMENTOS guardrail that a misconfigured workspace surfaces a
 * real configuration error instead of silently creating a malformed Connect
 * account:
 *
 *   1. Workspace row missing  → NotFoundException (no Connect account created)
 *   2. Workspace has no agent → BadRequestException (no seller email to onboard)
 *
 * Both branches fire from the CREDIT_CARD arm, which calls
 * ensureSellerStripeAccountId() when no SELLER connectAccountBalance exists.
 */
describe('CheckoutPaymentService — seller Stripe account autoprovision guardrails', () => {
  let env: CheckoutPaymentServiceTestEnv;

  beforeEach(async () => {
    env = await buildCheckoutPaymentServiceTestEnv();
    // Force the autoprovision branch: no existing SELLER account on record.
    env.prisma.connectAccountBalance.findFirst.mockResolvedValue(null);
  });

  function wireTransaction(): void {
    const tx: CheckoutPaymentTxClient = {
      checkoutPayment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(async (args: CheckoutPaymentCreateArgs) => ({
          id: 'pay_card_guard',
          ...args.data,
        })),
      },
      checkoutOrder: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    env.prisma.$transaction.mockImplementation(async (cb: CheckoutPaymentTxCallback) => cb(tx));
  }

  it('throws NotFoundException when the workspace row is missing and never creates a Connect account', async () => {
    wireTransaction();
    env.prisma.workspace.findUnique.mockResolvedValueOnce(null);

    await expect(
      env.service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Cliente',
        customerEmail: 'cliente@example.com',
        paymentMethod: 'CREDIT_CARD',
        totalInCents: 10_000,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(env.connectService.createCustomAccount).not.toHaveBeenCalled();
    expect(env.stripeCharge.createSaleCharge).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when the workspace has no agent email to onboard the seller', async () => {
    wireTransaction();
    env.prisma.workspace.findUnique.mockResolvedValueOnce({
      id: 'ws-1',
      name: 'Workspace Sem Agente',
      agents: [],
    });

    await expect(
      env.service.processPayment({
        orderId: 'order-1',
        workspaceId: 'ws-1',
        customerName: 'Cliente',
        customerEmail: 'cliente@example.com',
        paymentMethod: 'CREDIT_CARD',
        totalInCents: 10_000,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(env.connectService.createCustomAccount).not.toHaveBeenCalled();
    expect(env.stripeCharge.createSaleCharge).not.toHaveBeenCalled();
  });
});
