import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { StripeService } from '../billing/stripe.service';
import { SpineEmitterService } from '../kloel/spine/spine-emitter.service';
import { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import type { BoletoChargeAddress } from '../payments/mercadopago/mercadopago.types';
import { PrismaService } from '../prisma/prisma.service';
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
  ) {}

  /**
   * Create a PIX payment order directly from chat.
   *
   * Flow:
   * 1. Resolve product + plan, workspace-scoped.
   * 2. Create a pending KloelSale.
   * 3. Generate a real PIX charge via Mercado Pago.
   * 4. Update the sale with the external payment id.
   * 5. Audit-log everything.
   * 6. Emit sale.created + payment.pending spine events.
   * 7. Return copia-e-cola + QR code for the chat surface.
   */
  async createPixOrder(
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
          // 1. Create the pending sale record
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

          // 2. Audit: sale created
          await this.auditSale(tx, sale.id, workspaceId, 'SALE_CREATED',
            buildSaleCreatedAuditDetails({ productId, planId, amount: plan.price, paymentMethod: 'PIX' }),
          );

          // 3. Generate real PIX charge via Mercado Pago
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

          // 4. Update sale with external payment id
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

          // 5. Audit: payment pending
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
        // 6. Emit spine events (after transaction commits; fire-and-forget)
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
          buildSaleSuccessLogMessage({ method: 'PIX sale', saleId: sale.id, externalPaymentId: pixResult.externalId, workspaceId }),
        );

        // 7. Return PIX display data
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

          await this.auditSale(tx, sale.id, workspaceId, 'SALE_CREATED',
            buildSaleCreatedAuditDetails({ productId, planId, amount: plan.price, paymentMethod: 'BOLETO' }),
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
          buildSaleSuccessLogMessage({ method: 'Boleto sale', saleId: sale.id, externalPaymentId: boletoResult.externalId, workspaceId }),
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

          await this.auditSale(tx, sale.id, workspaceId, 'SALE_CREATED',
            buildSaleCreatedAuditDetails({ productId, planId, amount: plan.price, paymentMethod: 'CREDIT_CARD' }),
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
          buildSaleSuccessLogMessage({ method: 'Stripe card checkout link', saleId: sale.id, externalPaymentId, workspaceId }),
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
}
