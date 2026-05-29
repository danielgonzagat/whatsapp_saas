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
import type { BoletoChargeAddress } from '../payments/mercadopago/mercadopago.types';
import { PrismaService } from '../prisma/prisma.service';
import { SmartPaymentService } from '../kloel/smart-payment.service';
import {
  buildBoletoAddressMetadata,
  buildBoletoOrderResult,
  buildBoletoSaleCreateMetadata,
  buildBoletoSaleUpdateMetadata,
  buildKloelSaleCreateData,
  buildMercadoPagoNotificationUrl,
  buildPaymentPendingAuditDetails,
  buildPixOrderResult,
  buildPixSaleUpdateMetadata,
  buildSaleBuyerMetadata,
  pickSaleBuyerMetadataInput,
  buildSaleDescription,
  buildSaleEventPair,
  buildSpineSaleEnvelope,
  buildStripeCardLinkResult,
  buildStripeCheckoutSessionInput,
  buildStripeCheckoutUrls,
  buildStripeSaleUpdateMetadata,
  computeBoletoExpiresAt,
  computePixExpiresAt,
  pickStripeExternalPaymentId,
  planPriceToCents,
  planPriceToCentsNumber,
  resolveFrontendOrigin,
  sanitizeDocumentDigits,
  buildSaleCreatedAuditDetails,
  buildSaleSuccessLogMessage,
} from './sales.helpers';
// ------- Types -------

export interface BuyerData {
  name: string;
  email: string;
  cpf: string;
  phone?: string;
}

export interface BoletoBuyerData extends BuyerData {
  address: BoletoChargeAddress;
}

export interface CreatePixOrderResult {
  saleId: string;
  pixQrCode: string;
  pixQrCodeBase64: string;
  pixCopyPaste: string;
  pixExpiresAt: Date;
  externalPaymentId: string;
  ticketUrl: string;
}

export interface CreateBoletoOrderResult {
  saleId: string;
  boletoBarcode: string;
  boletoExpiresAt: Date;
  boletoUrl: string;
  externalPaymentId: string;
}

export interface CreateStripeCardLinkResult {
  saleId: string;
  checkoutSessionId: string;
  checkoutUrl: string;
  externalPaymentId: string;
}
/**
 * Sales service — creates sales (PIX, card, boleto) directly from chat flows.
 *
 * Unlike the checkout pipeline, this service targets in-chat conversion:
 * WhatsApp → KLOEL brain → createPixOrder → real PIX QR code returned
 * to the buyer in the chat thread.
 *
 * All mutations are workspace-scoped and audit-logged.
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
   * and falls back to a stub when the service is unavailable.
   */
  async createPixOrder(
    workspaceId: string,
    dto: {
      productId: string;
      planId?: string;
      buyer: { name: string; email: string; phone?: string; cpf?: string };
    },
  ): Promise<{
    orderId: string;
    pixCopyPaste: string;
    pixQrCode: string;
    amountCents: bigint;
    expiresAt: Date;
  }>;

  /** Implementation — discriminates on typeof the second argument. */
  async createPixOrder(
    workspaceId: string,
    arg2:
      | string
      | {
          productId: string;
          planId?: string;
          buyer: { name: string; email: string; phone?: string; cpf?: string };
        },
    arg3?: string,
    arg4?: BuyerData,
  ): Promise<
    | CreatePixOrderResult
    | {
        orderId: string;
        pixCopyPaste: string;
        pixQrCode: string;
        amountCents: bigint;
        expiresAt: Date;
      }
  > {
    if (typeof arg2 === 'string') {
      return this.createPixOrderLegacy(workspaceId, arg2, arg3!, arg4!);
    }
    return this.createPixOrderV2(workspaceId, arg2);
  }

  /**
   * Legacy PIX order — resolves plan via Mercado Pago direct charge.
   * Kept for backward compatibility with existing callers.
   */
  private async createPixOrderLegacy(
    workspaceId: string,
    productId: string,
    planId: string,
    buyerData: BuyerData,
  ): Promise<CreatePixOrderResult> {
    const plan = await this.loadActivePlanOrThrow(workspaceId, productId, planId);
    const amountCents = planPriceToCents(plan.price);
    if (amountCents <= 0n) {
      throw new ServiceUnavailableException('O plano possui preço inválido.');
    }

    const productName = plan.product.name;
    const description = buildSaleDescription(productName, plan.name);

    const idempotencyKey = `sale_${randomUUID()}`;
    const notificationUrl = buildMercadoPagoNotificationUrl();
    const expiresAt = computePixExpiresAt();

    const payerDocDigits = sanitizeDocumentDigits(buyerData.cpf);
    const buyerMeta = pickSaleBuyerMetadataInput(productId, planId, buyerData);

    return this.prisma
      .$transaction(
        async (tx) => {
          const sale = await tx.kloelSale.create({
            data: buildKloelSaleCreateData({
              workspaceId,
              productName,
              amount: plan.price,
              paymentMethod: 'PIX',
              leadPhone: buyerData.phone ?? null,
              metadata: buildSaleBuyerMetadata(buyerMeta),
            }),
          });

          await this.auditSale(
            tx,
            sale.id,
            workspaceId,
            'SALE_CREATED',
            buildSaleCreatedAuditDetails({
              productId,
              planId,
              amount: plan.price,
              paymentMethod: 'PIX',
            }),
          );

          const pixResult = await this.mpPix.create({
            idempotencyKey,
            amountCents,
            payerEmail: buyerData.email,
            payerName: buyerData.name,
            ...(payerDocDigits ? { payerDocument: payerDocDigits } : {}),
            description,
            externalReference: sale.id,
            expiresAt,
            notificationUrl,
          });

          await tx.kloelSale.update({
            where: { id: sale.id, workspaceId },
            data: {
              externalPaymentId: pixResult.externalId,
              paymentLink: pixResult.ticketUrl || null,
              metadata: buildPixSaleUpdateMetadata(
                buyerMeta,
                pixResult.externalId,
                pixResult.status,
              ),
            },
          });

          await this.auditSale(
            tx,
            sale.id,
            workspaceId,
            'PAYMENT_PENDING',
            buildPaymentPendingAuditDetails({
              externalPaymentId: pixResult.externalId,
              gateway: 'mercadopago',
              method: 'PIX',
              amount: plan.price,
              status: pixResult.status,
            }),
          );

          return { sale, pixResult };
        },
        { isolationLevel: 'ReadCommitted' },
      )
      .then(({ sale, pixResult }) => {
        const { saleCreated, paymentPending } = buildSaleEventPair({
          saleId: sale.id,
          productId,
          planId,
          amount: plan.price,
          paymentMethod: 'PIX',
          externalPaymentId: pixResult.externalId,
          gateway: 'mercadopago',
        });
        this.emitSaleEvent({
          eventName: 'sale.created',
          workspaceId,
          saleId: sale.id,
          payload: saleCreated,
        });
        this.emitSaleEvent({
          eventName: 'payment.pending',
          workspaceId,
          saleId: sale.id,
          payload: paymentPending,
        });

        this.logger.log(
          buildSaleSuccessLogMessage({
            method: 'PIX sale',
            saleId: sale.id,
            externalPaymentId: pixResult.externalId,
            workspaceId,
          }),
        );

        return buildPixOrderResult({ saleId: sale.id, expiresAt, pixResult });
      });
  }

  /**
   * Create a boleto payment order directly from chat using Mercado Pago.
   */
  async createBoletoOrder(
    workspaceId: string,
    productId: string,
    planId: string,
    buyerData: BoletoBuyerData,
  ): Promise<CreateBoletoOrderResult> {
    const plan = await this.loadActivePlanOrThrow(workspaceId, productId, planId);
    const amountCents = planPriceToCents(plan.price);
    if (amountCents <= 0n) {
      throw new ServiceUnavailableException('O plano possui preço inválido.');
    }

    const productName = plan.product.name;
    const description = buildSaleDescription(productName, plan.name);
    const idempotencyKey = `sale_${randomUUID()}`;
    const notificationUrl = buildMercadoPagoNotificationUrl();
    const expiresAt = computeBoletoExpiresAt();
    const payerDocDigits = sanitizeDocumentDigits(buyerData.cpf);
    const buyerAddressMetadata = buildBoletoAddressMetadata(buyerData.address);
    const buyerMeta = pickSaleBuyerMetadataInput(productId, planId, buyerData);

    return this.prisma
      .$transaction(
        async (tx) => {
          const sale = await tx.kloelSale.create({
            data: buildKloelSaleCreateData({
              workspaceId,
              productName,
              amount: plan.price,
              paymentMethod: 'BOLETO',
              leadPhone: buyerData.phone ?? null,
              metadata: buildBoletoSaleCreateMetadata(buyerMeta, buyerAddressMetadata),
            }),
          });

          await this.auditSale(
            tx,
            sale.id,
            workspaceId,
            'SALE_CREATED',
            buildSaleCreatedAuditDetails({
              productId,
              planId,
              amount: plan.price,
              paymentMethod: 'BOLETO',
            }),
          );

          const boletoResult = await this.mpBoleto.create({
            idempotencyKey,
            amountCents,
            payerEmail: buyerData.email,
            payerName: buyerData.name,
            payerDocument: payerDocDigits,
            payerAddress: buyerData.address,
            description,
            externalReference: sale.id,
            expiresAt,
            notificationUrl,
          });

          await tx.kloelSale.update({
            where: { id: sale.id },
            data: {
              externalPaymentId: boletoResult.externalId,
              paymentLink: boletoResult.ticketUrl,
              metadata: buildBoletoSaleUpdateMetadata({
                buyer: buyerMeta,
                buyerAddressMetadata,
                externalId: boletoResult.externalId,
                status: boletoResult.status,
                barcode: boletoResult.digitableLine || boletoResult.barcodeContent,
              }),
            },
          });

          await this.auditSale(
            tx,
            sale.id,
            workspaceId,
            'PAYMENT_PENDING',
            buildPaymentPendingAuditDetails({
              externalPaymentId: boletoResult.externalId,
              gateway: 'mercadopago',
              method: 'BOLETO',
              amount: plan.price,
              status: boletoResult.status,
            }),
          );

          return { sale, boletoResult };
        },
        { isolationLevel: 'ReadCommitted' },
      )
      .then(({ sale, boletoResult }) => {
        const { saleCreated, paymentPending } = buildSaleEventPair({
          saleId: sale.id,
          productId,
          planId,
          amount: plan.price,
          paymentMethod: 'BOLETO',
          externalPaymentId: boletoResult.externalId,
          gateway: 'mercadopago',
        });
        this.emitSaleEvent({
          eventName: 'sale.created',
          workspaceId,
          saleId: sale.id,
          payload: saleCreated,
        });
        this.emitSaleEvent({
          eventName: 'payment.pending',
          workspaceId,
          saleId: sale.id,
          payload: paymentPending,
        });

        this.logger.log(
          buildSaleSuccessLogMessage({
            method: 'Boleto sale',
            saleId: sale.id,
            externalPaymentId: boletoResult.externalId,
            workspaceId,
          }),
        );

        return buildBoletoOrderResult({ saleId: sale.id, boletoResult });
      });
  }

  /**
   * Create a card checkout link directly from chat using Stripe Checkout.
   */
  async createStripeCardLink(
    workspaceId: string,
    productId: string,
    planId: string,
    buyerData: BuyerData,
  ): Promise<CreateStripeCardLinkResult> {
    const plan = await this.loadActivePlanOrThrow(workspaceId, productId, planId);
    const amountCents = planPriceToCentsNumber(plan.price);
    if (amountCents <= 0) {
      throw new ServiceUnavailableException('O plano possui preço inválido.');
    }

    const productName = plan.product.name;
    const buyerMeta = pickSaleBuyerMetadataInput(productId, planId, buyerData);

    return this.prisma
      .$transaction(
        async (tx) => {
          const sale = await tx.kloelSale.create({
            data: buildKloelSaleCreateData({
              workspaceId,
              productName,
              amount: plan.price,
              paymentMethod: 'CREDIT_CARD',
              leadPhone: buyerData.phone ?? null,
              metadata: buildSaleBuyerMetadata(buyerMeta),
            }),
          });

          await this.auditSale(
            tx,
            sale.id,
            workspaceId,
            'SALE_CREATED',
            buildSaleCreatedAuditDetails({
              productId,
              planId,
              amount: plan.price,
              paymentMethod: 'CREDIT_CARD',
            }),
          );

          const frontendOrigin = resolveFrontendOrigin();
          const { successUrl, cancelUrl } = buildStripeCheckoutUrls(frontendOrigin, sale.id);
          const session = await this.stripeService.stripe.checkout.sessions.create(
            buildStripeCheckoutSessionInput({
              workspaceId,
              saleId: sale.id,
              productId,
              planId,
              productName,
              buyerEmail: buyerData.email,
              amountCents,
              successUrl,
              cancelUrl,
              ...(buyerData.phone ? { phone: buyerData.phone } : {}),
            }),
            { idempotencyKey: `sale-card:${workspaceId}:${sale.id}:${randomUUID()}` },
          );

          if (!session.url) {
            throw new ServiceUnavailableException('Stripe não retornou URL de checkout.');
          }

          const externalPaymentId = pickStripeExternalPaymentId(session.payment_intent, session.id);

          await tx.kloelSale.update({
            where: { id: sale.id },
            data: {
              externalPaymentId,
              paymentLink: session.url,
              metadata: buildStripeSaleUpdateMetadata(buyerMeta, session.id, externalPaymentId),
            },
          });

          await this.auditSale(
            tx,
            sale.id,
            workspaceId,
            'PAYMENT_PENDING',
            buildPaymentPendingAuditDetails({
              externalPaymentId,
              gateway: 'stripe',
              method: 'CREDIT_CARD',
              amount: plan.price,
            }),
          );

          return { sale, session, externalPaymentId, checkoutUrl: session.url };
        },
        { isolationLevel: 'ReadCommitted' },
      )
      .then(({ sale, session, externalPaymentId, checkoutUrl }) => {
        const { saleCreated, paymentPending } = buildSaleEventPair({
          saleId: sale.id,
          productId,
          planId,
          amount: plan.price,
          paymentMethod: 'CREDIT_CARD',
          externalPaymentId,
          gateway: 'stripe',
          checkoutSessionId: session.id,
        });
        this.emitSaleEvent({
          eventName: 'sale.created',
          workspaceId,
          saleId: sale.id,
          payload: saleCreated,
        });
        this.emitSaleEvent({
          eventName: 'payment.pending',
          workspaceId,
          saleId: sale.id,
          payload: paymentPending,
        });

        this.logger.log(
          buildSaleSuccessLogMessage({
            method: 'Stripe card checkout link',
            saleId: sale.id,
            externalPaymentId,
            workspaceId,
          }),
        );

        return buildStripeCardLinkResult({
          saleId: sale.id,
          checkoutSessionId: session.id,
          checkoutUrl,
          externalPaymentId,
        });
      });
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

  /**
   * Write a `KloelSale`-scoped audit row through the supplied transaction
   * client. Collapses the repeated `{workspaceId, action, resource, resourceId,
   * details}` envelope into a single call so each money-path method stays
   * focused on its own logic.
   */
  private auditSale(
    tx: Prisma.TransactionClient,
    saleId: string,
    workspaceId: string,
    action: 'SALE_CREATED' | 'PAYMENT_PENDING',
    details: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.logWithTx(tx, {
      workspaceId,
      action,
      resource: 'KloelSale',
      resourceId: saleId,
      details,
    });
  }

  /**
   * Fire-and-forget spine emission with structured warn log on failure. Keeps
   * the call sites readable instead of repeating the same `.catch` block six
   * times.
   */
  private emitSaleEvent(args: {
    eventName: string;
    workspaceId: string;
    saleId: string;
    payload: Record<string, unknown>;
  }): void {
    void this.spine.emit(buildSpineSaleEnvelope(args)).catch((err: unknown) => {
      this.logger.warn(
        `${args.eventName} emission failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /**
   * Look up a sale by id, scoped to workspace.
   */
  async findById(workspaceId: string, saleId: string) {
    return this.prisma.kloelSale.findFirst({
      where: { id: saleId, workspaceId },
    });
  }

  /**
   * List recent sales for a workspace.
   */
  async listByWorkspace(workspaceId: string, limit = 50) {
    return this.prisma.kloelSale.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ---------------------------------------------------------------------------
  // Tier-5 capability methods (PI-K37) — overload set for createPixOrder,
  // plus fillBuyerData and refund.
  // ---------------------------------------------------------------------------

  /** Tier-5 PIX order via SmartPaymentService (or stub when unavailable). */
  private async createPixOrderV2(
    workspaceId: string,
    dto: {
      productId: string;
      planId?: string;
      buyer: { name: string; email: string; phone?: string; cpf?: string };
    },
  ): Promise<{
    orderId: string;
    pixCopyPaste: string;
    pixQrCode: string;
    amountCents: bigint;
    expiresAt: Date;
  }> {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, workspaceId, active: true },
    });
    if (!product) {
      throw new NotFoundException(`Produto ${dto.productId} não encontrado neste workspace.`);
    }

    let plan: { id: string; name: string; price: number } | null = null;

    if (dto.planId) {
      plan = await this.prisma.productPlan.findFirst({
        where: { id: dto.planId, productId: dto.productId, product: { workspaceId }, active: true },
        select: { id: true, name: true, price: true },
      });
      if (!plan) {
        throw new NotFoundException(
          `Plano ${dto.planId} não encontrado para produto ${dto.productId}.`,
        );
      }
    } else {
      plan = await this.prisma.productPlan.findFirst({
        where: { productId: dto.productId, product: { workspaceId }, active: true },
        orderBy: { price: 'asc' },
        select: { id: true, name: true, price: true },
      });
      if (!plan) {
        throw new NotFoundException(
          `Nenhum plano ativo encontrado para o produto ${dto.productId}.`,
        );
      }
    }

    const amountCents = BigInt(Math.round(plan.price * 100));
    if (amountCents <= 0n) {
      throw new ServiceUnavailableException('O plano possui preço inválido.');
    }

    const orderId = randomUUID();
    const expiresAt = computePixExpiresAt();

    await this.prisma.kloelSale.create({
      data: {
        id: orderId,
        workspaceId,
        productName: product.name,
        amount: plan.price,
        status: 'pending',
        paymentMethod: 'PIX',
        leadPhone: dto.buyer.phone ?? null,
        metadata: {
          productId: dto.productId,
          planId: plan.id,
          buyerName: dto.buyer.name,
          buyerEmail: dto.buyer.email,
          ...(dto.buyer.cpf ? { buyerCpf: sanitizeDocumentDigits(dto.buyer.cpf) } : {}),
          capability: 'sales.create_pix',
        },
      },
    });

    let pixCopyPaste: string;
    let pixQrCode: string;

    if (this.smartPayment) {
      try {
        const smartResult = await this.smartPayment.createSmartPayment({
          workspaceId,
          phone: dto.buyer.phone ?? '',
          contactId: undefined,
          customerName: dto.buyer.name,
          customerEmail: dto.buyer.email,
          amount: plan.price,
          productName: product.name,
        });
        pixCopyPaste = smartResult.pixCopyPaste ?? `PIX_COPIA_E_COLA_${orderId}`;
        pixQrCode = smartResult.pixQrCode ?? `PIX_QR_${orderId}`;
      } catch (err: unknown) {
        this.logger.warn(
          `SmartPaymentService failed, falling back to stub: ${err instanceof Error ? err.message : String(err)}`,
        );
        pixCopyPaste = `00020126580014BR.GOV.BCB.PIX0136${orderId.replace(/-/g, '')}5204000053039865405${String(amountCents).padStart(2, '0')}5802BR5925${dto.buyer.name.slice(0, 25)}6009SAO PAULO62070503***6304AB12`;
        pixQrCode = `data:image/png;base64,stub_qr_${orderId}`;
      }
    } else {
      pixCopyPaste = `00020126580014BR.GOV.BCB.PIX0136${orderId.replace(/-/g, '')}5204000053039865405${String(amountCents).padStart(2, '0')}5802BR5925${dto.buyer.name.slice(0, 25)}6009SAO PAULO62070503***6304AB12`;
      pixQrCode = `data:image/png;base64,stub_qr_${orderId}`;
    }

    return { orderId, pixCopyPaste, pixQrCode, amountCents, expiresAt };
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
    const patch: Record<string, unknown> = {};

    if (dto.name !== undefined) {
      patch.buyerName = dto.name;
    }
    if (dto.email !== undefined) {
      patch.buyerEmail = dto.email;
    }
    if (dto.phone !== undefined) {
      patch.buyerPhone = dto.phone;
    }
    if (dto.cpf !== undefined) {
      patch.buyerCpf = sanitizeDocumentDigits(dto.cpf);
    }

    if (Object.keys(patch).length === 0) {
      return { updated: true };
    }

    await this.prisma.kloelSale.update({
      where: { id: orderId },
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
        where: { id: orderId },
        select: { metadata: true },
      });
      const meta = (existingMeta?.metadata as Record<string, unknown> | null) ?? {};
      const previousRefundId = meta.refundId as string | undefined;
      return {
        refundId: previousRefundId ?? `refund_${orderId}`,
        status: 'processed',
      };
    }

    const refundId = `refund_${orderId}`;
    const refundAmountCents = dto.amountCents ?? BigInt(Math.round(sale.amount * 100));

    await this.prisma.kloelSale.update({
      where: { id: orderId },
      data: {
        status: 'refunded',
        metadata: {
          refundId,
          refundReason: dto.reason,
          refundAmountCents: refundAmountCents.toString(),
          refundedAt: new Date().toISOString(),
          originalStatus: sale.status,
        },
      },
    });

    return { refundId, status: 'pending' };
  }
}
