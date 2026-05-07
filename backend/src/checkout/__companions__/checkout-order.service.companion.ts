import type { CheckoutOrderSupport } from '../checkout-order-support';
import type { CheckoutPaymentService } from '../checkout-payment.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { Logger } from '@nestjs/common';
import { processOrderPostPayment } from '../checkout-order-payment.helpers';

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

export async function executeProcessOrderPostPayment(
  params: ProcessOrderPostPaymentParams,
  deps: {
    prisma: PrismaService;
    paymentService: CheckoutPaymentService;
    orderSupport: CheckoutOrderSupport;
    logger: Logger;
  },
): Promise<Record<string, unknown> | null> {
  return processOrderPostPayment(params, deps);
}
