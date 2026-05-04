import * as Sentry from '@sentry/node';
import { Prisma } from '@prisma/client';
import { CheckoutOrderSupport } from './checkout-order-support';
import { CheckoutPaymentService } from './checkout-payment.service';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Parameters for processOrderPostPayment. */
export interface ProcessOrderPostPaymentParams {
  order: { id: string };
  orderNumber: string;
  correlationId: string;
  data: {
    workspaceId: string;
    planId: string;
    customerName: string;
    customerEmail: string;
    customerCPF?: string;
    customerPhone?: string;
    couponCode?: string;
    shippingAddress: Prisma.InputJsonValue;
  };
  orderData: { paymentMethod: Prisma.EnumPaymentMethodFilter['equals'] };
  qualityGate: { phoneDigits: string };
  normalizedBaseTotalInCents: number;
  normalizedInstallments: number;
  cardHolderName?: string;
}

/** Extracted post-order-creation payment flow to keep CheckoutOrderService ≤ 400 lines. */
export async function processOrderPostPayment(
  params: ProcessOrderPostPaymentParams,
  deps: {
    prisma: PrismaService;
    paymentService: CheckoutPaymentService;
    orderSupport: CheckoutOrderSupport;
    logger: Logger;
  },
): Promise<Record<string, unknown> | null> {
  const { order, orderNumber, correlationId, data, orderData, qualityGate } = params;
  const { prisma, paymentService, orderSupport, logger } = deps;

  const logOrderEvent = (event: string, payload: Record<string, unknown>) => {
    logger.log(JSON.stringify({ event, ...payload }));
  };

  let paymentData: Record<string, unknown> | null = null;
  try {
    paymentData = await paymentService.processPayment({
      orderId: order.id,
      idempotencyKey: order.id,
      workspaceId: data.workspaceId,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerCPF: data.customerCPF,
      customerPhone: data.customerPhone,
      paymentMethod: orderData.paymentMethod,
      totalInCents: params.normalizedBaseTotalInCents,
      installments: params.normalizedInstallments,
      cardHolderName: params.cardHolderName,
    });
    const contactSync = await orderSupport.ensureCheckoutContactRecord({
      workspaceId: data.workspaceId,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: qualityGate.phoneDigits,
      shippingAddress:
        data.shippingAddress && typeof data.shippingAddress === 'object'
          ? (data.shippingAddress as Record<string, unknown>)
          : undefined,
    });
    if (!contactSync.synced && !contactSync.skipped) {
      logOrderEvent('checkout_contact_sync_failed', {
        correlationId,
        orderId: order.id,
        orderNumber,
        planId: data.planId,
        workspaceId: data.workspaceId,
        reason: contactSync.reason,
        message: contactSync.errorMessage,
      });
    }
    if (data.couponCode && data.workspaceId) {
      await prisma.checkoutCoupon.updateMany({
        where: { workspaceId: data.workspaceId, code: data.couponCode.toUpperCase() },
        data: { usedCount: { increment: 1 } },
      });
    }
  } catch (e: unknown) {
    logOrderEvent('checkout_order_payment_failed', {
      correlationId,
      orderId: order.id,
      orderNumber,
      planId: data.planId,
      workspaceId: data.workspaceId,
      message: (e as Error).message,
    });
    Sentry.captureException(e, {
      tags: { type: 'financial_alert', operation: 'checkout_order_payment' },
      extra: {
        correlationId,
        orderId: order.id,
        orderNumber,
        planId: data.planId,
        workspaceId: data.workspaceId,
      },
      level: 'fatal',
    });
    throw e;
  }
  return paymentData;
}
