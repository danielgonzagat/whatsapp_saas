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
import { toPrismaJsonValue } from '../common/prisma/prisma-json.util';
import { MercadoPagoService } from '../kloel/mercado-pago.service';
import { PlatformWalletService } from '../platform-wallet/platform-wallet.service';
import { PrismaService } from '../prisma/prisma.service';
import { calculatePhysicalOrderUnitCount } from './checkout-order-pricing.util';
import { CheckoutPostPaymentEffectsService } from './checkout-post-payment-effects.service';
import { verifyMercadoPagoWebhookSignature } from './mercado-pago-webhook-signature.util';

// Prisma deep-include return types — derived from the shared include constant below
// using Prisma.CheckoutPaymentGetPayload so the types stay in sync with the query.

const WEBHOOK_PAYMENT_INCLUDE = {
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
} as const;

type WebhookCheckoutPayment = Prisma.CheckoutPaymentGetPayload<{
  include: typeof WEBHOOK_PAYMENT_INCLUDE;
}>;

type WebhookOrder = WebhookCheckoutPayment['order'];

type WebhookProduct = NonNullable<NonNullable<WebhookOrder>['plan']>['product'];

type PaymentConfirmationContext = {
  provider: 'asaas' | 'mercadopago';
  externalId: string;
  rawPayload: unknown;
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

function optionalText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized || undefined;
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return undefined;
}

function resolveMercadoPagoNotification(
  body: Record<string, unknown>,
  req: Record<string, unknown>,
): MercadoPagoNotification {
  const query = (req?.query as Record<string, unknown>) || {};
  const queryData = (query?.data as Record<string, unknown>) || {};
  const bodyData = (body?.data as Record<string, unknown>) || {};
  const queryDataId = firstQueryValue(query?.['data.id']) || firstQueryValue(queryData?.id);
  const queryId = firstQueryValue(query?.id);
  const topic = (
    firstQueryValue(query?.topic) ||
    firstQueryValue(query?.type) ||
    optionalText(body?.type) ||
    optionalText(body?.topic) ||
    ''
  ).toLowerCase();
  const action = (optionalText(body?.action) || '').toLowerCase();
  const resourceId =
    queryDataId ||
    queryId ||
    optionalText(bodyData?.id) ||
    optionalText(body?.id) ||
    (typeof body?.resource === 'string' ? body.resource.split('/').pop() : undefined) ||
    null;

  return {
    topic,
    action,
    resourceId: resourceId ? String(resourceId) : null,
    signatureDataId: (queryDataId || bodyData?.id || body?.id || null) as string | null,
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
    private readonly financialAlert: FinancialAlertService,
    private readonly mercadoPago: MercadoPagoService,
    private readonly checkoutPostPaymentEffects: CheckoutPostPaymentEffectsService,
    private readonly platformWallet: PlatformWalletService,
  ) {}

  @Public()
  @Post('asaas')
  @HttpCode(200)
  @Throttle({ default: { limit: 200, ttl: 60000 } })
  async handleAsaasWebhook(
    @Headers('asaas-access-token') accessToken: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Record<string, unknown>,
  ) {
    // Signature verification — reject unauthorized webhooks
    const expected = process.env.ASAAS_WEBHOOK_TOKEN;
    if (expected && (!accessToken || accessToken !== expected)) {
      this.logger.warn(`Checkout webhook rejected — invalid token`, {
        ip: req?.ip,
      });
      throw new ForbiddenException('Invalid webhook token');
    }

    const event = typeof body.event === 'string' ? body.event : '';
    const payment = (body.payment || {}) as Record<string, string | undefined>;
    const paymentId = optionalText(payment.id);
    this.logger.log(`Checkout Asaas webhook: ${event} for payment ${paymentId || 'unknown'}`);

    if (!paymentId) return { received: true };

    // Try finding by externalId first, then by record ID, then by externalReference
    let checkoutPayment = await this.prisma.checkoutPayment.findFirst({
      where: { externalId: paymentId },
      include: WEBHOOK_PAYMENT_INCLUDE,
    });

    if (!checkoutPayment && payment.externalReference) {
      checkoutPayment = await this.prisma.checkoutPayment.findFirst({
        where: {
          OR: [{ id: payment.externalReference }, { orderId: payment.externalReference }],
        },
        include: WEBHOOK_PAYMENT_INCLUDE,
      });
    }

    if (!checkoutPayment) {
      this.logger.warn(
        `CheckoutPayment not found for externalId: ${paymentId}, ref: ${payment.externalReference}`,
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
        `Webhook ${event} for payment ${paymentId} already processed (status: ${checkoutPayment.status}). Skipping.`,
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
        externalId: paymentId,
      })
    ) {
      this.logger.warn(
        `Checkout webhook rejected by state machine: ${currentStatus} -> ${newStatus} for payment ${paymentId}`,
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
          externalId: paymentId,
          rawPayload: payment,
          paymentMethod: optionalText(payment.billingType) || order?.paymentMethod || null,
        });
      }

      // ── REFUND / CHARGEBACK FLOW ────────────────────────────────────
      if (newStatus === 'REFUNDED' || newStatus === 'CHARGEBACK') {
        await this.handleRefundOrChargeback(checkoutPayment, order, workspaceId, newStatus, {
          provider: 'asaas',
          externalId: paymentId,
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
            await tx.checkoutOrder.updateMany({
              where: { id: checkoutPayment.orderId, workspaceId },
              data: { status: orderStatus, canceledAt: new Date() },
            });
          },
          { isolationLevel: 'ReadCommitted' },
        );
      }
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      // Webhook must never fail — always return 200
      this.logger.error(
        `Error processing checkout webhook event=${event} paymentId=${paymentId}: ${errInstanceofError?.message}`,
        errInstanceofError?.stack,
      );
      this.financialAlert.webhookProcessingFailed(errInstanceofError, {
        provider: 'asaas',
        externalId: paymentId,
        eventType: event,
      });
    }

    return { received: true, processed: true };
  }

  @Public()
  @Post('mercado-pago')
  @HttpCode(200)
  @Throttle({ default: { limit: 200, ttl: 60000 } })
  async handleMercadoPagoWebhook(
    @Body() body: Record<string, unknown>,
    @Req() req: Record<string, unknown>,
  ) {
    return this.processMercadoPagoNotification(body, req, { allowUnsignedLegacyIpn: false });
  }

  @Public()
  @Post('mercado-pago/ipn')
  @HttpCode(200)
  @Throttle({ default: { limit: 200, ttl: 60000 } })
  async handleMercadoPagoIpn(
    @Body() body: Record<string, unknown>,
    @Req() req: Record<string, unknown>,
  ) {
    return this.processMercadoPagoNotification(body, req, { allowUnsignedLegacyIpn: true });
  }

  private async processMercadoPagoNotification(
    body: Record<string, unknown>,
    req: Record<string, unknown>,
    options: { allowUnsignedLegacyIpn: boolean },
  ) {
    const webhookSecret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() || '';
    const notification = resolveMercadoPagoNotification(body, req);
    const reqHeaders = (req?.headers as Record<string, unknown>) || {};
    const signatureHeader = reqHeaders['x-signature'] as string | undefined;
    const requestIdHeader = reqHeaders['x-request-id'] as string | undefined;

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

    let checkoutPayment = await this.prisma.checkoutPayment.findFirst({
      where: { externalId: String(notification.resourceId) },
      include: WEBHOOK_PAYMENT_INCLUDE,
    });
    let resourceId = String(notification.resourceId);

    let workspaceId = checkoutPayment?.order?.workspaceId;
    if (!workspaceId) {
      const mercadoPagoUserId = firstQueryValue(body?.user_id);
      if (mercadoPagoUserId) {
        workspaceId = await this.mercadoPago.findWorkspaceIdByMercadoPagoUserId(mercadoPagoUserId);
      }
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
            include: WEBHOOK_PAYMENT_INCLUDE,
          });
        }

        resourceId = String(orderPaymentId);
      }

      payment = await this.mercadoPago.getPaymentById(workspaceId, resourceId);
    } catch (error: unknown) {
      const errorInstanceofError =
        error instanceof Error
          ? error
          : new Error(typeof error === 'string' ? error : 'unknown error');
      this.logger.error(
        `Mercado Pago webhook fetch failed for ${resourceId}: ${errorInstanceofError.message}`,
      );
      this.financialAlert.webhookProcessingFailed(errorInstanceofError, {
        provider: 'mercadopago',
        externalId: String(resourceId),
        eventType: notification.action || notification.topic,
      });
      return { received: true, failed: true };
    }

    if (!checkoutPayment && payment.external_reference) {
      checkoutPayment = await this.prisma.checkoutPayment.findFirst({
        where: {
          OR: [{ orderId: payment.external_reference }, { id: payment.external_reference }],
        },
        include: WEBHOOK_PAYMENT_INCLUDE,
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
        ? (order.metadata as Record<string, unknown>)
        : {};
    const baseAmount = centsToAmount(
      Number(orderMetadata.baseTotalInCents || order?.totalInCents || 0),
    );
    const chargedAmount = Number(
      payment.transaction_amount ||
        centsToAmount(Number(orderMetadata.chargedTotalInCents || order?.totalInCents || 0)),
    );
    const gatewayFeeAmount = sumMercadoPagoFees(payment);
    const platformFeeAmount = centsToAmount(Number(orderMetadata.platformFeeInCents || 0));
    const installmentInterestAmount = centsToAmount(
      Number(orderMetadata.installmentInterestInCents || 0),
    );
    const affiliateCommissionAmount = centsToAmount(
      Number(orderMetadata.affiliateCommissionInCents || 0),
    );
    const platformNetRevenueAmount = Math.max(
      0,
      platformFeeAmount + installmentInterestAmount - gatewayFeeAmount,
    );
    const producerNetAmount =
      orderMetadata.producerNetInCents != null
        ? centsToAmount(Number(orderMetadata.producerNetInCents))
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
          affiliateLinkId: (orderMetadata.affiliateLinkId as string) || null,
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
                webhookData: toPrismaJsonValue(payment),
              },
            });
            await tx.checkoutOrder.updateMany({
              where: { id: checkoutPayment.orderId, workspaceId },
              data:
                nextOrderStatus === 'CANCELED'
                  ? { status: nextOrderStatus, canceledAt: new Date() }
                  : { status: nextOrderStatus },
            });
          },
          { isolationLevel: 'ReadCommitted' },
        );
      }
    } catch (err: unknown) {
      const errInstanceofError =
        err instanceof Error ? err : new Error(typeof err === 'string' ? err : 'unknown error');
      this.logger.error(
        `Error processing Mercado Pago webhook paymentId=${resourceId}: ${errInstanceofError?.message}`,
        errInstanceofError?.stack,
      );
      this.financialAlert.webhookProcessingFailed(errInstanceofError, {
        provider: 'mercadopago',
        externalId: String(resourceId),
        eventType: notification.action || notification.topic,
      });
    }

    return { received: true, processed: true };
  }

  // ── PAYMENT CONFIRMED ─────────────────────────────────────────────
  private async handlePaymentConfirmed(
    checkoutPayment: WebhookCheckoutPayment,
    order: WebhookOrder,
    product: WebhookProduct,
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

    await this.prisma.$transaction(async (tx) => {
      // isolationLevel: ReadCommitted
      // 1. Update CheckoutPayment status → APPROVED (=PAID)
      await tx.checkoutPayment.update({
        where: { id: checkoutPayment.id },
        data: { status: 'APPROVED', webhookData: toPrismaJsonValue(context.rawPayload) },
      });

      // 2. Update CheckoutOrder status → PAID, set paidAt
      await tx.checkoutOrder.updateMany({
        where: { id: checkoutPayment.orderId, workspaceId },
        data: { status: 'PAID', paidAt: now },
      });

      // 2a. SP-9 — Credit the platform wallet. Runs inside the same
      // transaction so the PAID transition and the ledger append
      // either both land or neither does (I-ADMIN-W3). The ledger's
      // partial unique index on (order_id, kind) makes this
      // idempotent even under webhook replay (I-ADMIN-W5): a retry
      // throws P2002 which we log and swallow.
      const platformFeeInCents = Math.round(
        Number(context.platformNetRevenueAmount ?? context.platformFeeAmount ?? 0) * 100,
      );
      if (platformFeeInCents > 0) {
        try {
          await this.platformWallet.append(
            {
              direction: 'credit',
              bucket: 'AVAILABLE',
              amountInCents: BigInt(platformFeeInCents),
              kind: 'PLATFORM_FEE_CREDIT',
              orderId: checkoutPayment.orderId,
              reason: 'platform_fee_on_paid',
              metadata: {
                provider: context.provider,
                externalId: context.externalId,
              },
            },
            tx,
          );
        } catch (walletErr: unknown) {
          // P2002 = unique constraint — expected on webhook replays.
          const code =
            walletErr &&
            typeof walletErr === 'object' &&
            'code' in walletErr &&
            typeof (walletErr as { code: unknown }).code === 'string'
              ? (walletErr as { code: string }).code
              : null;
          if (code === 'P2002') {
            this.logger.debug(
              `[platform-wallet] skipped duplicate PLATFORM_FEE_CREDIT for order ${checkoutPayment.orderId}`,
            );
          } else {
            throw walletErr;
          }
        }
      }

      // 3. Create or update KloelSale
      try {
        if (workspaceId) {
          const existingSale = await tx.kloelSale.findFirst({
            where: { externalPaymentId: context.externalId, workspaceId },
          });
          if (existingSale) {
            await tx.kloelSale.updateMany({
              where: { id: existingSale.id, workspaceId },
              data: { status: 'paid', paidAt: now, amount: baseAmount },
            });
          } else {
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
        }
      } catch (saleErr: unknown) {
        const saleErrInstanceofError =
          saleErr instanceof Error
            ? saleErr
            : new Error(typeof saleErr === 'string' ? saleErr : 'unknown error');
        // PULSE:OK — KloelSale sync is non-critical; webhook processing continues
        this.logger.warn(`KloelSale upsert failed: ${saleErrInstanceofError?.message}`);
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
          await tx.kloelWallet.updateMany({
            where: { id: wallet.id, workspaceId },
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
        } catch (walletErr: unknown) {
          const walletErrInstanceofError =
            walletErr instanceof Error
              ? walletErr
              : new Error(typeof walletErr === 'string' ? walletErr : 'unknown error');
          // PULSE:OK — Wallet update non-critical in webhook; funds reconciled via Asaas later
          this.logger.warn(`Wallet update failed: ${walletErrInstanceofError?.message}`);
        }
      }

      // 6. If the product is physical, create PhysicalOrder with status PROCESSING
      if (workspaceId && product?.format === 'PHYSICAL') {
        try {
          const shippingAddress =
            order?.shippingAddress &&
            typeof order.shippingAddress === 'object' &&
            !Array.isArray(order.shippingAddress)
              ? (order.shippingAddress as Record<string, unknown>)
              : ({} as Record<string, unknown>);
          const orderMetadata =
            order?.metadata && typeof order.metadata === 'object' && !Array.isArray(order.metadata)
              ? (order.metadata as Record<string, unknown>)
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
              addressStreet:
                optionalText(shippingAddress.street) ||
                optionalText(shippingAddress.address) ||
                null,
              addressCity: optionalText(shippingAddress.city) || null,
              addressState: optionalText(shippingAddress.state) || null,
              addressZip:
                optionalText(shippingAddress.zip) ||
                optionalText(shippingAddress.zipCode) ||
                optionalText(shippingAddress.cep) ||
                null,
              addressCountry: optionalText(shippingAddress.country) || 'BR',
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
        } catch (physicalErr: unknown) {
          const physicalErrInstanceofError =
            physicalErr instanceof Error
              ? physicalErr
              : new Error(typeof physicalErr === 'string' ? physicalErr : 'unknown error');
          this.logger.warn(`PhysicalOrder creation failed: ${physicalErrInstanceofError?.message}`);
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
        } catch (affiliateErr: unknown) {
          const affiliateErrInstanceofError =
            affiliateErr instanceof Error
              ? affiliateErr
              : new Error(typeof affiliateErr === 'string' ? affiliateErr : 'unknown error');
          this.logger.warn(
            `Affiliate metrics update failed: ${affiliateErrInstanceofError?.message}`,
          );
        }
      }
    });

    await this.checkoutPostPaymentEffects.markLeadConverted(order, workspaceId);
    await this.checkoutPostPaymentEffects.sendPurchaseSignals(order, chargedAmount);
  }

  // ── REFUND / CHARGEBACK ───────────────────────────────────────────
  private async handleRefundOrChargeback(
    checkoutPayment: WebhookCheckoutPayment,
    order: WebhookOrder,
    workspaceId: string | undefined,
    newStatus: 'REFUNDED' | 'CHARGEBACK',
    context: {
      provider: 'asaas' | 'mercadopago';
      externalId: string;
      rawPayload: unknown;
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
        ? (order.metadata as Record<string, unknown>)
        : {};
    const affiliateCommissionAmount = centsToAmount(
      Number(orderMetadata.affiliateCommissionInCents || 0),
    );
    const isRefund = newStatus === 'REFUNDED';
    const txType = isRefund ? 'refund' : 'chargeback';

    await this.prisma.$transaction(async (tx) => {
      // isolationLevel: ReadCommitted
      // 1. Update CheckoutPayment status
      await tx.checkoutPayment.update({
        where: { id: checkoutPayment.id },
        data: { status: newStatus, webhookData: toPrismaJsonValue(context.rawPayload) },
      });

      // 2. Update CheckoutOrder status
      await tx.checkoutOrder.updateMany({
        where: { id: checkoutPayment.orderId, workspaceId },
        data: {
          status: newStatus,
          refundedAt: now,
        },
      });

      // 3. Update KloelSale status
      try {
        if (workspaceId) {
          await tx.kloelSale.updateMany({
            where: { externalPaymentId: context.externalId, workspaceId },
            data: { status: isRefund ? 'refunded' : 'chargeback' },
          });
        }
      } catch (saleErr: unknown) {
        const saleErrInstanceofError =
          saleErr instanceof Error
            ? saleErr
            : new Error(typeof saleErr === 'string' ? saleErr : 'unknown error');
        this.logger.warn(`KloelSale ${txType} update failed: ${saleErrInstanceofError?.message}`);
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
              await tx.kloelWallet.updateMany({
                where: { id: wallet.id, workspaceId },
                data: { pendingBalance: { decrement: producerNetAmount } },
              });
            } else {
              await tx.kloelWallet.updateMany({
                where: { id: wallet.id, workspaceId },
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
        } catch (walletErr: unknown) {
          const walletErrInstanceofError =
            walletErr instanceof Error
              ? walletErr
              : new Error(typeof walletErr === 'string' ? walletErr : 'unknown error');
          this.logger.warn(
            `Wallet ${txType} transaction failed: ${walletErrInstanceofError?.message}`,
          );
        }
      }

      if (orderMetadata.affiliateLinkId && affiliateCommissionAmount > 0) {
        try {
          await tx.affiliateLink.update({
            where: { id: orderMetadata.affiliateLinkId as string },
            data: {
              sales: { decrement: 1 },
              revenue: { decrement: baseAmount },
              commissionEarned: { decrement: affiliateCommissionAmount },
            },
          });
        } catch (affiliateErr: unknown) {
          const affiliateErrInstanceofError =
            affiliateErr instanceof Error
              ? affiliateErr
              : new Error(typeof affiliateErr === 'string' ? affiliateErr : 'unknown error');
          this.logger.warn(
            `Affiliate ${txType} reversal failed: ${affiliateErrInstanceofError?.message}`,
          );
        }
      }
    });
  }
}
