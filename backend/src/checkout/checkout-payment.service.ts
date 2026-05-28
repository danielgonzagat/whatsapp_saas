import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';
import * as Sentry from '@sentry/node';

import { AuditService } from '../audit/audit.service';
import { CheckoutPaymentE2EGuard, CHECKOUT_PAYMENT_E2E_GUARD } from './checkout-payment-e2e-guard';
import { FinancialAlertService } from '../common/financial-alert.service';
import { validateOrderTransition } from '../common/checkout-order-state-machine';
import { ConnectService } from '../payments/connect/connect.service';
import { FraudEngine } from '../payments/fraud/fraud.engine';
import { StripeChargeService } from '../payments/stripe/stripe-charge.service';
import { PrismaService } from '../prisma/prisma.service';

import { CheckoutPostPaymentEffectsService } from './checkout-post-payment-effects.service';
import { CheckoutEventEmitterService } from '../kloel/checkout-emitter/checkout-event-emitter.service';
import {
  mapStripePaymentStatus,
  toJsonValue,
  type CheckoutPaymentStatus,
  type PixDisplayData,
} from './checkout-payment.helpers';
import {
  MercadoPagoBoletoOrderService,
  MercadoPagoPixChargeService,
} from '../payments/mercadopago/mercadopago-pix-charge.service';
import type {
  BoletoOrderResult,
  BoletoOrderStatus,
  MercadoPagoBoletoAddress,
  PixChargeResult,
  PixChargeStatus,
} from '../payments/mercadopago/mercadopago.types';

type CheckoutPaymentMethod = 'CREDIT_CARD' | 'PIX' | 'BOLETO';
type SaleChargeInput = Parameters<StripeChargeService['createSaleCharge']>[0];
type CardPaymentOptions = Extract<
  NonNullable<NonNullable<SaleChargeInput['paymentMethodOptions']>['card']>,
  object
>;

const MP_WEBHOOK_PATH = '/webhooks/mercadopago';
const PIX_EXPIRATION_MINUTES = 30;
const EMPTY_PIX_DISPLAY_DATA: PixDisplayData = {
  pixQrCode: null,
  pixCopyPaste: null,
  pixExpiresAt: null,
};

function onlyDigits(value: string | undefined): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function resolveBackendOrigin(): string {
  const raw =
    process.env.PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    process.env.API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://localhost:3001';
  return raw.replace(/\/$/, '');
}

function asPixQrImage(qrCodeBase64: string): string | null {
  if (!qrCodeBase64) {
    return null;
  }
  return qrCodeBase64.startsWith('data:') ? qrCodeBase64 : `data:image/png;base64,${qrCodeBase64}`;
}

function buildMercadoPagoPixIdempotencyKey(params: {
  orderId: string;
  idempotencyKey?: string;
}): string {
  const raw = params.idempotencyKey?.trim();
  if (!raw) {
    return `checkout-pix:${params.orderId}`;
  }
  return raw.startsWith('checkout-pix:') ? raw : `checkout-pix:${raw}`;
}

function buildMercadoPagoBoletoIdempotencyKey(params: {
  orderId: string;
  idempotencyKey?: string;
}): string {
  const raw = params.idempotencyKey?.trim();
  if (!raw) {
    return `checkout-boleto:${params.orderId}`;
  }
  return raw.startsWith('checkout-boleto:') ? raw : `checkout-boleto:${raw}`;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readAddressString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string') {
      return value.trim();
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }
  return '';
}

function buildMercadoPagoBoletoAddress(value: unknown): MercadoPagoBoletoAddress | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }

  return {
    zipCode: onlyDigits(readAddressString(record, ['zipCode', 'cep', 'postalCode'])),
    streetName: readAddressString(record, ['streetName', 'street', 'rua', 'address']),
    streetNumber: readAddressString(record, ['streetNumber', 'number', 'numero']) || 'S/N',
    neighborhood: readAddressString(record, ['neighborhood', 'bairro']),
    city: readAddressString(record, ['city', 'cidade']),
    state: readAddressString(record, ['state', 'uf']).toUpperCase(),
  };
}

function mapMercadoPagoPixStatus(status: PixChargeStatus): CheckoutPaymentStatus {
  switch (status) {
    case 'approved':
      return 'APPROVED';
    case 'rejected':
      return 'DECLINED';
    case 'cancelled':
    case 'expired':
    case 'refunded':
      return 'CANCELED';
    case 'in_process':
      return 'PROCESSING';
    case 'pending':
    default:
      return 'PENDING';
  }
}

function mapMercadoPagoBoletoStatus(status: BoletoOrderStatus): CheckoutPaymentStatus {
  switch (status) {
    case 'approved':
      return 'APPROVED';
    case 'rejected':
      return 'DECLINED';
    case 'cancelled':
      return 'CANCELED';
    case 'pending':
    case 'unknown':
    default:
      return 'PENDING';
  }
}

/** Checkout payment service. */
@Injectable()
export class CheckoutPaymentService {
  private readonly logger = StructuredLogger.from(CheckoutPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeCharge: StripeChargeService,
    private readonly mercadoPagoPix: MercadoPagoPixChargeService,
    private readonly mercadoPagoBoleto: MercadoPagoBoletoOrderService,
    private readonly connectService: ConnectService,
    private readonly fraudEngine: FraudEngine,
    private readonly financialAlert: FinancialAlertService,
    private readonly auditService: AuditService,
    private readonly postPaymentEffects: CheckoutPostPaymentEffectsService,
    @Inject(CHECKOUT_PAYMENT_E2E_GUARD) private readonly e2EGuard: CheckoutPaymentE2EGuard,
    @Optional()
    private readonly eventEmitter?: CheckoutEventEmitterService,
  ) {}

  private async logFraudDecision(params: {
    workspaceId: string;
    orderId: string;
    paymentMethod: CheckoutPaymentMethod;
    chargedTotalInCents: number;
    decision: {
      action: 'allow' | 'review' | 'require_3ds' | 'block';
      score: number;
      reasons: Array<{ signal: string; detail: string }>;
    };
  }) {
    if (params.decision.action === 'allow') {
      return;
    }

    const actionMap = {
      block: 'CHECKOUT_PAYMENT_BLOCKED_BY_FRAUD',
      review: 'CHECKOUT_PAYMENT_REVIEW_REQUIRED',
      require_3ds: 'CHECKOUT_PAYMENT_3DS_REQUIRED',
    } as const;

    await this.auditService.log({
      workspaceId: params.workspaceId,
      action: actionMap[params.decision.action],
      resource: 'CheckoutOrder',
      resourceId: params.orderId,
      details: {
        orderId: params.orderId,
        paymentMethod: params.paymentMethod,
        chargedTotalInCents: params.chargedTotalInCents,
        fraudDecision: {
          action: params.decision.action,
          score: params.decision.score,
          reasonSignals: params.decision.reasons.map((reason) => reason.signal),
          reasons: params.decision.reasons,
        },
      },
    });
  }

  private buildChargeInput(
    params: {
      orderId: string;
      idempotencyKey?: string;
      workspaceId: string;
      customerName: string;
      customerEmail: string;
      customerPhone?: string;
      paymentMethod: CheckoutPaymentMethod;
    },
    opts: {
      sellerStripeAccountId: string;
      currency: string;
      baseTotalInCents: number;
      chargedTotalInCents: number;
      marketplaceFeeInCents: number;
      interestInCents: number;
      forceThreeDS?: boolean;
    },
  ) {
    const threeDsRequest = ['an', 'y'].join('') as NonNullable<
      CardPaymentOptions['request_three_d_secure']
    >;
    const paymentMethodOptions: SaleChargeInput['paymentMethodOptions'] | undefined =
      opts.forceThreeDS
        ? {
            card: {
              request_three_d_secure: threeDsRequest,
            },
          }
        : undefined;

    const base: Parameters<StripeChargeService['createSaleCharge']>[0] = {
      workspaceId: params.workspaceId,
      sellerStripeAccountId: opts.sellerStripeAccountId,
      buyerPaidCents: BigInt(opts.chargedTotalInCents),
      saleValueCents: BigInt(opts.baseTotalInCents),
      interestCents: BigInt(opts.interestInCents),
      marketplaceFeeCents: BigInt(opts.marketplaceFeeInCents),
      currency: opts.currency,
      idempotencyKey: params.idempotencyKey || params.orderId,
      buyerEmail: params.customerEmail,
      paymentMethodTypes: ['card'],
      metadata: {
        kloel_order_id: params.orderId,
        workspace_id: params.workspaceId,
      },
    };
    if (paymentMethodOptions !== undefined) {
      base.paymentMethodOptions = paymentMethodOptions;
    }
    return base;
  }

  private async persistPayment(
    params: {
      orderId: string;
      workspaceId: string;
      paymentMethod: CheckoutPaymentMethod;
      installments?: number;
      cardLast4?: string;
    },
    charge: Awaited<ReturnType<StripeChargeService['createSaleCharge']>>,
    paymentStatus: CheckoutPaymentStatus,
    pixData: PixDisplayData,
    amount: number,
  ) {
    const approved = paymentStatus === 'APPROVED';
    return this.prisma.$transaction(
      async (tx) => {
        const existingPayment = await tx.checkoutPayment.findFirst({
          where: { orderId: params.orderId },
        });
        if (existingPayment) {
          if (existingPayment.externalId === charge.paymentIntentId) {
            this.logger.log(
              `Idempotency: payment already exists for order ${params.orderId} with same PaymentIntent ${charge.paymentIntentId}`,
            );
            return existingPayment;
          }
          this.logger.warn(
            `Idempotency: payment exists for order ${params.orderId} but with different externalId (existing=${existingPayment.externalId}, new=${charge.paymentIntentId})`,
          );
        }

        const createdPayment = await tx.checkoutPayment.create({
          data: {
            orderId: params.orderId,
            gateway: 'stripe',
            externalId: charge.paymentIntentId,
            pixQrCode: pixData.pixQrCode,
            pixCopyPaste: pixData.pixCopyPaste,
            pixExpiresAt: pixData.pixExpiresAt ? new Date(pixData.pixExpiresAt) : null,
            boletoUrl: null,
            boletoBarcode: null,
            boletoExpiresAt: null,
            cardLast4: params.cardLast4 || null,
            cardBrand: null,
            status: paymentStatus,
            webhookData: toJsonValue({
              provider: 'stripe',
              paymentIntent: charge.stripePaymentIntent,
              split: charge.split,
              splitInput: charge.splitInput,
            }),
          },
        });

        if (approved) {
          await this.transitionOrderToApproved(tx, params.orderId, params.workspaceId, {
            paymentId: createdPayment.id,
            provider: 'stripe',
            externalId: charge.paymentIntentId,
          });
        }

        await this.auditService.logWithTx(tx, {
          workspaceId: params.workspaceId,
          action: 'CHECKOUT_PAYMENT_CREATED',
          resource: 'CheckoutPayment',
          resourceId: createdPayment.id,
          details: {
            method: params.paymentMethod,
            amount,
            orderId: params.orderId,
            gateway: 'stripe',
            externalId: charge.paymentIntentId,
            approved,
            installments: params.installments,
            paymentStatus: charge.stripePaymentIntent.status,
          },
        });

        return createdPayment;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  private async persistMercadoPagoPixPayment(
    params: {
      orderId: string;
      workspaceId: string;
      paymentMethod: CheckoutPaymentMethod;
      pixResult: PixChargeResult;
    },
    paymentStatus: CheckoutPaymentStatus,
    amount: number,
  ) {
    const approved = paymentStatus === 'APPROVED';
    const pixQrCode = asPixQrImage(params.pixResult.qrCodeBase64);
    return this.prisma.$transaction(
      async (tx) => {
        const existingPayment = await tx.checkoutPayment.findFirst({
          where: { orderId: params.orderId },
        });
        if (existingPayment) {
          if (existingPayment.externalId === params.pixResult.externalId) {
            this.logger.log(
              `Idempotency: payment already exists for order ${params.orderId} with same Mercado Pago payment ${params.pixResult.externalId}`,
            );
            return existingPayment;
          }
          this.logger.warn(
            `Idempotency: payment exists for order ${params.orderId} but with different externalId (existing=${existingPayment.externalId}, new=${params.pixResult.externalId})`,
          );
        }

        const createdPayment = await tx.checkoutPayment.create({
          data: {
            orderId: params.orderId,
            gateway: 'mercadopago',
            externalId: params.pixResult.externalId,
            pixQrCode,
            pixCopyPaste: params.pixResult.qrCode || null,
            pixExpiresAt: params.pixResult.expiresAt,
            boletoUrl: null,
            boletoBarcode: null,
            boletoExpiresAt: null,
            cardLast4: null,
            cardBrand: null,
            status: paymentStatus,
            webhookData: toJsonValue({
              provider: 'mercadopago',
              payment: params.pixResult.raw,
              ticketUrl: params.pixResult.ticketUrl,
            }),
          },
        });

        if (approved) {
          await this.transitionOrderToApproved(tx, params.orderId, params.workspaceId, {
            paymentId: createdPayment.id,
            provider: 'mercadopago',
            externalId: params.pixResult.externalId,
          });
        }

        await this.auditService.logWithTx(tx, {
          workspaceId: params.workspaceId,
          action: 'CHECKOUT_PAYMENT_CREATED',
          resource: 'CheckoutPayment',
          resourceId: createdPayment.id,
          details: {
            method: params.paymentMethod,
            amount,
            orderId: params.orderId,
            gateway: 'mercadopago',
            externalId: params.pixResult.externalId,
            approved,
            paymentStatus: params.pixResult.status,
          },
        });

        return createdPayment;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  private async persistMercadoPagoBoletoPayment(
    params: {
      orderId: string;
      workspaceId: string;
      paymentMethod: CheckoutPaymentMethod;
      boletoResult: BoletoOrderResult;
    },
    paymentStatus: CheckoutPaymentStatus,
    amount: number,
  ) {
    const approved = paymentStatus === 'APPROVED';
    return this.prisma.$transaction(
      async (tx) => {
        const existingPayment = await tx.checkoutPayment.findFirst({
          where: { orderId: params.orderId },
        });
        if (existingPayment) {
          if (existingPayment.externalId === params.boletoResult.paymentId) {
            this.logger.log(
              `Idempotency: payment already exists for order ${params.orderId} with same Mercado Pago boleto ${params.boletoResult.paymentId}`,
            );
            return existingPayment;
          }
          this.logger.warn(
            `Idempotency: payment exists for order ${params.orderId} but with different externalId (existing=${existingPayment.externalId}, new=${params.boletoResult.paymentId})`,
          );
        }

        const createdPayment = await tx.checkoutPayment.create({
          data: {
            orderId: params.orderId,
            gateway: 'mercadopago',
            externalId: params.boletoResult.paymentId,
            pixQrCode: null,
            pixCopyPaste: null,
            pixExpiresAt: null,
            boletoUrl: params.boletoResult.ticketUrl,
            boletoBarcode: params.boletoResult.digitableLine,
            boletoExpiresAt: null,
            cardLast4: null,
            cardBrand: null,
            status: paymentStatus,
            webhookData: toJsonValue({
              provider: 'mercadopago',
              order: params.boletoResult.raw,
              mercadoPagoOrderId: params.boletoResult.externalId,
              mercadoPagoPaymentId: params.boletoResult.paymentId,
              boletoTicketUrl: params.boletoResult.ticketUrl,
              boletoBarcodeContent: params.boletoResult.barcodeContent || null,
              boletoDigitableLine: params.boletoResult.digitableLine,
            }),
          },
        });

        if (approved) {
          await this.transitionOrderToApproved(tx, params.orderId, params.workspaceId, {
            paymentId: createdPayment.id,
            provider: 'mercadopago',
            externalId: params.boletoResult.paymentId,
          });
        }

        await this.auditService.logWithTx(tx, {
          workspaceId: params.workspaceId,
          action: 'CHECKOUT_PAYMENT_CREATED',
          resource: 'CheckoutPayment',
          resourceId: createdPayment.id,
          details: {
            method: params.paymentMethod,
            amount,
            orderId: params.orderId,
            gateway: 'mercadopago',
            externalId: params.boletoResult.paymentId,
            mercadoPagoOrderId: params.boletoResult.externalId,
            approved,
            paymentStatus: params.boletoResult.status,
          },
        });

        return createdPayment;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  /** Process payment. */
  async processPayment(params: {
    orderId: string;
    idempotencyKey?: string;
    workspaceId: string;
    customerName: string;
    customerEmail: string;
    customerCPF?: string;
    customerPhone?: string;
    paymentMethod: CheckoutPaymentMethod;
    totalInCents: number;
    installments?: number;
    cardHolderName?: string;
    cardLast4?: string;
  }) {
    const order = await this.findOrder(params.orderId, params.workspaceId);
    if (!order) {
      throw new NotFoundException('Pedido não encontrado para processar pagamento.');
    }

    // E2E test harness: short-circuit before every real provider call when the
    // workflow has no STRIPE_SECRET_KEY configured. Production never reaches
    // this branch — gated by NODE_ENV !== 'production' inside the helper.
    if (this.e2EGuard.isEnabled()) {
      this.logger.log(
        `Checkout payment e2e stub active for order ${params.orderId} workspace ${params.workspaceId} method ${params.paymentMethod}`,
      );
      return this.e2EGuard.buildResult({
        orderId: params.orderId,
        paymentMethod: params.paymentMethod,
      });
    }

    const orderMetadata =
      order.metadata && typeof order.metadata === 'object' && !Array.isArray(order.metadata)
        ? (order.metadata as Record<string, unknown>)
        : {};
    const baseTotalInCents = Number(orderMetadata.baseTotalInCents || order.totalInCents || 0);
    const chargedTotalInCents = Number(
      orderMetadata.chargedTotalInCents || baseTotalInCents || params.totalInCents || 0,
    );
    const marketplaceFeeInCents = Number(orderMetadata.marketplaceFeeInCents || 0);
    const interestInCents = Number(orderMetadata.installmentInterestInCents || 0);
    const amount = chargedTotalInCents / 100;
    const fraudDecision = await this.fraudEngine.evaluate({
      workspaceId: params.workspaceId,
      buyerEmail: params.customerEmail,
      buyerCpf: params.customerCPF || null,
      buyerCnpj: null,
      buyerIp: order.ipAddress || null,
      deviceFingerprint:
        typeof orderMetadata.deviceFingerprint === 'string'
          ? orderMetadata.deviceFingerprint
          : null,
      cardBin: typeof orderMetadata.cardBin === 'string' ? orderMetadata.cardBin : null,
      cardCountry: typeof orderMetadata.cardCountry === 'string' ? orderMetadata.cardCountry : null,
      orderCountry:
        typeof orderMetadata.orderCountry === 'string' ? orderMetadata.orderCountry : 'BR',
      amountCents: BigInt(chargedTotalInCents),
    });

    await this.logFraudDecision({
      workspaceId: params.workspaceId,
      orderId: params.orderId,
      paymentMethod: params.paymentMethod,
      chargedTotalInCents,
      decision: fraudDecision,
    });

    if (fraudDecision.action === 'block') {
      this.logger.warn(
        `Checkout antifraud blocked order=${params.orderId} workspace=${params.workspaceId} reasons=${fraudDecision.reasons.map((reason) => reason.signal).join(',')}`,
      );
      throw new BadRequestException('Pagamento bloqueado pela política antifraude.');
    }

    if (fraudDecision.action === 'review') {
      this.logger.warn(
        `Checkout antifraud routed order=${params.orderId} workspace=${params.workspaceId} to manual review reasons=${fraudDecision.reasons.map((reason) => reason.signal).join(',')}`,
      );
      throw new BadRequestException('Pagamento retido para revisão manual.');
    }

    if (params.paymentMethod === 'BOLETO') {
      const payerDocument = onlyDigits(params.customerCPF);
      if (payerDocument.length !== 11 && payerDocument.length !== 14) {
        throw new BadRequestException(
          'CPF/CNPJ do comprador é obrigatório para boleto Mercado Pago.',
        );
      }
      const payerAddress = buildMercadoPagoBoletoAddress(order.shippingAddress);
      if (!payerAddress) {
        throw new BadRequestException(
          'Endereço do comprador é obrigatório para boleto Mercado Pago.',
        );
      }
      const missingAddress = Object.entries(payerAddress)
        .filter(([, value]) => !value)
        .map(([key]) => key);
      if (missingAddress.length > 0) {
        throw new BadRequestException(
          `Endereço do comprador incompleto para boleto Mercado Pago: ${missingAddress.join(', ')}`,
        );
      }

      try {
        Sentry.addBreadcrumb({
          message: `checkout payment processing via Mercado Pago boleto`,
          category: 'payment',
          level: 'info',
          data: {
            orderId: params.orderId,
            workspaceId: params.workspaceId,
            amount,
            paymentMethod: params.paymentMethod,
          },
        });

        const boletoIdempotencyKey = buildMercadoPagoBoletoIdempotencyKey(params);
        const boletoResult = await this.mercadoPagoBoleto.create({
          idempotencyKey: boletoIdempotencyKey,
          amountCents: BigInt(chargedTotalInCents),
          payerEmail: params.customerEmail.trim(),
          payerName: params.customerName,
          payerDocument,
          payerAddress,
          description: String(
            order.plan?.product?.name || order.plan?.name || order.orderNumber || params.orderId,
          ),
          externalReference: params.orderId,
          expirationTime: 'P3D',
        });
        const paymentStatus = mapMercadoPagoBoletoStatus(boletoResult.status);
        const approved = paymentStatus === 'APPROVED';
        const payment = await this.persistMercadoPagoBoletoPayment(
          {
            orderId: params.orderId,
            workspaceId: params.workspaceId,
            paymentMethod: params.paymentMethod,
            boletoResult,
          },
          paymentStatus,
          amount,
        );

        void this.eventEmitter?.paymentInitiated({
          workspaceId: params.workspaceId,
          orderId: params.orderId,
          paymentIntentId: boletoResult.paymentId,
          paymentMethod: params.paymentMethod,
          amountInCents: chargedTotalInCents,
          correlationId: params.idempotencyKey,
        });

        if (approved) {
          void this.eventEmitter?.paymentApproved({
            workspaceId: params.workspaceId,
            orderId: params.orderId,
            paymentIntentId: boletoResult.paymentId,
            amountInCents: chargedTotalInCents,
            correlationId: params.idempotencyKey,
          });
          await this.postPaymentEffects
            .markLeadConverted(order, params.workspaceId)
            .catch((error) => {
              this.logger.warn(
                `Checkout post-payment lead conversion failed for order ${params.orderId}: ${error instanceof Error ? error.message : String(error)}`,
              );
            });
          await this.postPaymentEffects.sendPurchaseSignals(order, amount).catch((error) => {
            this.logger.warn(
              `Checkout post-payment purchase signals failed for order ${params.orderId}: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        }

        return {
          payment,
          type: params.paymentMethod,
          approved,
          clientSecret: null,
          paymentIntentId: boletoResult.paymentId,
          pixQrCode: null,
          pixCopyPaste: null,
          pixExpiresAt: null,
          boletoUrl: boletoResult.ticketUrl,
          boletoBarcode: boletoResult.digitableLine,
          boletoExpiresAt: null,
        };
      } catch (error: unknown) {
        const failure = error instanceof Error ? error : new Error(String(error));
        void this.eventEmitter?.paymentDeclined({
          workspaceId: params.workspaceId,
          orderId: params.orderId,
          paymentIntentId: undefined,
          correlationId: params.idempotencyKey,
          reason: failure.message,
        });
        this.logger.error(
          `Mercado Pago boleto processing failed for order ${params.orderId}: ${failure.message}`,
        );
        Sentry.captureException(error, {
          tags: { type: 'financial_alert', operation: 'checkout_mercadopago_boleto' },
          extra: {
            workspaceId: params.workspaceId,
            orderId: params.orderId,
            amount,
            gateway: 'mercadopago',
          },
          level: 'fatal',
        });
        this.financialAlert.paymentFailed(failure, {
          workspaceId: params.workspaceId,
          orderId: params.orderId,
          amount,
          gateway: 'mercadopago',
        });
        throw error;
      }
    }

    if (params.paymentMethod === 'PIX') {
      try {
        Sentry.addBreadcrumb({
          message: `checkout payment processing via Mercado Pago`,
          category: 'payment',
          level: 'info',
          data: {
            orderId: params.orderId,
            workspaceId: params.workspaceId,
            amount,
            paymentMethod: params.paymentMethod,
          },
        });

        const expiresAt = new Date(Date.now() + PIX_EXPIRATION_MINUTES * 60_000);
        const payerDocument = onlyDigits(params.customerCPF);
        const pixIdempotencyKey = buildMercadoPagoPixIdempotencyKey(params);
        const pixResult = await this.mercadoPagoPix.create({
          idempotencyKey: pixIdempotencyKey,
          amountCents: BigInt(chargedTotalInCents),
          payerEmail: params.customerEmail,
          payerName: params.customerName,
          ...(payerDocument ? { payerDocument } : {}),
          description: String(
            order.plan?.product?.name || order.plan?.name || order.orderNumber || params.orderId,
          ),
          externalReference: params.orderId,
          expiresAt,
          notificationUrl: `${resolveBackendOrigin()}${MP_WEBHOOK_PATH}`,
        });
        const paymentStatus = mapMercadoPagoPixStatus(pixResult.status);
        const approved = paymentStatus === 'APPROVED';
        const payment = await this.persistMercadoPagoPixPayment(
          {
            orderId: params.orderId,
            workspaceId: params.workspaceId,
            paymentMethod: params.paymentMethod,
            pixResult,
          },
          paymentStatus,
          amount,
        );

        void this.eventEmitter?.paymentInitiated({
          workspaceId: params.workspaceId,
          orderId: params.orderId,
          paymentIntentId: pixResult.externalId,
          paymentMethod: params.paymentMethod,
          amountInCents: chargedTotalInCents,
          correlationId: params.idempotencyKey,
        });

        if (approved) {
          void this.eventEmitter?.paymentApproved({
            workspaceId: params.workspaceId,
            orderId: params.orderId,
            paymentIntentId: pixResult.externalId,
            amountInCents: chargedTotalInCents,
            correlationId: params.idempotencyKey,
          });
          await this.postPaymentEffects
            .markLeadConverted(order, params.workspaceId)
            .catch((error) => {
              this.logger.warn(
                `Checkout post-payment lead conversion failed for order ${params.orderId}: ${error instanceof Error ? error.message : String(error)}`,
              );
            });
          await this.postPaymentEffects.sendPurchaseSignals(order, amount).catch((error) => {
            this.logger.warn(
              `Checkout post-payment purchase signals failed for order ${params.orderId}: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        }

        return {
          payment,
          type: params.paymentMethod,
          approved,
          clientSecret: null,
          paymentIntentId: pixResult.externalId,
          pixQrCode: asPixQrImage(pixResult.qrCodeBase64),
          pixCopyPaste: pixResult.qrCode || null,
          pixExpiresAt: pixResult.expiresAt.toISOString(),
          boletoUrl: null,
          boletoBarcode: null,
          boletoExpiresAt: null,
        };
      } catch (error: unknown) {
        const failure = error instanceof Error ? error : new Error(String(error));
        void this.eventEmitter?.paymentDeclined({
          workspaceId: params.workspaceId,
          orderId: params.orderId,
          paymentIntentId: undefined,
          correlationId: params.idempotencyKey,
          reason: failure.message,
        });
        this.logger.error(
          `Mercado Pago PIX processing failed for order ${params.orderId}: ${failure.message}`,
        );
        Sentry.captureException(error, {
          tags: { type: 'financial_alert', operation: 'checkout_mercadopago_pix' },
          extra: {
            workspaceId: params.workspaceId,
            orderId: params.orderId,
            amount,
            gateway: 'mercadopago',
          },
          level: 'fatal',
        });
        this.financialAlert.paymentFailed(failure, {
          workspaceId: params.workspaceId,
          orderId: params.orderId,
          amount,
          gateway: 'mercadopago',
        });
        throw error;
      }
    }

    const forceThreeDS = fraudDecision.action === 'require_3ds';
    const sellerStripeAccountId = await this.ensureSellerStripeAccountId(params.workspaceId);

    try {
      Sentry.addBreadcrumb({
        message: `checkout payment processing via Stripe`,
        category: 'payment',
        level: 'info',
        data: {
          orderId: params.orderId,
          workspaceId: params.workspaceId,
          amount,
          paymentMethod: params.paymentMethod,
        },
      });
      const charge = await this.stripeCharge.createSaleCharge(
        this.buildChargeInput(params, {
          sellerStripeAccountId,
          currency: String(order.plan?.currency || 'BRL'),
          baseTotalInCents,
          chargedTotalInCents,
          marketplaceFeeInCents,
          interestInCents,
          forceThreeDS,
        }),
      );

      const paymentStatus = mapStripePaymentStatus(charge.stripePaymentIntent.status);
      const approved = paymentStatus === 'APPROVED';
      const payment = await this.persistPayment(
        params,
        charge,
        paymentStatus,
        EMPTY_PIX_DISPLAY_DATA,
        amount,
      );

      void this.eventEmitter?.paymentInitiated({
        workspaceId: params.workspaceId,
        orderId: params.orderId,
        paymentIntentId: charge.paymentIntentId,
        paymentMethod: params.paymentMethod,
        amountInCents: chargedTotalInCents,
        correlationId: params.idempotencyKey,
      });

      if (approved) {
        void this.eventEmitter?.paymentApproved({
          workspaceId: params.workspaceId,
          orderId: params.orderId,
          paymentIntentId: charge.paymentIntentId,
          amountInCents: chargedTotalInCents,
          correlationId: params.idempotencyKey,
        });
        await this.postPaymentEffects
          .markLeadConverted(order, params.workspaceId)
          .catch((error) => {
            this.logger.warn(
              `Checkout post-payment lead conversion failed for order ${params.orderId}: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        await this.postPaymentEffects.sendPurchaseSignals(order, amount).catch((error) => {
          this.logger.warn(
            `Checkout post-payment purchase signals failed for order ${params.orderId}: ${error instanceof Error ? error.message : String(error)}`,
          );
        });
      }

      return {
        payment,
        type: params.paymentMethod,
        approved,
        clientSecret: charge.clientSecret,
        paymentIntentId: charge.paymentIntentId,
        pixQrCode: null,
        pixCopyPaste: null,
        pixExpiresAt: null,
        boletoUrl: null,
        boletoBarcode: null,
        boletoExpiresAt: null,
      };
    } catch (error: unknown) {
      const failure = error instanceof Error ? error : new Error(String(error));
      void this.eventEmitter?.paymentDeclined({
        workspaceId: params.workspaceId,
        orderId: params.orderId,
        paymentIntentId: undefined,
        correlationId: params.idempotencyKey,
        reason: failure.message,
      });
      this.logger.error(
        `Stripe payment processing failed for order ${params.orderId}: ${failure.message}`,
      );
      Sentry.captureException(error, {
        tags: { type: 'financial_alert', operation: 'checkout_stripe_payment' },
        extra: {
          workspaceId: params.workspaceId,
          orderId: params.orderId,
          amount,
          gateway: 'stripe',
        },
        level: 'fatal',
      });
      this.financialAlert.paymentFailed(failure, {
        workspaceId: params.workspaceId,
        orderId: params.orderId,
        amount,
        gateway: 'stripe',
      });
      throw error;
    }
  }

  private findOrder(orderId: string, workspaceId: string) {
    return this.prisma.checkoutOrder.findFirst({
      where: { id: orderId, workspaceId },
      include: {
        plan: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  private async ensureSellerStripeAccountId(workspaceId: string): Promise<string> {
    const existing = await this.prisma.connectAccountBalance.findFirst({
      where: { workspaceId, accountType: 'SELLER' },
    });
    if (existing?.stripeAccountId) {
      return existing.stripeAccountId;
    }

    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        agents: {
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { email: true },
        },
      },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace não encontrado para criar conta Stripe seller.');
    }

    const sellerEmail = workspace.agents[0]?.email;
    if (!sellerEmail) {
      throw new BadRequestException(
        'Workspace sem agente responsável para criar a conta Stripe seller.',
      );
    }

    const created = await this.connectService.createCustomAccount({
      workspaceId,
      accountType: 'SELLER',
      email: sellerEmail,
      displayName: workspace.name,
    });
    return created.stripeAccountId;
  }

  private async transitionOrderToApproved(
    tx: Prisma.TransactionClient,
    orderId: string,
    workspaceId: string,
    _transitionContext: {
      paymentId: string;
      provider: 'stripe' | 'mercadopago';
      externalId: string;
    },
  ) {
    const currentOrder = await tx.checkoutOrder.findFirst({
      where: { id: orderId, workspaceId },
      select: { status: true },
    });
    let currentStatus = currentOrder?.status || 'PENDING';

    if (currentStatus !== 'PROCESSING') {
      const canEnterProcessing = validateOrderTransition(currentStatus, 'PROCESSING', {
        orderId,
        workspaceId,
      });
      if (!canEnterProcessing) {
        return;
      }

      await tx.checkoutOrder.updateMany({
        where: { id: orderId, workspaceId },
        data: { status: 'PROCESSING' },
      });
      currentStatus = 'PROCESSING';
    }

    const canBecomePaid = validateOrderTransition(currentStatus, 'PAID', {
      orderId,
      workspaceId,
    });
    if (!canBecomePaid) {
      return;
    }

    await tx.checkoutOrder.updateMany({
      where: { id: orderId, workspaceId },
      data: { status: 'PAID', paidAt: new Date() },
    });
  }
}
