import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { FinancialAlertService } from '../common/financial-alert.service';
import { validatePaymentTransition } from '../common/payment-state-machine';
import { ConnectService } from '../payments/connect/connect.service';
import { FraudEngine } from '../payments/fraud/fraud.engine';
import { StripeChargeService } from '../payments/stripe/stripe-charge.service';
import { PrismaService } from '../prisma/prisma.service';

import { CheckoutPostPaymentEffectsService } from './checkout-post-payment-effects.service';

type CheckoutPaymentMethod = 'CREDIT_CARD' | 'PIX' | 'BOLETO';
type CheckoutPaymentStatus = 'APPROVED' | 'DECLINED' | 'PENDING' | 'PROCESSING' | 'CANCELED';

type PixDisplayData = {
  pixQrCode: string | null;
  pixCopyPaste: string | null;
  pixExpiresAt: string | null;
};

function mapStripePaymentStatus(status?: string | null): CheckoutPaymentStatus {
  switch (String(status || '').toLowerCase()) {
    case 'succeeded':
      return 'APPROVED';
    case 'processing':
      return 'PROCESSING';
    case 'canceled':
      return 'CANCELED';
    default:
      return 'PENDING';
  }
}

function extractPixDisplayData(paymentIntent: {
  next_action?: {
    type?: string | null;
    pix_display_qr_code?: {
      data?: string | null;
      image_url_png?: string | null;
      expires_at?: number | null;
    } | null;
  } | null;
}): PixDisplayData {
  const nextAction = paymentIntent.next_action;
  const pixAction =
    nextAction?.type === 'pix_display_qr_code' ? nextAction.pix_display_qr_code : null;

  return {
    pixQrCode: pixAction?.image_url_png || null,
    pixCopyPaste: pixAction?.data || null,
    pixExpiresAt:
      typeof pixAction?.expires_at === 'number'
        ? new Date(pixAction.expires_at * 1000).toISOString()
        : null,
  };
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_key, currentValue) =>
      typeof currentValue === 'bigint' ? currentValue.toString() : currentValue,
    ),
  ) as Prisma.InputJsonValue;
}

/** Checkout payment service. */
@Injectable()
export class CheckoutPaymentService {
  private readonly logger = new Logger(CheckoutPaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripeCharge: StripeChargeService,
    private readonly connectService: ConnectService,
    private readonly fraudEngine: FraudEngine,
    private readonly financialAlert: FinancialAlertService,
    private readonly auditService: AuditService,
    private readonly postPaymentEffects: CheckoutPostPaymentEffectsService,
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
    const isPix = params.paymentMethod === 'PIX';
    return {
      workspaceId: params.workspaceId,
      sellerStripeAccountId: opts.sellerStripeAccountId,
      buyerPaidCents: BigInt(opts.chargedTotalInCents),
      saleValueCents: BigInt(opts.baseTotalInCents),
      interestCents: BigInt(opts.interestInCents),
      marketplaceFeeCents: BigInt(opts.marketplaceFeeInCents),
      currency: opts.currency,
      idempotencyKey: params.idempotencyKey || params.orderId,
      buyerEmail: params.customerEmail,
      paymentMethodTypes: (isPix ? ['pix'] : ['card']) as ('pix' | 'card')[],
      confirm: isPix,
      paymentMethodData: isPix
        ? {
            type: 'pix' as const,
            billing_details: {
              name: params.customerName,
              email: params.customerEmail,
              phone: params.customerPhone,
            },
          }
        : undefined,
      paymentMethodOptions: isPix
        ? {
            pix: {
              expires_after_seconds: 30 * 60,
            },
          }
        : opts.forceThreeDS
          ? {
              card: {
                request_three_d_secure: 'any' as const,
              },
            }
          : undefined,
      metadata: {
        kloel_order_id: params.orderId,
        workspace_id: params.workspaceId,
      },
    };
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
    if (params.paymentMethod === 'BOLETO') {
      throw new BadRequestException(
        'Boleto ainda não está habilitado no checkout Stripe-only. Use cartão ou Pix.',
      );
    }

    const order = await this.findOrder(params.orderId, params.workspaceId);
    if (!order) {
      throw new NotFoundException('Pedido não encontrado para processar no Stripe.');
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

    const forceThreeDS =
      params.paymentMethod === 'CREDIT_CARD' && fraudDecision.action === 'require_3ds';
    const sellerStripeAccountId = await this.ensureSellerStripeAccountId(params.workspaceId);
    const amount = chargedTotalInCents / 100;

    try {
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
      const pixData =
        params.paymentMethod === 'PIX'
          ? extractPixDisplayData(charge.stripePaymentIntent)
          : { pixQrCode: null, pixCopyPaste: null, pixExpiresAt: null };

      const payment = await this.persistPayment(params, charge, paymentStatus, pixData, amount);

      if (approved) {
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
    } catch (error) {
      this.logger.error(
        `Stripe payment processing failed for order ${params.orderId}: ${error instanceof Error ? error.message : String(error)}`,
      );
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
    tx: {
      checkoutOrder: {
        findFirst: (args: unknown) => Promise<{ status: string } | null>;
        updateMany: (args: unknown) => Promise<unknown>;
      };
    },
    orderId: string,
    workspaceId: string,
    transitionContext: {
      paymentId: string;
      provider: 'stripe';
      externalId: string;
    },
  ) {
    const currentOrder = await tx.checkoutOrder.findFirst({
      where: { id: orderId, workspaceId },
      select: { status: true },
    });
    let currentStatus = currentOrder?.status || 'PENDING';

    if (currentStatus !== 'PROCESSING') {
      const canEnterProcessing = validatePaymentTransition(
        currentStatus,
        'PROCESSING',
        transitionContext,
      );
      if (!canEnterProcessing) {
        return;
      }

      await tx.checkoutOrder.updateMany({
        where: { id: orderId, workspaceId },
        data: { status: 'PROCESSING' },
      });
      currentStatus = 'PROCESSING';
    }

    const canApprove = validatePaymentTransition(currentStatus, 'APPROVED', transitionContext);
    if (!canApprove) {
      return;
    }

    await tx.checkoutOrder.updateMany({
      where: { id: orderId, workspaceId },
      data: { status: 'PAID', paidAt: new Date() },
    });
  }
}
