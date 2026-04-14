import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import type { PaymentResponse as MercadoPagoPaymentResponse } from 'mercadopago/dist/clients/payment/commonTypes';
import { Public } from '../auth/public.decorator';
import { FinancialAlertService } from '../common/financial-alert.service';
import { validatePaymentTransition } from '../common/payment-state-machine';
import { MercadoPagoService } from '../kloel/mercado-pago.service';
import { PrismaService } from '../prisma/prisma.service';
import { calculatePhysicalOrderUnitCount } from './checkout-order-pricing.util';
import { FacebookCAPIService } from './facebook-capi.service';
import { verifyMercadoPagoWebhookSignature } from './mercado-pago-webhook-signature.util';

type PaymentConfirmationContext = {
  provider: 'asaas' | 'mercadopago';
  externalId: string;
  rawPayload: any;
  paymentMethod?: string | null;
  baseAmount?: number;
  chargedAmount?: number;
  producerNetAmount?: number;
  gatewayFeeAmount?: number;
  platformFeeAmount?: number;
  platformNetRevenueAmount?: number;
  installmentInterestAmount?: number;
  affiliateLinkId?: string | null;
  affiliateCommissionAmount?: number;
};

type MercadoPagoNotification = {
  topic: string;
  action: string;
  resourceId: string | null;
  signatureDataId: string | null;
};

function centsToAmount(value?: number | null) {
  return Number(((Number(value || 0) || 0) / 100).toFixed(2));
}

function sumMercadoPagoFees(payment: MercadoPagoPaymentResponse) {
  return (payment.fee_details || []).reduce((sum, fee) => {
    const type = String(fee.type || '').toLowerCase();
    if (type === 'application_fee' || type === 'marketplace_fee') {
      return sum;
    }
    return sum + Number(fee.amount || 0);
  }, 0);
}

function mapMercadoPagoPaymentStatus(status?: string | null) {
  switch (String(status || '').toLowerCase()) {
    case 'approved':
      return 'APPROVED';
    case 'pending':
      return 'PENDING';
    case 'authorized':
    case 'in_process':
      return 'PROCESSING';
    case 'rejected':
      return 'DECLINED';
    case 'cancelled':
    case 'cancelled_by_user':
      return 'CANCELED';
    case 'refunded':
      return 'REFUNDED';
    case 'charged_back':
      return 'CHARGEBACK';
    case 'in_mediation':
      return 'PROCESSING';
    default:
      return null;
  }
}

function firstQueryValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || undefined;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  if (Array.isArray(value) && value.length > 0) {
    return firstQueryValue(value[0]);
  }

  return undefined;
}

function resolveMercadoPagoNotification(body: any, req: any): MercadoPagoNotification {
  const queryDataId =
    firstQueryValue(req?.query?.['data.id']) || firstQueryValue(req?.query?.data?.id);
  const queryId = firstQueryValue(req?.query?.id);
  const topic = String(
    firstQueryValue(req?.query?.topic) ||
      firstQueryValue(req?.query?.type) ||
      body?.type ||
      body?.topic ||
      '',
  ).toLowerCase();
  const action = String(body?.action || '').toLowerCase();
  const resourceId =
    queryDataId ||
    queryId ||
    body?.data?.id ||
    body?.id ||
    (typeof body?.resource === 'string' ? body.resource.split('/').pop() : undefined) ||
    null;

  return {
    topic,
    action,
    resourceId: resourceId ? String(resourceId) : null,
    signatureDataId: queryDataId || body?.data?.id || body?.id || null,
  };
}

/**
 * Asaas checkout webhookEvent handler.
 * Idempotency: checks existingRecord status before processing (isDuplicate guard).
 * State machine: validatePaymentTransition rejects out-of-order events.
 */
@Controller('checkout/webhooks')
export class CheckoutWebhookController {
  private readonly logger = new Logger(CheckoutWebhookController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly facebookCAPI: FacebookCAPIService,
    private readonly financialAlert: FinancialAlertService,
    private readonly mercadoPago: MercadoPagoService,
  ) {}

  @Public()
  @Post('asaas')
  @HttpCode(200)
  @Throttle({ default: { limit: 200, ttl: 60000 } })
  async handleAsaasWebhook(
    @Headers('asaas-access-token') accessToken: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    // Signature verification — reject unauthorized webhooks
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    if (expected && (!accessToken || accessToken !== expected)) {
      this.logger.warn(`Checkout webhook rejected — invalid token`, {
        ip: req?.ip,
      });
      throw new ForbiddenException('Invalid webhook token');
    }

    const { event, payment } = body;
    this.logger.log(`Checkout Asaas webhook: ${event} for payment ${payment?.id}`);

    if (!payment?.id) return { received: true };

    const paymentInclude = {
      order: {
        include: {
          plan: {
            include: {
              product: true,
              checkoutConfig: { include: { pixels: true } },
            },
          },
        },
      },
    };

    // Try finding by externalId first, then by record ID, then by externalReference
    let checkoutPayment = await this.prisma.checkoutPayment.findFirst({
      where: { externalId: payment.id },
      include: paymentInclude,
    });

    if (!checkoutPayment && payment.externalReference) {
      checkoutPayment = await this.prisma.checkoutPayment.findFirst({
        where: {
          OR: [{ id: payment.externalReference }, { orderId: payment.externalReference }],
        },
        include: paymentInclude,
      });
    }

    if (!checkoutPayment) {
      this.logger.warn(
        `CheckoutPayment not found for externalId: ${payment.id}, ref: ${payment.externalReference}`,
      );
      return { received: true };
    }

    // ── IDEMPOTENCY CHECK ─────────────────────────────────────────────
    const idempotencyMap: Record<string, string> = {
      PAYMENT_CONFIRMED: 'APPROVED',
      PAYMENT_RECEIVED: 'APPROVED',
      PAYMENT_CREDIT_CARD_CONFIRMED: 'APPROVED',
      PAYMENT_REFUNDED: 'REFUNDED',
      PAYMENT_CHARGEBACK_REQUESTED: 'CHARGEBACK',
    };
    const expectedStatus = idempotencyMap[event];
    if (expectedStatus && checkoutPayment?.status === expectedStatus) {
      this.logger.log(
        `Webhook ${event} for payment ${payment.id} already processed (status: ${checkoutPayment.status}). Skipping.`,
      );
      return { received: true, duplicate: true };
    }

    const statusMap: Record<string, string> = {
      PAYMENT_CONFIRMED: 'APPROVED',
      PAYMENT_RECEIVED: 'APPROVED',
      PAYMENT_CREDIT_CARD_CONFIRMED: 'APPROVED',
      PAYMENT_OVERDUE: 'EXPIRED',
      PAYMENT_DELETED: 'CANCELED',
      PAYMENT_REFUNDED: 'REFUNDED',
      PAYMENT_CHARGEBACK_REQUESTED: 'CHARGEBACK',
    };

    const newStatus = statusMap[event];
    if (!newStatus) return { received: true };

    // ── STATE MACHINE VALIDATION ──────────────────────────────────────
    // Reject out-of-order webhooks using payment state machine
    const currentStatus = checkoutPayment.status || 'PENDING';
    if (
      !validatePaymentTransition(currentStatus, newStatus, {
        paymentId: checkoutPayment.id,
        provider: 'asaas',
        externalId: payment.id,
      })
    ) {
      this.logger.warn(
        `Checkout webhook rejected by state machine: ${currentStatus} -> ${newStatus} for payment ${payment.id}`,
      );
      return { received: true, rejected: true, reason: 'invalid_transition' };
    }

    const order = checkoutPayment.order;
    const product = order?.plan?.product;
    const workspaceId: string | undefined = order?.workspaceId;

    try {
      // ── PAYMENT CONFIRMED FLOW ──────────────────────────────────────
      if (newStatus === 'APPROVED') {
        await this.handlePaymentConfirmed(checkoutPayment, order, product, workspaceId, {
          provider: 'asaas',
          externalId: payment.id,
          rawPayload: payment,
          paymentMethod: payment.billingType || order?.paymentMethod || null,
        });
      }

      // ── REFUND / CHARGEBACK FLOW ────────────────────────────────────
      if (newStatus === 'REFUNDED' || newStatus === 'CHARGEBACK') {
        await this.handleRefundOrChargeback(checkoutPayment, order, workspaceId, newStatus, {
          provider: 'asaas',
          externalId: payment.id,
          rawPayload: payment,
        });
      }

      // ── CANCELED / EXPIRED ──────────────────────────────────────────
      if (newStatus === 'CANCELED' || newStatus === 'EXPIRED') {
        // Map payment status to valid OrderStatus (EXPIRED is not in OrderStatus enum)
        const orderStatus: Prisma.CheckoutOrderUpdateInput['status'] = 'CANCELED';
        await this.prisma.$transaction(
          // isolationLevel: ReadCommitted
          async (tx) => {
            await tx.checkoutPayment.update({
              where: { id: checkoutPayment.id },
              data: {
                status: newStatus === 'CANCELED' ? 'CANCELED' : 'EXPIRED',
              },
            });
            await tx.checkoutOrder.update({
              where: { id: checkoutPayment.orderId },
              data: { status: orderStatus, canceledAt: new Date() },
            });
          },
          { isolationLevel: 'ReadCommitted' },
        );
      }
    } catch (err: any) {
      // Webhook must never fail — always return 200
      this.logger.error(
        `Error processing checkout webhook event=${event} paymentId=${payment?.id}: ${err?.message}`,
        err?.stack,
      );
      this.financialAlert.webhookProcessingFailed(
        err instanceof Error ? err : new Error(String(err)),
        { provider: 'asaas', externalId: payment?.id, eventType: event },
      );
    }

    return { received: true, processed: true };
  }

  @Public()
  @Post('mercado-pago')
  @HttpCode(200)
  @Throttle({ default: { limit: 200, ttl: 60000 } })
  async handleMercadoPagoWebhook(@Body() body: any, @Req() req: any) {
    return this.processMercadoPagoNotification(body, req, { allowUnsignedLegacyIpn: false });
  }

  @Public()
  @Post('mercado-pago/ipn')
  @HttpCode(200)
  @Throttle({ default: { limit: 200, ttl: 60000 } })
  async handleMercadoPagoIpn(@Body() body: any, @Req() req: any) {
    return this.processMercadoPagoNotification(body, req, { allowUnsignedLegacyIpn: true });
  }

  private async processMercadoPagoNotification(
    body: any,
    req: any,
    options: { allowUnsignedLegacyIpn: boolean },
  ) {
    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() || '';
    const notification = resolveMercadoPagoNotification(body, req);
    const signatureHeader = req?.headers?.['x-signature'];
    const requestIdHeader = req?.headers?.['x-request-id'];

    if (webhookSecret && signatureHeader) {
      const signatureCheck = verifyMercadoPagoWebhookSignature({
        secret: webhookSecret,
        signature: signatureHeader,
        requestId: requestIdHeader,
        dataId: notification.signatureDataId || notification.resourceId || null,
      });

      if (!signatureCheck.valid) {
        this.logger.warn(
          `Mercado Pago webhook rejected: invalid signature (${signatureCheck.reason}) manifest="${signatureCheck.manifest}"`,
        );
        throw new ForbiddenException('Invalid Mercado Pago webhook signature');
      }
    } else if (webhookSecret && !options.allowUnsignedLegacyIpn) {
      this.logger.warn('Mercado Pago webhook rejected: missing signature header.');
      throw new ForbiddenException('Missing Mercado Pago webhook signature');
    } else if (webhookSecret && options.allowUnsignedLegacyIpn) {
      this.logger.warn(
        `Mercado Pago legacy IPN received without signature: topic=${notification.topic || 'unknown'} resource=${notification.resourceId || 'n/a'}`,
      );
    } else if (process.env.NODE_ENV === 'production') {
      this.logger.warn(
        'Mercado Pago webhook secret is not configured. Signature validation is being skipped.',
      );
    }

    this.logger.log(
      `Checkout Mercado Pago webhook: topic=${notification.topic || 'unknown'} action=${notification.action || 'unknown'} resource=${notification.resourceId || 'n/a'}`,
    );

    if (
      !notification.resourceId ||
      (notification.topic && !['payment', 'order'].includes(notification.topic))
    ) {
      return { received: true };
    }

    const paymentInclude = {
      order: {
        include: {
          plan: {
            include: {
              product: true,
              checkoutConfig: { include: { pixels: true } },
            },
          },
        },
      },
    };

    let checkoutPayment = await this.prisma.checkoutPayment.findFirst({
      where: { externalId: String(notification.resourceId) },
      include: paymentInclude,
    });
    let resourceId = String(notification.resourceId);

    let workspaceId = checkoutPayment?.order?.workspaceId;
    if (!workspaceId) {
      workspaceId = await this.mercadoPago.findWorkspaceIdByMercadoPagoUserId(body?.user_id);
    }

    if (!workspaceId) {
      this.logger.warn(
        `Mercado Pago webhook skipped: workspace not resolved for resource ${resourceId}`,
      );
      return { received: true, skipped: true };
    }
    let payment: MercadoPagoPaymentResponse;
    try {
      if (notification.topic === 'order') {
        const mercadoPagoOrder = await this.mercadoPago.getOrderById(workspaceId, resourceId);
        const primaryOrderPayment = this.mercadoPago.extractPrimaryOrderPayment(mercadoPagoOrder);
        const orderPaymentId =
          primaryOrderPayment.externalId || mercadoPagoOrder.transactions?.payments?.[0]?.id;

        if (!orderPaymentId) {
          this.logger.warn(
            `Mercado Pago order notification skipped: order ${resourceId} has no payment id`,
          );
          return { received: true, skipped: true, reason: 'order_without_payment' };
        }

        if (!checkoutPayment && mercadoPagoOrder.external_reference) {
          checkoutPayment = await this.prisma.checkoutPayment.findFirst({
            where: {
              OR: [
                { orderId: mercadoPagoOrder.external_reference },
                { id: mercadoPagoOrder.external_reference },
              ],
            },
            include: paymentInclude,
          });
        }

        resourceId = String(orderPaymentId);
      }

      payment = await this.mercadoPago.getPaymentById(workspaceId, resourceId);
    } catch (error: any) {
      this.logger.error(
        `Mercado Pago webhook fetch failed for ${resourceId}: ${error?.message || error}`,
      );
      this.financialAlert.webhookProcessingFailed(
        error instanceof Error ? error : new Error(String(error)),
        {
          provider: 'mercadopago',
          externalId: String(resourceId),
          eventType: notification.action || notification.topic,
        },
      );
      return { received: true, failed: true };
    }

    if (!checkoutPayment && payment.external_reference) {
      checkoutPayment = await this.prisma.checkoutPayment.findFirst({
        where: {
          OR: [{ orderId: payment.external_reference }, { id: payment.external_reference }],
        },
        include: paymentInclude,
      });
    }

    if (!checkoutPayment) {
      this.logger.warn(
        `Mercado Pago checkoutPayment not found for resource ${resourceId}, external_reference=${payment.external_reference}`,
      );
      return { received: true };
    }

    const mappedStatus = mapMercadoPagoPaymentStatus(payment.status);
    if (!mappedStatus) {
      return { received: true };
    }

    if (checkoutPayment.status === mappedStatus) {
      this.logger.log(
        `Mercado Pago webhook duplicate for payment ${resourceId} (status=${mappedStatus})`,
      );
      return { received: true, duplicate: true };
    }

    if (
      !validatePaymentTransition(checkoutPayment.status || 'PENDING', mappedStatus, {
        paymentId: checkoutPayment.id,
        provider: 'mercadopago',
        externalId: String(resourceId),
      })
    ) {
      return { received: true, rejected: true, reason: 'invalid_transition' };
    }

    const order = checkoutPayment.order;
    const product = order?.plan?.product;
    const orderMetadata =
      order?.metadata && typeof order.metadata === 'object' && !Array.isArray(order.metadata)
        ? (order.metadata as Record<string, any>)
        : {};
    const baseAmount = centsToAmount(orderMetadata.baseTotalInCents || order?.totalInCents || 0);
    const chargedAmount = Number(
      payment.transaction_amount ||
        centsToAmount(orderMetadata.chargedTotalInCents || order?.totalInCents || 0),
    );
    const gatewayFeeAmount = sumMercadoPagoFees(payment);
    const platformFeeAmount = centsToAmount(orderMetadata.platformFeeInCents || 0);
    const installmentInterestAmount = centsToAmount(orderMetadata.installmentInterestInCents || 0);
    const affiliateCommissionAmount = centsToAmount(orderMetadata.affiliateCommissionInCents || 0);
    const platformNetRevenueAmount = Math.max(
      0,
      platformFeeAmount + installmentInterestAmount - gatewayFeeAmount,
    );
    const producerNetAmount =
      orderMetadata.producerNetInCents != null
        ? centsToAmount(orderMetadata.producerNetInCents)
        : Math.max(0, baseAmount - platformFeeAmount - affiliateCommissionAmount);

    try {
      if (mappedStatus === 'APPROVED') {
        await this.handlePaymentConfirmed(checkoutPayment, order, product, workspaceId, {
          provider: 'mercadopago',
          externalId: String(payment.id || resourceId),
          rawPayload: payment,
          paymentMethod:
            payment.payment_type_id || payment.payment_method_id || order?.paymentMethod,
          baseAmount,
          chargedAmount,
          producerNetAmount,
          gatewayFeeAmount,
          platformFeeAmount,
          platformNetRevenueAmount,
          installmentInterestAmount,
          affiliateLinkId: orderMetadata.affiliateLinkId || null,
          affiliateCommissionAmount,
        });
      } else if (mappedStatus === 'REFUNDED' || mappedStatus === 'CHARGEBACK') {
        await this.handleRefundOrChargeback(checkoutPayment, order, workspaceId, mappedStatus, {
          provider: 'mercadopago',
          externalId: String(payment.id || resourceId),
          rawPayload: payment,
          baseAmount,
          chargedAmount,
          producerNetAmount,
        });
      } else {
        const nextOrderStatus: Prisma.CheckoutOrderUpdateInput['status'] =
          mappedStatus === 'PROCESSING'
            ? 'PROCESSING'
            : mappedStatus === 'DECLINED' || mappedStatus === 'CANCELED'
              ? 'CANCELED'
              : 'PENDING';

        await this.prisma.$transaction(
          async (tx) => {
            await tx.checkoutPayment.update({
              where: { id: checkoutPayment.id },
              data: {
                status: mappedStatus,
                webhookData: JSON.parse(JSON.stringify(payment)),
              },
            });
            await tx.checkoutOrder.update({
              where: { id: checkoutPayment.orderId },
              data:
                nextOrderStatus === 'CANCELED'
                  ? { status: nextOrderStatus, canceledAt: new Date() }
                  : { status: nextOrderStatus },
            });
          },
          { isolationLevel: 'ReadCommitted' },
        );
      }
    } catch (err: any) {
      this.logger.error(
        `Error processing Mercado Pago webhook paymentId=${resourceId}: ${err?.message}`,
        err?.stack,
      );
      this.financialAlert.webhookProcessingFailed(
        err instanceof Error ? err : new Error(String(err)),
        {
          provider: 'mercadopago',
          externalId: String(resourceId),
          eventType: notification.action || notification.topic,
        },
      );
    }

    return { received: true, processed: true };
  }

  // ── PAYMENT CONFIRMED ─────────────────────────────────────────────
  private async handlePaymentConfirmed(
    checkoutPayment: any,
    order: any,
    product: any,
    workspaceId: string | undefined,
    context: PaymentConfirmationContext,
  ) {
    const now = new Date();
    const amountInCents: number = order?.totalInCents ?? 0;
    const baseAmount = Number(context.baseAmount ?? amountInCents / 100);
    const chargedAmount = Number(context.chargedAmount ?? baseAmount);
    const producerNetAmount = Number(context.producerNetAmount ?? baseAmount);
    const affiliateCommissionAmount = Number(context.affiliateCommissionAmount || 0);
    const productName: string = product?.name || order?.plan?.name || 'Checkout';

    await this.prisma.$transaction(async (tx: any) => {
      // isolationLevel: ReadCommitted
      // 1. Update CheckoutPayment status → APPROVED (=PAID)
      await tx.checkoutPayment.update({
        where: { id: checkoutPayment.id },
        data: { status: 'APPROVED', webhookData: context.rawPayload },
      });

      // 2. Update CheckoutOrder status → PAID, set paidAt
      await tx.checkoutOrder.update({
        where: { id: checkoutPayment.orderId },
        data: { status: 'PAID', paidAt: now },
      });

      // 3. Create or update KloelSale
      try {
        const existingSale = await tx.kloelSale.findFirst({
          where: { externalPaymentId: context.externalId },
        });
        if (existingSale) {
          await tx.kloelSale.update({
            where: { id: existingSale.id },
            data: { status: 'paid', paidAt: now, amount: baseAmount },
          });
        } else if (workspaceId) {
          await tx.kloelSale.create({
            data: {
              workspaceId,
              externalPaymentId: context.externalId,
              productName,
              amount: baseAmount,
              status: 'paid',
              paidAt: now,
              paymentMethod: context.paymentMethod || order?.paymentMethod || null,
              metadata: {
                checkoutOrderId: order?.id,
                checkoutPaymentId: checkoutPayment.id,
                orderNumber: order?.orderNumber,
                provider: context.provider,
                baseAmount,
                chargedAmount,
                producerNetAmount,
                gatewayFeeAmount: context.gatewayFeeAmount || 0,
                platformFeeAmount: context.platformFeeAmount || 0,
                platformNetRevenueAmount: context.platformNetRevenueAmount || 0,
                installmentInterestAmount: context.installmentInterestAmount || 0,
                affiliateCommissionAmount,
              },
            },
          });
        }
      } catch (saleErr: any) {
        // PULSE:OK — KloelSale sync is non-critical; webhook processing continues
        this.logger.warn(`KloelSale upsert failed: ${saleErr?.message}`);
      }

      // 4 & 5. Update KloelWallet (increment pendingBalance) + create KloelWalletTransaction
      if (workspaceId) {
        try {
          // Get or create wallet
          let wallet = await tx.kloelWallet.findUnique({
            where: { workspaceId },
          });
          if (!wallet) {
            wallet = await tx.kloelWallet.create({
              data: {
                workspaceId,
                availableBalance: 0,
                pendingBalance: 0,
                blockedBalance: 0,
              },
            });
          }

          // Increment pendingBalance (not availableBalance — funds settle later)
          await tx.kloelWallet.update({
            where: { id: wallet.id },
            data: { pendingBalance: { increment: producerNetAmount } },
          });

          // Create wallet transaction of type 'sale'
          await tx.kloelWalletTransaction.create({
            data: {
              walletId: wallet.id,
              type: 'sale',
              amount: producerNetAmount,
              description: `Venda checkout: ${productName} (#${order?.orderNumber || 'N/A'})`,
              reference: checkoutPayment.orderId,
              status: 'pending',
              metadata: {
                checkoutOrderId: order?.id,
                externalPaymentId: context.externalId,
                baseAmount,
                chargedAmount,
                netAmount: producerNetAmount,
                gatewayFeeAmount: context.gatewayFeeAmount || 0,
                platformFeeAmount: context.platformFeeAmount || 0,
                platformNetRevenueAmount: context.platformNetRevenueAmount || 0,
                installmentInterestAmount: context.installmentInterestAmount || 0,
                affiliateCommissionAmount,
                provider: context.provider,
                orderNumber: order?.orderNumber,
              },
            },
          });
        } catch (walletErr: any) {
          // PULSE:OK — Wallet update non-critical in webhook; funds reconciled via Asaas later
          this.logger.warn(`Wallet update failed: ${walletErr?.message}`);
        }
      }

      // 6. If the product is physical, create PhysicalOrder with status PROCESSING
      if (workspaceId && product?.format === 'PHYSICAL') {
        try {
          const shippingAddress = order?.shippingAddress || {};
          const orderMetadata =
            order?.metadata && typeof order.metadata === 'object' && !Array.isArray(order.metadata)
              ? (order.metadata as Record<string, any>)
              : {};
          await tx.physicalOrder.create({
            data: {
              workspaceId,
              customerName: order?.customerName || '',
              customerEmail: order?.customerEmail || null,
              customerPhone: order?.customerPhone || null,
              productId: product.id,
              productName: product.name,
              quantity: calculatePhysicalOrderUnitCount(
                orderMetadata.productUnitsPerPlan || order?.plan?.quantity || 1,
                orderMetadata.orderQuantity || 1,
              ),
              amount: baseAmount,
              status: 'PROCESSING',
              shippingMethod: order?.shippingMethod || null,
              shippingCost: order?.shippingPrice ? order.shippingPrice / 100 : null,
              addressStreet: shippingAddress.street || shippingAddress.address || null,
              addressCity: shippingAddress.city || null,
              addressState: shippingAddress.state || null,
              addressZip:
                shippingAddress.zip || shippingAddress.zipCode || shippingAddress.cep || null,
              addressCountry: shippingAddress.country || 'BR',
              paymentMethod: context.paymentMethod || order?.paymentMethod || null,
              paymentStatus: 'PAID',
              saleId: context.externalId,
              metadata: {
                checkoutOrderId: order?.id,
                orderNumber: order?.orderNumber,
                provider: context.provider,
              },
            },
          });
        } catch (physicalErr: any) {
          this.logger.warn(`PhysicalOrder creation failed: ${physicalErr?.message}`);
        }
      }

      if (context.affiliateLinkId && affiliateCommissionAmount > 0) {
        try {
          await tx.affiliateLink.update({
            where: { id: context.affiliateLinkId },
            data: {
              sales: { increment: 1 },
              revenue: { increment: baseAmount },
              commissionEarned: { increment: affiliateCommissionAmount },
            },
          });
        } catch (affiliateErr: any) {
          this.logger.warn(`Affiliate metrics update failed: ${affiliateErr?.message}`);
        }
      }
    });

    // Send Facebook Conversions API (CAPI) Purchase event — outside transaction (non-critical)
    try {
      const pixels = order?.plan?.checkoutConfig?.pixels;
      if (pixels) {
        const fbPixels = pixels.filter(
          (p: any) => p.type === 'FACEBOOK' && p.isActive && p.trackPurchase && p.accessToken,
        );

        for (const pixel of fbPixels) {
          this.facebookCAPI.sendEvent({
            pixelId: pixel.pixelId,
            accessToken: pixel.accessToken!,
            eventName: 'Purchase',
            email: order.customerEmail,
            phone: order.customerPhone ?? undefined,
            amount: order.totalInCents,
            currency: 'BRL',
            productId: order.plan.productId,
            ip: order.ipAddress ?? undefined,
            userAgent: order.userAgent ?? undefined,
          });
        }
      }
    } catch (capiError) {
      // PULSE:OK — Facebook CAPI is non-critical analytics; webhook must not fail for it
      this.logger.error(`Facebook CAPI lookup error: ${capiError}`);
    }

    // Send payment confirmation email (non-critical)
    try {
      const emailService = new (await import('../auth/email.service')).EmailService();
      await emailService.sendEmail({
        to: order.customerEmail,
        subject: `Pagamento confirmado — ${order.plan?.product?.name || 'Seu pedido'}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0A0A0C;color:#e0e0e0;padding:40px;">
      <h1 style="color:#E85D30;">KLOEL</h1>
      <p>Ola ${order.customerName},</p>
      <p>Seu pagamento foi confirmado!</p>
      <div style="background:#151517;padding:20px;border-radius:6px;margin:20px 0;">
        <p><strong>Produto:</strong> ${order.plan?.product?.name || '—'}</p>
        <p><strong>Valor:</strong> R$ ${Number((chargedAmount || order.totalInCents / 100 || 0).toFixed(2))}</p>
        <p><strong>Pedido:</strong> #${order.orderNumber || order.id}</p>
      </div>
    </div>`,
      });
    } catch (emailErr) {
      // PULSE:OK — Email delivery is non-critical; webhook already processed payment
      this.logger.warn(`Payment confirmation email failed: ${emailErr}`);
    }
  }

  // ── REFUND / CHARGEBACK ───────────────────────────────────────────
  private async handleRefundOrChargeback(
    checkoutPayment: any,
    order: any,
    workspaceId: string | undefined,
    newStatus: 'REFUNDED' | 'CHARGEBACK',
    context: {
      provider: 'asaas' | 'mercadopago';
      externalId: string;
      rawPayload: any;
      baseAmount?: number;
      chargedAmount?: number;
      producerNetAmount?: number;
    },
  ) {
    const now = new Date();
    const amountInCents: number = order?.totalInCents ?? 0;
    const baseAmount = Number(context.baseAmount ?? amountInCents / 100);
    const chargedAmount = Number(context.chargedAmount ?? baseAmount);
    const producerNetAmount = Number(context.producerNetAmount ?? baseAmount);
    const orderMetadata =
      order?.metadata && typeof order.metadata === 'object' && !Array.isArray(order.metadata)
        ? (order.metadata as Record<string, any>)
        : {};
    const affiliateCommissionAmount = centsToAmount(orderMetadata.affiliateCommissionInCents || 0);
    const isRefund = newStatus === 'REFUNDED';
    const txType = isRefund ? 'refund' : 'chargeback';

    await this.prisma.$transaction(async (tx: any) => {
      // isolationLevel: ReadCommitted
      // 1. Update CheckoutPayment status
      await tx.checkoutPayment.update({
        where: { id: checkoutPayment.id },
        data: { status: newStatus, webhookData: context.rawPayload },
      });

      // 2. Update CheckoutOrder status
      await tx.checkoutOrder.update({
        where: { id: checkoutPayment.orderId },
        data: {
          status: newStatus,
          refundedAt: now,
        },
      });

      // 3. Update KloelSale status
      try {
        await tx.kloelSale.updateMany({
          where: { externalPaymentId: context.externalId },
          data: { status: isRefund ? 'refunded' : 'chargeback' },
        });
      } catch (saleErr: any) {
        this.logger.warn(`KloelSale ${txType} update failed: ${saleErr?.message}`);
      }

      // 4. Create KloelWalletTransaction of type 'refund' or 'chargeback' and adjust balance
      if (workspaceId && producerNetAmount > 0) {
        try {
          const wallet = await tx.kloelWallet.findUnique({
            where: { workspaceId },
          });
          if (wallet) {
            // Deduct from pendingBalance first; if already settled, deduct from availableBalance
            if (wallet.pendingBalance >= producerNetAmount) {
              await tx.kloelWallet.update({
                where: { id: wallet.id },
                data: { pendingBalance: { decrement: producerNetAmount } },
              });
            } else {
              await tx.kloelWallet.update({
                where: { id: wallet.id },
                data: { availableBalance: { decrement: producerNetAmount } },
              });
            }

            await tx.kloelWalletTransaction.create({
              data: {
                walletId: wallet.id,
                type: txType,
                amount: -producerNetAmount,
                description: `${isRefund ? 'Estorno' : 'Chargeback'}: pedido #${order?.orderNumber || 'N/A'}`,
                reference: checkoutPayment.orderId,
                status: 'completed',
                metadata: {
                  checkoutOrderId: order?.id,
                  externalPaymentId: context.externalId,
                  baseAmount,
                  chargedAmount,
                  producerNetAmount,
                  provider: context.provider,
                  orderNumber: order?.orderNumber,
                },
              },
            });
          }
        } catch (walletErr: any) {
          this.logger.warn(`Wallet ${txType} transaction failed: ${walletErr?.message}`);
        }
      }

      if (orderMetadata.affiliateLinkId && affiliateCommissionAmount > 0) {
        try {
          await tx.affiliateLink.update({
            where: { id: orderMetadata.affiliateLinkId },
            data: {
              sales: { decrement: 1 },
              revenue: { decrement: baseAmount },
              commissionEarned: { decrement: affiliateCommissionAmount },
            },
          });
        } catch (affiliateErr: any) {
          this.logger.warn(`Affiliate ${txType} reversal failed: ${affiliateErr?.message}`);
        }
      }
    });
  }
}
