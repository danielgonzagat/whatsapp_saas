import { Logger } from '@nestjs/common';
import type { CheckoutOrderSupport } from './checkout-order-support';
import type { CheckoutPaymentService } from './checkout-payment.service';
import type { CheckoutPaymentE2EStubResult } from './checkout-payment-e2e-guard';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

import { processOrderPostPayment } from './checkout-order-payment.helpers';

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
  orderData: { paymentMethod: 'CREDIT_CARD' | 'PIX' | 'BOLETO' };
  qualityGate: { phoneDigits: string };
  normalizedBaseTotalInCents: number;
  normalizedInstallments: number;
  cardHolderName?: string;
}

export async function executeProcessOrderPostPayment(
  params: ProcessOrderPostPaymentParams,
  deps: {
    prisma: PrismaService;
    paymentService: CheckoutPaymentService;
    orderSupport: CheckoutOrderSupport;
    logger: Logger;
  },
): Promise<Record<string, unknown> | CheckoutPaymentE2EStubResult | null> {
  return processOrderPostPayment(params, deps);
}
