import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { CheckoutPaymentE2EGuard, CHECKOUT_PAYMENT_E2E_GUARD } from './checkout-payment-e2e-guard';
import { FinancialAlertService } from '../common/financial-alert.service';
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
  assertCanonicalProvider,
  buildCheckoutPaymentCreatedAuditPayload,
  buildMercadoPagoBoletoPaymentData,
  buildMercadoPagoPixPaymentData,
  buildStripePaymentData,
  enforceCheckoutFraudGate,
  extractOrderMetadataView,
  logCheckoutFraudDecision,
  resolveExistingCheckoutPaymentForIdempotency,
  toProviderPaymentMethod,
  transitionCheckoutOrderToApproved,
  type CheckoutPaymentMethod,
  type CheckoutPaymentStatus,
  type PixDisplayData,
} from './checkout-payment.helpers';
import {
  runCheckoutBoletoArm,
  runCheckoutPixArm,
  runCheckoutStripeArm,
  type CheckoutPaymentArmDeps,
} from './checkout-payment.arms';

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

  /**
   * Shared persistence kernel for the three payment-method arms (Stripe card,
   * Mercado Pago PIX, Mercado Pago boleto). Runs inside an isolated `ReadCommitted`
   * transaction and performs four steps:
   *   1. Idempotency check — return the existing payment when externalId matches.
   *   2. Create the `checkoutPayment` row from the caller-supplied `data` block.
   *   3. When approved, transition the order to PAID.
   *   4. Emit the `CHECKOUT_PAYMENT_CREATED` audit log.
   *
   * The caller owns the per-arm `data` payload (gateway, externalId, pix/boleto
   * fields, webhookData) — this kernel never touches money fields and never mutates
   * provider-specific values. Money path preserved.
   */
  private async runPersistPaymentTx(input: {
    params: {
      orderId: string;
      workspaceId: string;
      paymentMethod: CheckoutPaymentMethod;
      installments?: number;
    };
    externalId: string;
    chargeLabel: string;
    provider: 'stripe' | 'mercadopago';
    providerPaymentStatus: string;
    paymentStatus: CheckoutPaymentStatus;
    amount: number;
    data: Prisma.CheckoutPaymentUncheckedCreateInput;
  }) {
    const approved = input.paymentStatus === 'APPROVED';
    return this.prisma.$transaction(
      async (tx) => {
        const idempotent = await resolveExistingCheckoutPaymentForIdempotency(
          tx,
          this.logger,
          input.params.orderId,
          input.externalId,
          input.chargeLabel,
        );
        if (idempotent) {
          return idempotent;
        }

        const createdPayment = await tx.checkoutPayment.create({ data: input.data });

        if (approved) {
          await transitionCheckoutOrderToApproved(
            tx,
            input.params.orderId,
            input.params.workspaceId,
          );
        }

        await this.auditService.logWithTx(
          tx,
          buildCheckoutPaymentCreatedAuditPayload({
            workspaceId: input.params.workspaceId,
            paymentId: createdPayment.id,
            paymentMethod: input.params.paymentMethod,
            amount: input.amount,
            orderId: input.params.orderId,
            gateway: input.provider,
            externalId: input.externalId,
            approved,
            installments: input.params.installments,
            providerPaymentStatus: input.providerPaymentStatus,
          }),
        );

        return createdPayment;
      },
      { isolationLevel: 'ReadCommitted' },
    );
  }

  private persistPayment(
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
    return this.runPersistPaymentTx({
      params,
      externalId: charge.paymentIntentId,
      chargeLabel: 'PaymentIntent',
      provider: 'stripe',
      providerPaymentStatus: charge.stripePaymentIntent.status,
      paymentStatus,
      amount,
      data: buildStripePaymentData({
        orderId: params.orderId,
        cardLast4: params.cardLast4 || null,
        status: paymentStatus,
        pixData,
        charge,
      }),
    });
  }

  private persistMercadoPagoPixPayment(
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
    return this.runPersistPaymentTx({
      params,
      externalId: charge.externalId,
      chargeLabel: 'Mercado Pago payment',
      provider: 'mercadopago',
      providerPaymentStatus: charge.status,
      paymentStatus,
      amount,
      data: buildMercadoPagoPixPaymentData({
        orderId: params.orderId,
        status: paymentStatus,
        pixData,
        charge,
      }),
    });
  }

  private persistMercadoPagoBoletoPayment(
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
    return this.runPersistPaymentTx({
      params,
      externalId: charge.externalId,
      chargeLabel: 'Mercado Pago boleto',
      provider: 'mercadopago',
      providerPaymentStatus: charge.status,
      paymentStatus,
      amount,
      data: buildMercadoPagoBoletoPaymentData({
        orderId: params.orderId,
        status: paymentStatus,
        charge,
      }),
    });
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

    const metadataView = extractOrderMetadataView(
      order.metadata,
      order.totalInCents,
      params.totalInCents,
    );
    const { baseTotalInCents, chargedTotalInCents, marketplaceFeeInCents, interestInCents } =
      metadataView;
    const fraudDecision = await this.fraudEngine.evaluate({
      workspaceId: params.workspaceId,
      buyerEmail: params.customerEmail,
      buyerCpf: params.customerCPF || null,
      buyerCnpj: null,
      buyerIp: order.ipAddress || null,
      deviceFingerprint: metadataView.deviceFingerprint,
      cardBin: metadataView.cardBin,
      cardCountry: metadataView.cardCountry,
      orderCountry: metadataView.orderCountry,
      amountCents: BigInt(chargedTotalInCents),
    });

    await logCheckoutFraudDecision(this.auditService, {
      workspaceId: params.workspaceId,
      orderId: params.orderId,
      paymentMethod: params.paymentMethod,
      chargedTotalInCents,
      decision: fraudDecision,
    });

    enforceCheckoutFraudGate({
      logger: this.logger,
      decision: fraudDecision,
      orderId: params.orderId,
      workspaceId: params.workspaceId,
      throwBadRequest: (message) => {
        throw new BadRequestException(message);
      },
    });

    const amount = chargedTotalInCents / 100;
    const providerDecision = this.providerRouter.resolve({
      method: toProviderPaymentMethod(params.paymentMethod),
    });

    const armDeps: CheckoutPaymentArmDeps = {
      logger: this.logger,
      eventEmitter: this.eventEmitter,
      postPaymentEffects: this.postPaymentEffects,
      financialAlert: this.financialAlert,
      mercadoPagoPix: this.mercadoPagoPix,
      mercadoPagoBoleto: this.mercadoPagoBoleto,
      stripeCharge: this.stripeCharge,
    };

    if (params.paymentMethod === 'PIX') {
      assertCanonicalProvider(providerDecision, 'mercadopago', params.paymentMethod);
      return runCheckoutPixArm({
        deps: armDeps,
        params,
        order,
        amount,
        chargedTotalInCents,
        persist: (charge, paymentStatus, pixData, persistAmount) =>
          this.persistMercadoPagoPixPayment(params, charge, paymentStatus, pixData, persistAmount),
      });
    }

    if (params.paymentMethod === 'BOLETO') {
      assertCanonicalProvider(providerDecision, 'mercadopago', params.paymentMethod);
      return runCheckoutBoletoArm({
        deps: armDeps,
        params,
        order,
        amount,
        chargedTotalInCents,
        persist: (charge, paymentStatus, persistAmount) =>
          this.persistMercadoPagoBoletoPayment(params, charge, paymentStatus, persistAmount),
      });
    }

    assertCanonicalProvider(providerDecision, 'stripe', params.paymentMethod);
    const forceThreeDS =
      params.paymentMethod === 'CREDIT_CARD' && fraudDecision.action === 'require_3ds';
    const sellerStripeAccountId = await this.ensureSellerStripeAccountId(params.workspaceId);
    return runCheckoutStripeArm({
      deps: armDeps,
      params,
      order,
      amount,
      money: {
        sellerStripeAccountId,
        baseTotalInCents,
        chargedTotalInCents,
        marketplaceFeeInCents,
        interestInCents,
        forceThreeDS,
      },
      persist: (charge, paymentStatus, pixData, persistAmount) =>
        this.persistPayment(params, charge, paymentStatus, pixData, persistAmount),
    });
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
}
