import { randomUUID } from 'node:crypto';
import { BadRequestException, Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
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
} from './__companions__/checkout-order.service.companion';
import type { CheckoutOrderStatusValue } from './checkout-order-status';

const D_RE = /\D/g;
const DEFAULT_MARKETPLACE_FEE_PERCENT = 9.9;

/** Manages order lifecycle: create, query, status transitions, upsell accept/decline. */
@Injectable()
export class CheckoutOrderService {
  private readonly logger = new Logger(CheckoutOrderService.name);
  private readonly orderSupport: CheckoutOrderSupport;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => CheckoutPaymentService))
    private readonly paymentService: CheckoutPaymentService,
    private readonly auditService: AuditService,
    private readonly catalogService: CheckoutCatalogService,
    private readonly queryService: CheckoutOrderQueryService,
  ) {
    this.orderSupport = new CheckoutOrderSupport(prisma, this.logger);
  }

  private logOrderEvent(event: string, payload: Record<string, unknown>) {
    this.logger.log(JSON.stringify({ event, ...payload }));
  }

  /** Create order with server-side pricing reconciliation and payment processing. */
  // PULSE_OK: rate-limited by CheckoutPublicController
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
    this.logOrderEvent('checkout_order_create_start', {
      correlationId,
      planId: orderData.planId,
      workspaceId: orderData.workspaceId,
      paymentMethod: orderData.paymentMethod,
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
    const destinationZip =
      shippingAddress && typeof shippingAddress === 'object'
        ? typeof (shippingAddress as Record<string, unknown>).cep === 'string'
          ? ((shippingAddress as Record<string, unknown>).cep as string)
          : typeof (shippingAddress as Record<string, unknown>).zipCode === 'string'
            ? ((shippingAddress as Record<string, unknown>).zipCode as string)
            : ''
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
      orderData.paymentMethod === 'CREDIT_CARD'
        ? Math.max(1, Math.round(Number(orderData.installments || 1)))
        : 1;
    const qualityGate = {
      documentDigits: String(orderData.customerCPF || '').replace(D_RE, ''),
      phoneDigits: this.orderSupport.normalizePhoneDigits(orderData.customerPhone),
      payerAddress:
        orderData.shippingAddress && typeof orderData.shippingAddress === 'object'
          ? (orderData.shippingAddress as Record<string, unknown>)
          : null,
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
      orderData.paymentMethod as 'CREDIT_CARD' | 'PIX' | 'BOLETO',
      normalizedBaseTotalInCents,
      DEFAULT_MARKETPLACE_FEE_PERCENT,
    );
    const marketplacePricing = buildCheckoutMarketplacePricing({
      baseTotalInCents: normalizedBaseTotalInCents,
      paymentMethod: orderData.paymentMethod as 'CREDIT_CARD' | 'PIX' | 'BOLETO',
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
    if (orderData.paymentMethod === 'BOLETO') {
      throw new BadRequestException(
        'Boleto ainda não está habilitado no checkout Stripe-only. Use cartão ou Pix.',
      );
    }
    const orderNumber = generateCheckoutOrderNumber();
    const existingOrder = await this.prisma.checkoutOrder.findFirst({
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
    if (existingOrder) {
      this.logOrderEvent('checkout_order_idempotent_replay', {
        correlationId,
        orderId: existingOrder.id,
        orderNumber: existingOrder.orderNumber,
      });
      const paymentData = await this.processOrderPostPayment({
        order: existingOrder,
        orderNumber,
        correlationId,
        data,
        orderData,
        qualityGate,
        normalizedBaseTotalInCents,
        normalizedInstallments,
        cardHolderName,
      });
      return { ...existingOrder, paymentData };
    }
    const order = await this.prisma.checkoutOrder.create({
      data: {
        ...orderData,
        shippingPrice: normalizedShippingInCents,
        acceptedBumps: toPrismaJsonArray(serverTotals.acceptedBumpIds),
        subtotalInCents: normalizedSubtotalInCents,
        discountInCents: normalizedDiscountInCents,
        bumpTotalInCents: normalizedBumpTotalInCents,
        totalInCents: normalizedBaseTotalInCents,
        couponCode: orderData.couponCode ? orderData.couponCode.toUpperCase() : null,
        couponDiscount: normalizedDiscountInCents || null,
        installments: normalizedInstallments,
        affiliateId: affiliateLink?.affiliateWorkspaceId || affiliateId,
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
    this.logOrderEvent('checkout_order_created', {
      correlationId,
      orderId: order.id,
      orderNumber,
      planId: data.planId,
      workspaceId: data.workspaceId,
      totalInCents: normalizedBaseTotalInCents,
    });
    const paymentData = await this.processOrderPostPayment({
      order,
      orderNumber,
      correlationId,
      data,
      orderData,
      qualityGate,
      normalizedBaseTotalInCents,
      normalizedInstallments,
      cardHolderName,
    });
    return { ...order, paymentData };
  }

  private async processOrderPostPayment(
    params: ProcessOrderPostPaymentParams,
  ): Promise<Record<string, unknown> | null> {
    return executeProcessOrderPostPayment(params, {
      prisma: this.prisma,
      paymentService: this.paymentService,
      orderSupport: this.orderSupport,
      logger: this.logger,
    });
  }

  /** Get order. */
  // PULSE_OK: rate-limited by CheckoutPublicController
  async getOrder(orderId: string, workspaceId?: string) {
    return this.queryService.getOrder(orderId, workspaceId);
  }

  /** List orders. */
  // PULSE_OK: rate-limited by CheckoutPublicController
  async listOrders(
    workspaceId: string,
    filters?: { status?: string; page?: number; limit?: number },
  ) {
    return this.queryService.listOrders(workspaceId, filters);
  }

  /** Update order status. */
  // PULSE_OK: rate-limited by CheckoutPublicController
  async updateOrderStatus(
    orderId: string,
    workspaceId: string | undefined,
    status: CheckoutOrderStatusValue,
    extra?: Prisma.CheckoutOrderUpdateInput,
  ) {
    return this.queryService.updateOrderStatus(orderId, workspaceId, status, extra);
  }

  /** Get order status. */
  // PULSE_OK: rate-limited by CheckoutPublicController
  async getOrderStatus(orderId: string) {
    return this.queryService.getOrderStatus(orderId);
  }

  /** Accept upsell. */
  // PULSE_OK: rate-limited by CheckoutPublicController
  async acceptUpsell(orderId: string, upsellId: string) {
    return this.queryService.acceptUpsell(orderId, upsellId);
  }

  /** Get recent paid orders. */
  // PULSE_OK: rate-limited by CheckoutPublicController
  async getRecentPaidOrders(limit: number) {
    return this.queryService.getRecentPaidOrders(limit);
  }

  /** Decline upsell. */
  // PULSE_OK: rate-limited by CheckoutPublicController
  async declineUpsell(orderId: string, upsellId: string) {
    return this.queryService.declineUpsell(orderId, upsellId);
  }
}
