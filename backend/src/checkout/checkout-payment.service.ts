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
import { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import { PaymentProviderRouterService } from '../payments/provider-router/provider-router.service';
import { StripeChargeService } from '../payments/stripe/stripe-charge.service';
import { PrismaService } from '../prisma/prisma.service';

import { CheckoutPostPaymentEffectsService } from './checkout-post-payment-effects.service';
import { CheckoutEventEmitterService } from '../kloel/checkout-emitter/checkout-event-emitter.service';
import {
  BOLETO_EXPIRATION_DAYS,
  FRAUD_ACTION_AUDIT_MAP,
  MP_WEBHOOK_PATH,
  PIX_EXPIRATION_MINUTES,
  STRIPE_THREE_DS_REQUEST_ANY,
  assertCanonicalProvider,
  buildPaymentDescription,
  formatMercadoPagoQrImage,
  mapMercadoPagoPaymentStatus,
  mapStripePaymentStatus,
  normalizeBoletoAddress,
  resolveBackendOrigin,
  toJsonValue,
  toProviderPaymentMethod,
  type AuditableFraudAction,
  type CheckoutPaymentMethod,
  type CheckoutPaymentStatus,
  type PixDisplayData,
} from './checkout-payment.helpers';

type SaleChargeInput = Parameters<StripeChargeService['createSaleCharge']>[0];
type CardPaymentOptions = Extract<
  NonNullable<NonNullable<SaleChargeInput['paymentMethodOptions']>['card']>,
  object
>;
type MercadoPagoBoletoCharge = Awaited<ReturnType<MercadoPagoBoletoChargeService['create']>>;
type MercadoPagoPixCharge = Awaited<ReturnType<MercadoPagoPixChargeService['create']>>;

/** Checkout payment service. */
@Injectable()
export class CheckoutPaymentService {
  private readonly logger = StructuredLogger.from(CheckoutPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeCharge: StripeChargeService,
    private readonly mercadoPagoBoleto: MercadoPagoBoletoChargeService,
    private readonly mercadoPagoPix: MercadoPagoPixChargeService,
    private readonly providerRouter: PaymentProviderRouterService,
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

    const auditableAction: AuditableFraudAction = params.decision.action;
    await this.auditService.log({
      workspaceId: params.workspaceId,
      action: FRAUD_ACTION_AUDIT_MAP[auditableAction],
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
    const threeDsRequest = STRIPE_THREE_DS_REQUEST_ANY as NonNullable<
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
      installments?: number;
    },
    charge: MercadoPagoPixCharge,
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
          if (existingPayment.externalId === charge.externalId) {
            this.logger.log(
              `Idempotency: payment already exists for order ${params.orderId} with same Mercado Pago payment ${charge.externalId}`,
            );
            return existingPayment;
          }
          this.logger.warn(
            `Idempotency: payment exists for order ${params.orderId} but with different externalId (existing=${existingPayment.externalId}, new=${charge.externalId})`,
          );
        }

        const createdPayment = await tx.checkoutPayment.create({
          data: {
            orderId: params.orderId,
            gateway: 'mercadopago',
            externalId: charge.externalId,
            pixQrCode: pixData.pixQrCode,
            pixCopyPaste: pixData.pixCopyPaste,
            pixExpiresAt: pixData.pixExpiresAt ? new Date(pixData.pixExpiresAt) : null,
            boletoUrl: null,
            boletoBarcode: null,
            boletoExpiresAt: null,
            cardLast4: null,
            cardBrand: null,
            status: paymentStatus,
            webhookData: toJsonValue({
              provider: 'mercadopago',
              paymentMethod: 'pix',
              payment: charge.raw,
            }),
          },
        });

        if (approved) {
          await this.transitionOrderToApproved(tx, params.orderId, params.workspaceId, {
            paymentId: createdPayment.id,
            provider: 'mercadopago',
            externalId: charge.externalId,
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
            externalId: charge.externalId,
            approved,
            installments: params.installments,
            paymentStatus: charge.status,
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
      installments?: number;
    },
    charge: MercadoPagoBoletoCharge,
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
          if (existingPayment.externalId === charge.externalId) {
            this.logger.log(
              `Idempotency: payment already exists for order ${params.orderId} with same Mercado Pago boleto ${charge.externalId}`,
            );
            return existingPayment;
          }
          this.logger.warn(
            `Idempotency: payment exists for order ${params.orderId} but with different externalId (existing=${existingPayment.externalId}, new=${charge.externalId})`,
          );
        }

        const createdPayment = await tx.checkoutPayment.create({
          data: {
            orderId: params.orderId,
            gateway: 'mercadopago',
            externalId: charge.externalId,
            pixQrCode: null,
            pixCopyPaste: null,
            pixExpiresAt: null,
            boletoUrl: charge.ticketUrl,
            boletoBarcode: charge.digitableLine || charge.barcodeContent,
            boletoExpiresAt: charge.expiresAt,
            cardLast4: null,
            cardBrand: null,
            status: paymentStatus,
            webhookData: toJsonValue({
              provider: 'mercadopago',
              paymentMethod: 'boleto',
              payment: charge.raw,
            }),
          },
        });

        if (approved) {
          await this.transitionOrderToApproved(tx, params.orderId, params.workspaceId, {
            paymentId: createdPayment.id,
            provider: 'mercadopago',
            externalId: charge.externalId,
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
            externalId: charge.externalId,
            approved,
            installments: params.installments,
            paymentStatus: charge.status,
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

    // E2E test harness: short-circuit before real provider calls when the
    // workflow has no payment-provider env configured. Production never reaches
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

    const amount = chargedTotalInCents / 100;
    const providerDecision = this.providerRouter.resolve({
      method: toProviderPaymentMethod(params.paymentMethod),
    });

    if (params.paymentMethod === 'PIX') {
      assertCanonicalProvider(providerDecision, 'mercadopago', params.paymentMethod);
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

        const productName =
          typeof order.plan?.product?.name === 'string' && order.plan.product.name.trim()
            ? order.plan.product.name
            : undefined;
        const payerDocument = params.customerCPF?.replace(/\D/g, '') || undefined;
        const expiresAt = new Date(Date.now() + PIX_EXPIRATION_MINUTES * 60_000);
        const charge = await this.mercadoPagoPix.create({
          idempotencyKey: params.idempotencyKey || params.orderId,
          amountCents: BigInt(chargedTotalInCents),
          payerEmail: params.customerEmail,
          payerName: params.customerName,
          ...(payerDocument !== undefined ? { payerDocument } : {}),
          description: buildPaymentDescription(productName, params.orderId),
          externalReference: params.orderId,
          expiresAt,
          notificationUrl: `${resolveBackendOrigin()}${MP_WEBHOOK_PATH}`,
        });
        const pixData: PixDisplayData = {
          pixQrCode: formatMercadoPagoQrImage(charge.qrCodeBase64),
          pixCopyPaste: charge.qrCode || null,
          pixExpiresAt: charge.expiresAt.toISOString(),
        };
        const paymentStatus = mapMercadoPagoPaymentStatus(charge.status);
        const approved = paymentStatus === 'APPROVED';
        const payment = await this.persistMercadoPagoPixPayment(
          params,
          charge,
          paymentStatus,
          pixData,
          amount,
        );

        void this.eventEmitter?.paymentInitiated({
          workspaceId: params.workspaceId,
          orderId: params.orderId,
          paymentIntentId: charge.externalId,
          paymentMethod: params.paymentMethod,
          amountInCents: chargedTotalInCents,
          correlationId: params.idempotencyKey,
        });

        if (approved) {
          void this.eventEmitter?.paymentApproved({
            workspaceId: params.workspaceId,
            orderId: params.orderId,
            paymentIntentId: charge.externalId,
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
          paymentIntentId: charge.externalId,
          pixQrCode: pixData.pixQrCode,
          pixCopyPaste: pixData.pixCopyPaste,
          pixExpiresAt: pixData.pixExpiresAt,
          boletoUrl: null,
          boletoBarcode: null,
          boletoExpiresAt: null,
        };
      } catch (error: unknown) {
        void this.eventEmitter?.paymentDeclined({
          workspaceId: params.workspaceId,
          orderId: params.orderId,
          paymentIntentId: undefined,
          correlationId: params.idempotencyKey,
          reason: error instanceof Error ? error.message : String(error),
        });
        this.logger.error(
          `Mercado Pago PIX processing failed for order ${params.orderId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        Sentry.captureException(error, {
          tags: { type: 'financial_alert', operation: 'checkout_mercadopago_pix_payment' },
          extra: {
            workspaceId: params.workspaceId,
            orderId: params.orderId,
            amount,
            gateway: 'mercadopago',
          },
          level: 'fatal',
        });
        this.financialAlert.paymentFailed(error as Error, {
          workspaceId: params.workspaceId,
          orderId: params.orderId,
          amount,
          gateway: 'mercadopago',
        });
        throw error;
      }
    }

    if (params.paymentMethod === 'BOLETO') {
      assertCanonicalProvider(providerDecision, 'mercadopago', params.paymentMethod);
      const payerDocument = params.customerCPF?.replace(/\D/g, '') || '';
      if (!payerDocument) {
        throw new BadRequestException(
          'CPF/CNPJ do comprador é obrigatório para emitir boleto pelo Mercado Pago.',
        );
      }
      const payerAddress = normalizeBoletoAddress(order.shippingAddress);
      if (!payerAddress) {
        throw new BadRequestException(
          'Endereço completo do comprador é obrigatório para emitir boleto pelo Mercado Pago.',
        );
      }

      try {
        Sentry.addBreadcrumb({
          message: `checkout boleto payment processing via Mercado Pago`,
          category: 'payment',
          level: 'info',
          data: {
            orderId: params.orderId,
            workspaceId: params.workspaceId,
            amount,
            paymentMethod: params.paymentMethod,
          },
        });

        const productName =
          typeof order.plan?.product?.name === 'string' && order.plan.product.name.trim()
            ? order.plan.product.name
            : undefined;
        const expiresAt = new Date(Date.now() + BOLETO_EXPIRATION_DAYS * 24 * 60 * 60_000);
        const charge = await this.mercadoPagoBoleto.create({
          idempotencyKey: params.idempotencyKey || params.orderId,
          amountCents: BigInt(chargedTotalInCents),
          payerEmail: params.customerEmail,
          payerName: params.customerName,
          payerDocument,
          payerAddress,
          description: buildPaymentDescription(productName, params.orderId),
          externalReference: params.orderId,
          expiresAt,
          notificationUrl: `${resolveBackendOrigin()}${MP_WEBHOOK_PATH}`,
        });
        const paymentStatus = mapMercadoPagoPaymentStatus(charge.status);
        const approved = paymentStatus === 'APPROVED';
        const payment = await this.persistMercadoPagoBoletoPayment(
          params,
          charge,
          paymentStatus,
          amount,
        );

        void this.eventEmitter?.paymentInitiated({
          workspaceId: params.workspaceId,
          orderId: params.orderId,
          paymentIntentId: charge.externalId,
          paymentMethod: params.paymentMethod,
          amountInCents: chargedTotalInCents,
          correlationId: params.idempotencyKey,
        });

        if (approved) {
          void this.eventEmitter?.paymentApproved({
            workspaceId: params.workspaceId,
            orderId: params.orderId,
            paymentIntentId: charge.externalId,
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
          paymentIntentId: charge.externalId,
          pixQrCode: null,
          pixCopyPaste: null,
          pixExpiresAt: null,
          boletoUrl: charge.ticketUrl,
          boletoBarcode: charge.digitableLine || charge.barcodeContent,
          boletoExpiresAt: charge.expiresAt.toISOString(),
        };
      } catch (error: unknown) {
        void this.eventEmitter?.paymentDeclined({
          workspaceId: params.workspaceId,
          orderId: params.orderId,
          paymentIntentId: undefined,
          correlationId: params.idempotencyKey,
          reason: error instanceof Error ? error.message : String(error),
        });
        this.logger.error(
          `Mercado Pago boleto processing failed for order ${params.orderId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        Sentry.captureException(error, {
          tags: { type: 'financial_alert', operation: 'checkout_mercadopago_boleto_payment' },
          extra: {
            workspaceId: params.workspaceId,
            orderId: params.orderId,
            amount,
            gateway: 'mercadopago',
          },
          level: 'fatal',
        });
        this.financialAlert.paymentFailed(error as Error, {
          workspaceId: params.workspaceId,
          orderId: params.orderId,
          amount,
          gateway: 'mercadopago',
        });
        throw error;
      }
    }

    assertCanonicalProvider(providerDecision, 'stripe', params.paymentMethod);
    const forceThreeDS =
      params.paymentMethod === 'CREDIT_CARD' && fraudDecision.action === 'require_3ds';
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
      const pixData: PixDisplayData = {
        pixQrCode: null,
        pixCopyPaste: null,
        pixExpiresAt: null,
      };

      const payment = await this.persistPayment(params, charge, paymentStatus, pixData, amount);

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
        pixQrCode: pixData.pixQrCode,
        pixCopyPaste: pixData.pixCopyPaste,
        pixExpiresAt: pixData.pixExpiresAt,
        boletoUrl: null,
        boletoBarcode: null,
        boletoExpiresAt: null,
      };
    } catch (error: unknown) {
      void this.eventEmitter?.paymentDeclined({
        workspaceId: params.workspaceId,
        orderId: params.orderId,
        paymentIntentId: undefined,
        correlationId: params.idempotencyKey,
        reason: error instanceof Error ? error.message : String(error),
      });
      this.logger.error(
        `Stripe payment processing failed for order ${params.orderId}: ${error instanceof Error ? error.message : String(error)}`,
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
      this.financialAlert.paymentFailed(error as Error, {
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
