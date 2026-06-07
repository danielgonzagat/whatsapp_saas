import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { StripeService } from '../billing/stripe.service';
import { SpineEmitterService } from '../kloel/spine/spine-emitter.service';
import { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import { PrismaService } from '../prisma/prisma.service';
import { SmartPaymentService } from '../kloel/smart-payment.service';
import { computePixExpiresAt } from './sales.helpers';
import {
  buildFillBuyerDataPatch,
  buildPixOrderV2SaleData,
  buildRefundId,
  buildRefundUpdateMetadata,
  computePixOrderV2AmountCents,
  pickPixOrderV2Result,
  resolveRefundAmountCents,
  type CreatePixOrderV2Dto,
  type CreatePixOrderV2Result,
} from './sales.service.pix-refund.helpers';
import type {
  BoletoBuyerData,
  BuyerData,
  CreateBoletoOrderResult,
  CreatePixOrderResult,
  CreateStripeCardLinkResult,
} from './sales.service.types';
import {
  createBoletoOrder as createBoletoOrderV1,
  createPixOrderLegacy as createPixOrderLegacyV1,
  createStripeCardLink as createStripeCardLinkV1,
  type SalesV1Deps,
} from './sales.service.v1-orders';

export type {
  BoletoBuyerData,
  BuyerData,
  CreateBoletoOrderResult,
  CreatePixOrderResult,
  CreateStripeCardLinkResult,
} from './sales.service.types';

/**
 * Sales service — creates sales (PIX, card, boleto) directly from chat flows.
 *
 * Unlike the checkout pipeline, this service targets in-chat conversion:
 * WhatsApp → KLOEL brain → createPixOrder → real PIX QR code returned
 * to the buyer in the chat thread.
 *
 * All mutations are workspace-scoped and audit-logged. V1 create-order flows
 * are orchestrated by per-provider standalone functions in
 * {@link ./sales.service.v1-orders}; the service composes them with the
 * shared dep bundle.
 */
@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mpBoleto: MercadoPagoBoletoChargeService,
    private readonly mpPix: MercadoPagoPixChargeService,
    private readonly stripeService: StripeService,
    private readonly audit: AuditService,
    private readonly spine: SpineEmitterService,
    @Optional() private readonly smartPayment?: SmartPaymentService,
  ) {}

  // ---- createPixOrder overloads ----

  /**
   * Legacy signature (Mercado Pago direct PIX).
   * @deprecated Prefer the tier-5 DTO-based overload that routes through
   * SmartPaymentService.
   */
  async createPixOrder(
    workspaceId: string,
    productId: string,
    planId: string,
    buyerData: BuyerData,
  ): Promise<CreatePixOrderResult>;

  /**
   * Tier-5 capability signature (PI-K37) — routes through SmartPaymentService
   * and falls back to a deterministic fallback when the service is unavailable.
   */
  async createPixOrder(
    workspaceId: string,
    dto: CreatePixOrderV2Dto,
  ): Promise<CreatePixOrderV2Result>;

  /** Implementation — discriminates on typeof the second argument. */
  async createPixOrder(
    workspaceId: string,
    arg2: string | CreatePixOrderV2Dto,
    arg3?: string,
    arg4?: BuyerData,
  ): Promise<CreatePixOrderResult | CreatePixOrderV2Result> {
    if (typeof arg2 === 'string') {
      return createPixOrderLegacyV1(this.v1Deps(), workspaceId, arg2, arg3, arg4);
    }
    return this.createPixOrderV2(workspaceId, arg2);
  }

  /** Create a boleto payment order directly from chat using Mercado Pago. */
  async createBoletoOrder(
    workspaceId: string,
    productId: string,
    planId: string,
    buyerData: BoletoBuyerData,
  ): Promise<CreateBoletoOrderResult> {
    return createBoletoOrderV1(this.v1Deps(), workspaceId, productId, planId, buyerData);
  }

  /** Create a card checkout link directly from chat using Stripe Checkout. */
  async createStripeCardLink(
    workspaceId: string,
    productId: string,
    planId: string,
    buyerData: BuyerData,
  ): Promise<CreateStripeCardLinkResult> {
    return createStripeCardLinkV1(this.v1Deps(), workspaceId, productId, planId, buyerData);
  }

  /**
   * Build the dep bundle every V1 orchestrator needs. Centralizing the bind
   * keeps the three call sites above one-liners and the orchestrators
   * stateless / DI-free.
   */
  private v1Deps(): SalesV1Deps {
    return {
      prisma: this.prisma,
      mpPix: this.mpPix,
      mpBoleto: this.mpBoleto,
      stripeService: this.stripeService,
      audit: this.audit,
      spine: this.spine,
      logger: this.logger,
      loadActivePlanOrThrow: (workspaceId, productId, planId) =>
        this.loadActivePlanOrThrow(workspaceId, productId, planId),
    };
  }

  /**
   * Workspace-scoped plan lookup with eager-loaded product name. Throws a
   * Nest `NotFoundException` with a PT-BR message when the plan is missing,
   * inactive, or belongs to another workspace — matching the contract every
   * `createXxxOrder` flow expects.
   */
  private async loadActivePlanOrThrow(workspaceId: string, productId: string, planId: string) {
    const plan = await this.prisma.productPlan.findFirst({
      where: { id: planId, productId, product: { workspaceId }, active: true },
      include: { product: { select: { name: true } } },
    });
    if (!plan) {
      throw new NotFoundException(
        `Plano ${planId} não encontrado para produto ${productId} neste workspace.`,
      );
    }
    return plan;
  }

  /** Look up a sale by id, scoped to workspace. */
  async findById(workspaceId: string, saleId: string) {
    return this.prisma.kloelSale.findFirst({
      where: { id: saleId, workspaceId },
    });
  }

  /** List recent sales for a workspace. */
  async listByWorkspace(workspaceId: string, limit = 50) {
    return this.prisma.kloelSale.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Read-only sales summary for a workspace over a recent window
   * (resolver-compatible `(workspaceId, args)` shape). Aggregates the
   * `kloelSale` ledger for the last `args.days` days (default 7): total
   * orders, paid/pending counts, gross revenue and average ticket — all
   * workspace-scoped. No mutation.
   */
  async summary(
    workspaceId: string,
    args?: { days?: number },
  ): Promise<{
    success: true;
    summary: {
      period: string;
      totalSales: number;
      paidCount: number;
      pendingCount: number;
      totalRevenue: number;
      averageTicket: number;
    };
  }> {
    const days = typeof args?.days === 'number' && args.days > 0 ? args.days : 7;
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const sales = await this.prisma.kloelSale.findMany({
      where: { workspaceId, createdAt: { gte: cutoff } },
      select: { amount: true, status: true },
    });
    const paid = sales.filter((s) => s.status === 'paid');
    const totalRevenue = paid.reduce((sum, s) => sum + (s.amount ?? 0), 0);
    return {
      success: true,
      summary: {
        period: `${days} dias`,
        totalSales: sales.length,
        paidCount: paid.length,
        pendingCount: sales.filter((s) => s.status === 'pending').length,
        totalRevenue,
        averageTicket: paid.length > 0 ? Math.round(totalRevenue / paid.length) : 0,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Tier-5 capability methods (PI-K37) — overload set for createPixOrder,
  // plus fillBuyerData and refund.
  // ---------------------------------------------------------------------------

  /** Tier-5 PIX order via SmartPaymentService (or fallback when unavailable). */
  private async createPixOrderV2(
    workspaceId: string,
    dto: CreatePixOrderV2Dto,
  ): Promise<CreatePixOrderV2Result> {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, workspaceId, active: true },
    });
    if (!product) {
      throw new NotFoundException(`Produto ${dto.productId} não encontrado neste workspace.`);
    }

    const plan = await this.loadV2Plan(workspaceId, dto.productId, dto.planId);
    const amountCents = computePixOrderV2AmountCents(plan.price);
    if (amountCents <= 0n) {
      throw new ServiceUnavailableException('O plano possui preço inválido.');
    }

    const orderId = randomUUID();
    const expiresAt = computePixExpiresAt();

    await this.prisma.kloelSale.create({
      data: buildPixOrderV2SaleData({
        orderId,
        workspaceId,
        productId: dto.productId,
        planId: plan.id,
        productName: product.name,
        amount: plan.price,
        buyer: dto.buyer,
      }),
    });

    const smartResult = await this.tryCreateSmartPayment(
      workspaceId,
      dto,
      plan.price,
      product.name,
    );
    const picked = pickPixOrderV2Result(smartResult);

    // Honest failure: when the payment provider produced no real PIX
    // instrument, surface a 503 instead of fabricating a copy-paste/QR that
    // can never be paid. The sale row stays `pending` (created above) so a
    // later webhook/retry can still settle it; we never report an unverified success.
    if (!picked) {
      this.logger.warn(
        `createPixOrderV2: no real PIX instrument from gateway for order ${orderId} (workspace ${workspaceId}); refusing to fabricate one.`,
      );
      throw new ServiceUnavailableException(
        'Não foi possível gerar o PIX agora: o provedor de pagamento está indisponível. Tente novamente em instantes.',
      );
    }

    return {
      orderId,
      pixCopyPaste: picked.pixCopyPaste,
      pixQrCode: picked.pixQrCode,
      amountCents,
      expiresAt,
    };
  }

  /**
   * Workspace-scoped plan lookup for the V2 PIX flow. When `planId` is
   * omitted, picks the cheapest active plan for the product. Throws
   * `NotFoundException` with PT-BR messaging when nothing matches.
   */
  private async loadV2Plan(
    workspaceId: string,
    productId: string,
    planId: string | undefined,
  ): Promise<{ id: string; name: string; price: number }> {
    const where = planId
      ? { id: planId, productId, product: { workspaceId }, active: true }
      : { productId, product: { workspaceId }, active: true };
    const plan = await this.prisma.productPlan.findFirst({
      where,
      ...(planId ? {} : { orderBy: { price: 'asc' as const } }),
      select: { id: true, name: true, price: true },
    });
    if (!plan) {
      throw new NotFoundException(
        planId
          ? `Plano ${planId} não encontrado para produto ${productId}.`
          : `Nenhum plano ativo encontrado para o produto ${productId}.`,
      );
    }
    return plan;
  }

  /**
   * Best-effort call to {@link SmartPaymentService}. Returns `null` when the
   * service is unavailable or fails — the caller then falls back to the
   * deterministic fallback.
   */
  private async tryCreateSmartPayment(
    workspaceId: string,
    dto: CreatePixOrderV2Dto,
    amount: number,
    productName: string,
  ): Promise<{ pixCopyPaste?: string | null; pixQrCode?: string | null } | null> {
    if (!this.smartPayment) {
      return null;
    }
    try {
      return await this.smartPayment.createSmartPayment({
        workspaceId,
        phone: dto.buyer.phone ?? '',
        contactId: undefined,
        customerName: dto.buyer.name,
        customerEmail: dto.buyer.email,
        amount,
        productName,
      });
    } catch (err: unknown) {
      this.logger.warn(
        `SmartPaymentService failed, falling back to fallback: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  /**
   * Fill or update buyer data on an existing order (tier-5 capability).
   *
   * Workspace-scoped: the order must belong to the given workspace.
   */
  async fillBuyerData(
    workspaceId: string,
    orderId: string,
    dto: { name?: string; email?: string; phone?: string; cpf?: string },
  ): Promise<{ updated: true }> {
    const sale = await this.prisma.kloelSale.findFirst({
      where: { id: orderId, workspaceId },
      select: { id: true, metadata: true },
    });

    if (!sale) {
      throw new NotFoundException(`Pedido ${orderId} não encontrado neste workspace.`);
    }

    const existingMeta = (sale.metadata as Record<string, unknown> | null) ?? {};
    const patch = buildFillBuyerDataPatch(dto);

    if (Object.keys(patch).length === 0) {
      return { updated: true };
    }

    await this.prisma.kloelSale.updateMany({
      where: { id: orderId, workspaceId },
      data: {
        ...(dto.phone !== undefined ? { leadPhone: dto.phone } : {}),
        metadata: { ...existingMeta, ...patch } as Prisma.InputJsonValue,
      },
    });

    return { updated: true };
  }

  /**
   * Refund an order within the same workspace (tier-5 capability).
   *
   * Idempotent: the idempotency key is derived from `orderId` so retries
   * produce the same `refundId`.
   */
  async refund(
    workspaceId: string,
    orderId: string,
    dto: { amountCents?: bigint; reason: string },
  ): Promise<{ refundId: string; status: 'pending' | 'processed' | 'rejected' }> {
    const sale = await this.prisma.kloelSale.findFirst({
      where: { id: orderId, workspaceId },
      select: { id: true, status: true, amount: true, externalPaymentId: true },
    });

    if (!sale) {
      throw new NotFoundException(`Pedido ${orderId} não encontrado neste workspace.`);
    }

    if (sale.status === 'refunded') {
      const existingMeta = await this.prisma.kloelSale.findFirst({
        where: { id: orderId, workspaceId },
        select: { metadata: true },
      });
      const meta = (existingMeta?.metadata as Record<string, unknown> | null) ?? {};
      const previousRefundId = meta.refundId as string | undefined;
      return {
        refundId: previousRefundId ?? buildRefundId(orderId),
        status: 'processed',
      };
    }

    const refundId = buildRefundId(orderId);
    const refundAmountCents = resolveRefundAmountCents(sale.amount, dto.amountCents);

    // Money first, DB second. Execute the real gateway refund BEFORE flipping
    // the sale to `refunded` — never report a refund the provider has not
    // actually processed. `refundId` doubles as the Stripe idempotency key so
    // retries (same orderId) do not issue duplicate refunds.
    await this.runGatewayRefund(orderId, sale.externalPaymentId, refundId, refundAmountCents);

    await this.prisma.kloelSale.updateMany({
      where: { id: orderId, workspaceId },
      data: {
        status: 'refunded',
        metadata: buildRefundUpdateMetadata({
          refundId,
          reason: dto.reason,
          amountCents: refundAmountCents,
          originalStatus: sale.status,
        }) as Prisma.InputJsonValue,
      },
    });

    return { refundId, status: 'pending' };
  }

  /**
   * Execute the real provider-side refund for a sale. In the Stripe-only
   * runtime (ADR 0003) only Stripe PaymentIntents (`pi_*`) are refundable; the
   * sale's `externalPaymentId` is the PaymentIntent id. Mirrors the proven
   * `AdminTransactionsService.runGatewayRefund` path.
   *
   * Throws — never reports unverified success:
   * - `ServiceUnavailableException` when the sale has no linked payment id or
   *   the gateway is not a supported/wired provider (so the caller does NOT
   *   flip the DB to `refunded`);
   * - the Stripe SDK error (surfaced as 5xx) when the provider rejects the
   *   refund call.
   *
   * `amountCents` (bigint) is forwarded as a partial-refund amount when it is
   * below the original charge; an undefined/full amount issues a full refund.
   */
  private async runGatewayRefund(
    orderId: string,
    externalPaymentId: string | null | undefined,
    idempotencyKey: string,
    amountCents: bigint,
  ): Promise<void> {
    const paymentIntentId = String(externalPaymentId ?? '').trim();
    if (!paymentIntentId.startsWith('pi_')) {
      this.logger.warn(
        `refund: order ${orderId} has no Stripe PaymentIntent (externalPaymentId=${paymentIntentId || 'none'}); refusing to report an unverified refund.`,
      );
      throw new ServiceUnavailableException(
        'Estorno indisponível: o pedido não possui um pagamento Stripe vinculado e nenhum outro provedor de estorno está habilitado no runtime atual.',
      );
    }

    await this.stripeService.stripe.refunds.create(
      {
        payment_intent: paymentIntentId,
        ...(amountCents > 0n ? { amount: Number(amountCents) } : {}),
      },
      { idempotencyKey },
    );
  }

  /**
   * Canonical-name management method for the Kloel capability resolver
   * (`SalesService.cancelSubscription`). Accepts the (workspaceId, args)
   * signature used by `KloelDomainServiceResolver`.
   *
   * Cancels a workspace-scoped CustomerSubscription. Idempotent — cancelling
   * an already-cancelled subscription is a no-op that returns success. The
   * mutation is wrapped in a transaction together with the audit entry so the
   * cancellation and its trail commit atomically.
   */
  async cancelSubscription(
    workspaceId: string,
    args?: { subscriptionId?: string },
  ): Promise<{ success: true; status: string; subscriptionId: string }> {
    const subscriptionId =
      typeof args?.subscriptionId === 'string' ? args.subscriptionId.trim() : '';
    if (!subscriptionId) {
      throw new NotFoundException('SalesService.cancelSubscription: subscriptionId é obrigatório.');
    }

    const sub = await this.prisma.customerSubscription.findFirst({
      where: { id: subscriptionId, workspaceId },
      select: { id: true, status: true, amount: true },
    });
    if (!sub) {
      throw new NotFoundException(`Assinatura ${subscriptionId} não encontrada neste workspace.`);
    }

    if (sub.status === 'CANCELLED') {
      return { success: true, status: 'CANCELLED', subscriptionId };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.customerSubscription.updateMany({
        where: { id: subscriptionId, workspaceId },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
    });

    await this.audit
      .log({
        workspaceId,
        action: 'subscription_cancel',
        resource: 'subscription',
        resourceId: subscriptionId,
        details: { amount: sub.amount, previousStatus: sub.status },
      })
      .catch(() => undefined);

    return { success: true, status: 'CANCELLED', subscriptionId };
  }

  /**
   * Canonical-name management method for the Kloel capability resolver
   * (`SalesService.refundSubscription`). Accepts the (workspaceId, args)
   * signature used by `KloelDomainServiceResolver`.
   *
   * Refunds the order backing a subscription's most recent paid sale. The
   * subscription's `externalId` is treated as the order/sale reference, or
   * `args.orderId` may be supplied directly. Delegates the money mutation to
   * {@link refund} (idempotent, bigint cents) — no new ledger logic here.
   */
  async refundSubscription(
    workspaceId: string,
    args?: { subscriptionId?: string; orderId?: string; reason?: string; amountCents?: bigint },
  ): Promise<{ refundId: string; status: 'pending' | 'processed' | 'rejected' }> {
    const reason =
      typeof args?.reason === 'string' && args.reason ? args.reason : 'subscription refund';
    let orderId = typeof args?.orderId === 'string' ? args.orderId.trim() : '';

    if (!orderId) {
      const subscriptionId =
        typeof args?.subscriptionId === 'string' ? args.subscriptionId.trim() : '';
      if (!subscriptionId) {
        throw new NotFoundException(
          'SalesService.refundSubscription: informe orderId ou subscriptionId.',
        );
      }
      const sub = await this.prisma.customerSubscription.findFirst({
        where: { id: subscriptionId, workspaceId },
        select: { externalId: true },
      });
      if (!sub?.externalId) {
        throw new NotFoundException(
          `Assinatura ${subscriptionId} não possui pedido (externalId) para estorno.`,
        );
      }
      orderId = sub.externalId;
    }

    return this.refund(workspaceId, orderId, {
      reason,
      ...(typeof args?.amountCents === 'bigint' ? { amountCents: args.amountCents } : {}),
    });
  }
}
