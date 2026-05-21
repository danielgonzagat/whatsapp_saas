import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import { toPrismaJsonArray } from '../common/prisma/prisma-json.util';
import { PrismaService } from '../prisma/prisma.service';
import { generateCheckoutOrderNumber } from './checkout-code.util';
import { buildCheckoutMarketplacePricing } from './checkout-marketplace-pricing.util';
import {
  calculateCheckoutServerTotals,
  normalizeCheckoutOrderQuantity,
} from './checkout-order-pricing.util';
import { CheckoutOrderSupport } from './checkout-order-support';
import { CheckoutPaymentService } from './checkout-payment.service';
import { buildCheckoutShippingQuote } from './checkout-shipping-profile.util';
import { CheckoutCatalogService } from './checkout-catalog.service';
import { CheckoutOrderQueryService } from './checkout-order-query.service';
import { buildCheckoutOrderMetadata } from './checkout-order-metadata.util';
import {
  executeProcessOrderPostPayment,
  type ProcessOrderPostPaymentParams,
} from './checkout-order.post-payment';
import type { CheckoutOrderStatusValue } from './checkout-order-status';
import type { ShippingAddress } from './checkout-shipping.types';
import { CheckoutEventEmitterService } from '../kloel/checkout-emitter/checkout-event-emitter.service';

const D_RE = /\D/g;
const DEFAULT_MARKETPLACE_FEE_PERCENT = 9.9;

/** Manages order lifecycle: create, query, status transitions, upsell accept/decline. */
@Injectable()
export class CheckoutOrderService {
  private readonly logger = StructuredLogger.from(CheckoutOrderService.name);
  private readonly orderSupport: CheckoutOrderSupport;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CheckoutPaymentService))
    private readonly paymentService: CheckoutPaymentService,
    private readonly catalogService: CheckoutCatalogService,
    private readonly queryService: CheckoutOrderQueryService,
    @Optional()
    private readonly eventEmitter?: CheckoutEventEmitterService,
  ) {
    this.orderSupport = new CheckoutOrderSupport(prisma, this.logger);
  }

  private logOrderEvent(event: string, payload: Record<string, unknown>) {
    this.logger.log(JSON.stringify({ event, ...payload }));
  }

  /** Create order with server-side pricing reconciliation and payment processing. */
  async createOrder(data: {
    planId: string;
    workspaceId: string;
    correlationId?: string;
    checkoutCode?: string;
    capturedLeadId?: string;
    customerName: string;
    customerEmail: string;
    customerCPF?: string;
    customerPhone?: string;
    deviceFingerprint?: string;
    shippingAddress: Prisma.InputJsonValue;
    shippingMethod?: string;
    shippingPrice?: number;
    orderQuantity?: number;
    subtotalInCents: number;
    discountInCents?: number;
    bumpTotalInCents?: number;
    totalInCents: number;
    couponCode?: string;
    couponDiscount?: number;
    acceptedBumps?: Prisma.InputJsonValue;
    paymentMethod: Prisma.EnumPaymentMethodFilter['equals'];
    installments?: number;
    affiliateId?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmContent?: string;
    utmTerm?: string;
    ipAddress?: string;
    userAgent?: string;
    cardHolderName?: string;
  }) {
    const {
      correlationId: incomingCorrelationId,
      checkoutCode,
      capturedLeadId,
      deviceFingerprint,
      affiliateId,
      cardHolderName,
      orderQuantity,
      ...orderData
    } = data;
    const correlationId = incomingCorrelationId || randomUUID();
    const paymentMethod = orderData.paymentMethod ?? 'PIX';
    this.logOrderEvent('checkout_order_create_start', {
      correlationId,
      planId: orderData.planId,
      workspaceId: orderData.workspaceId,
      paymentMethod,
      checkoutCode: checkoutCode || null,
    });
    const planRecord = await this.orderSupport.resolvePlanForOrder(
      orderData.planId,
      orderData.workspaceId,
    );
    const affiliateLink = checkoutCode
      ? await this.orderSupport.resolveAffiliateLink(checkoutCode, planRecord.productId)
      : null;
    const normalizedOrderQuantity = normalizeCheckoutOrderQuantity(orderQuantity);
    const acceptedBumpIds = this.orderSupport.parseAcceptedBumpIds(orderData.acceptedBumps);
    const shippingAddress = orderData.shippingAddress;
    const address =
      shippingAddress && typeof shippingAddress === 'object'
        ? (shippingAddress as ShippingAddress)
        : null;
    const destinationZip =
      typeof address?.cep === 'string'
        ? address.cep
        : typeof address?.zipCode === 'string'
          ? address.zipCode
          : '';
    const shippingQuote = buildCheckoutShippingQuote({
      plan: planRecord,
      checkoutConfig: planRecord.checkoutConfig,
      destinationZip,
    });
    let normalizedDiscountInCents = 0;
    if (orderData.couponCode) {
      const couponResult = await this.catalogService.validateCoupon(
        orderData.workspaceId,
        orderData.couponCode,
        orderData.planId,
        Math.max(0, Math.round(Number(planRecord.priceInCents || 0))) * normalizedOrderQuantity,
      );
      if (!couponResult.valid) {
        throw new BadRequestException(couponResult.message || 'Cupom inválido ou expirado.');
      }
      normalizedDiscountInCents = Math.max(0, Math.round(Number(couponResult.discountAmount || 0)));
    }
    const serverTotals = calculateCheckoutServerTotals({
      planPriceInCents: planRecord.priceInCents,
      orderQuantity: normalizedOrderQuantity,
      shippingInCents: shippingQuote.priceInCents,
      discountInCents: normalizedDiscountInCents,
      orderBumps: planRecord.orderBumps,
      acceptedBumpIds,
    });
    const normalizedSubtotalInCents = serverTotals.subtotalInCents;
    const normalizedShippingInCents = serverTotals.shippingInCents;
    const normalizedBumpTotalInCents = serverTotals.bumpTotalInCents;
    const normalizedBaseTotalInCents = serverTotals.totalInCents;
    const normalizedInstallments =
      paymentMethod === 'CREDIT_CARD'
        ? Math.max(1, Math.round(Number(orderData.installments || 1)))
        : 1;
    const qualityGate = {
      documentDigits: String(orderData.customerCPF || '').replace(D_RE, ''),
      phoneDigits: this.orderSupport.normalizePhoneDigits(orderData.customerPhone),
      payerAddress: address,
    };
    const lineItems = this.orderSupport.buildCheckoutLineItems(
      planRecord,
      serverTotals.acceptedBumpIds,
      normalizedOrderQuantity,
    );
    const customerRegistrationDate = await this.orderSupport.resolveCustomerRegistrationDate({
      workspaceId: orderData.workspaceId,
      customerEmail: orderData.customerEmail,
      customerPhone: qualityGate.phoneDigits,
    });
    const marketplaceFeePercent = await this.orderSupport.resolveMarketplaceFeePercent(
      paymentMethod,
      normalizedBaseTotalInCents,
      DEFAULT_MARKETPLACE_FEE_PERCENT,
    );
    const marketplacePricing = buildCheckoutMarketplacePricing({
      baseTotalInCents: normalizedBaseTotalInCents,
      paymentMethod,
      installments: normalizedInstallments,
      marketplaceFeePercent,
      installmentInterestMonthlyPercent: 3.99,
      gatewayFeePercent: 0,
    });
    const affiliateCommissionPct = Number(affiliateLink?.affiliateProduct?.commissionPct || 0);
    const affiliateCommissionInCents = affiliateLink
      ? Math.round(normalizedBaseTotalInCents * (affiliateCommissionPct / 100))
      : 0;
    const producerNetInCents = Math.max(
      0,
      marketplacePricing.sellerReceivableInCents - affiliateCommissionInCents,
    );
    if (paymentMethod === 'BOLETO') {
      throw new BadRequestException(
        'Boleto ainda não está habilitado no checkout Stripe-only. Use cartão ou Pix.',
      );
    }
    const orderNumber = generateCheckoutOrderNumber();

    // $transaction to prevent duplicate orders from concurrent createOrder
    // calls with the same correlationId (metadata is a JSON field, no
    // unique constraint on the correlationId path)
    const orderResult = await this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.checkoutOrder.findFirst({
          where: {
            workspaceId: orderData.workspaceId,
            metadata: { path: ['correlationId'], equals: correlationId },
          },
          include: {
            plan: {
              include: {
                product: true,
                upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
              },
            },
            payment: true,
          },
        });
        if (existing) {
          return { replay: true, order: existing } as const;
        }

        const created = await tx.checkoutOrder.create({
          data: {
            planId: orderData.planId,
            workspaceId: orderData.workspaceId,
            customerName: orderData.customerName,
            customerEmail: orderData.customerEmail,
            paymentMethod: orderData.paymentMethod as 'CREDIT_CARD' | 'PIX' | 'BOLETO',
            shippingAddress: orderData.shippingAddress,
            ...(orderData.shippingMethod !== undefined
              ? { shippingMethod: orderData.shippingMethod }
              : {}),
            ...(orderData.customerCPF !== undefined ? { customerCPF: orderData.customerCPF } : {}),
            ...(orderData.customerPhone !== undefined
              ? { customerPhone: orderData.customerPhone }
              : {}),
            ...(orderData.utmSource !== undefined ? { utmSource: orderData.utmSource } : {}),
            ...(orderData.utmMedium !== undefined ? { utmMedium: orderData.utmMedium } : {}),
            ...(orderData.utmCampaign !== undefined ? { utmCampaign: orderData.utmCampaign } : {}),
            ...(orderData.utmContent !== undefined ? { utmContent: orderData.utmContent } : {}),
            ...(orderData.utmTerm !== undefined ? { utmTerm: orderData.utmTerm } : {}),
            ...(orderData.ipAddress !== undefined ? { ipAddress: orderData.ipAddress } : {}),
            ...(orderData.userAgent !== undefined ? { userAgent: orderData.userAgent } : {}),
            shippingPrice: normalizedShippingInCents,
            acceptedBumps: toPrismaJsonArray(serverTotals.acceptedBumpIds),
            subtotalInCents: normalizedSubtotalInCents,
            discountInCents: normalizedDiscountInCents,
            bumpTotalInCents: normalizedBumpTotalInCents,
            totalInCents: normalizedBaseTotalInCents,
            couponCode: orderData.couponCode ? orderData.couponCode.toUpperCase() : null,
            couponDiscount: normalizedDiscountInCents || null,
            installments: normalizedInstallments,
            affiliateId: (affiliateLink?.affiliateWorkspaceId || affiliateId) ?? null,
            metadata: buildCheckoutOrderMetadata({
              checkoutCode,
              capturedLeadId,
              correlationId,
              deviceFingerprint,
              qualityGate,
              customerRegistrationDate,
              normalizedOrderQuantity,
              planQuantity: planRecord.quantity,
              clientTotals: {
                subtotalInCents: orderData.subtotalInCents,
                discountInCents: orderData.discountInCents,
                bumpTotalInCents: orderData.bumpTotalInCents,
                totalInCents: orderData.totalInCents,
              },
              lineItems,
              affiliateLink: affiliateLink
                ? {
                    id: affiliateLink.id,
                    code: affiliateLink.code,
                    affiliateWorkspaceId: affiliateLink.affiliateWorkspaceId,
                    affiliateCommissionPct,
                    affiliateCommissionInCents,
                  }
                : null,
              marketplacePricing,
              producerNetInCents,
            }),
            orderNumber,
          },
          include: {
            plan: {
              include: {
                product: true,
                upsells: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
              },
            },
            payment: true,
          },
        });
        return { replay: false, order: created } as const;
      },
      { isolationLevel: 'ReadCommitted' },
    );

    if (orderResult.replay) {
      this.logOrderEvent('checkout_order_idempotent_replay', {
        correlationId,
        orderId: orderResult.order.id,
        orderNumber: orderResult.order.orderNumber,
      });
      const paymentData = await this.processOrderPostPayment({
        order: orderResult.order,
        orderNumber,
        correlationId,
        data: {
          workspaceId: data.workspaceId,
          planId: data.planId,
          customerName: data.customerName,
          customerEmail: data.customerEmail,
          ...(data.customerCPF !== undefined ? { customerCPF: data.customerCPF } : {}),
          ...(data.customerPhone !== undefined ? { customerPhone: data.customerPhone } : {}),
          ...(data.couponCode !== undefined ? { couponCode: data.couponCode } : {}),
          shippingAddress: data.shippingAddress,
        },
        orderData: {
          paymentMethod: orderData.paymentMethod as 'CREDIT_CARD' | 'PIX' | 'BOLETO',
        },
        qualityGate,
        normalizedBaseTotalInCents,
        normalizedInstallments,
        ...(cardHolderName !== undefined ? { cardHolderName } : {}),
      });
      void this.eventEmitter?.checkoutInitiated({
        workspaceId: data.workspaceId,
        orderId: orderResult.order.id,
        planId: data.planId,
        correlationId,
        paymentMethod: String(orderData.paymentMethod),
        totalInCents: normalizedBaseTotalInCents,
      });
      return { ...orderResult.order, paymentData };
    }

    const order = orderResult.order;
    this.logOrderEvent('checkout_order_created', {
      correlationId,
      orderId: order.id,
      orderNumber,
      planId: data.planId,
      workspaceId: data.workspaceId,
      totalInCents: normalizedBaseTotalInCents,
    });
    void this.eventEmitter?.cartCreated({
      workspaceId: data.workspaceId,
      orderId: order.id,
      planId: data.planId,
      correlationId,
      totalInCents: normalizedBaseTotalInCents,
    });
    const paymentData = await this.processOrderPostPayment({
      order,
      orderNumber,
      correlationId,
      data: {
        workspaceId: data.workspaceId,
        planId: data.planId,
        customerName: data.customerName,
        customerEmail: data.customerEmail,
        ...(data.customerCPF !== undefined ? { customerCPF: data.customerCPF } : {}),
        ...(data.customerPhone !== undefined ? { customerPhone: data.customerPhone } : {}),
        ...(data.couponCode !== undefined ? { couponCode: data.couponCode } : {}),
        shippingAddress: data.shippingAddress,
      },
      orderData: {
        paymentMethod: orderData.paymentMethod as 'CREDIT_CARD' | 'PIX' | 'BOLETO',
      },
      qualityGate,
      normalizedBaseTotalInCents,
      normalizedInstallments,
      ...(cardHolderName !== undefined ? { cardHolderName } : {}),
    });
    void this.eventEmitter?.checkoutInitiated({
      workspaceId: data.workspaceId,
      orderId: order.id,
      planId: data.planId,
      correlationId,
      paymentMethod: String(orderData.paymentMethod),
      totalInCents: normalizedBaseTotalInCents,
    });
    return { ...order, paymentData };
  }

  private async processOrderPostPayment(params: ProcessOrderPostPaymentParams): Promise<unknown> {
    return executeProcessOrderPostPayment(params, {
      prisma: this.prisma,
      paymentService: this.paymentService,
      orderSupport: this.orderSupport,
      logger: this.logger,
    });
  }

  /** Get order. */
  async getOrder(orderId: string, workspaceId?: string) {
    return this.queryService.getOrder(orderId, workspaceId);
  }

  /** List orders. */
  async listOrders(
    workspaceId: string,
    filters?: { status?: string; page?: number; limit?: number },
  ) {
    return this.queryService.listOrders(workspaceId, filters);
  }

  /** Update order status. */
  async updateOrderStatus(
    orderId: string,
    workspaceId: string | undefined,
    status: CheckoutOrderStatusValue,
    extra?: Prisma.CheckoutOrderUpdateInput,
  ) {
    return this.queryService.updateOrderStatus(orderId, workspaceId, status, extra);
  }

  /** Get order status. */
  async getOrderStatus(orderId: string) {
    return this.queryService.getOrderStatus(orderId);
  }

  /** Accept upsell. */
  async acceptUpsell(orderId: string, upsellId: string) {
    return this.queryService.acceptUpsell(orderId, upsellId);
  }

  /** Get recent paid orders. */
  async getRecentPaidOrders(limit: number) {
    return this.queryService.getRecentPaidOrders(limit);
  }

  /** Decline upsell. */
  async declineUpsell(orderId: string, upsellId: string) {
    return this.queryService.declineUpsell(orderId, upsellId);
  }
}
