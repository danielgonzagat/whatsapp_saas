import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { StripeService } from '../billing/stripe.service';
import { SpineEmitterService } from '../kloel/spine/spine-emitter.service';
import { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import type { BoletoChargeAddress } from '../payments/mercadopago/mercadopago.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  SALES_PROVENANCE,
  buildBoletoAddressMetadata,
  buildMercadoPagoNotificationUrl,
  buildSaleDescription,
  buildStripeCheckoutUrls,
  computeBoletoExpiresAt,
  computePixExpiresAt,
  pickStripeExternalPaymentId,
  planPriceToCents,
  planPriceToCentsNumber,
  resolveFrontendOrigin,
  sanitizeDocumentDigits,
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
    const plan = await this.prisma.productPlan.findFirst({
      where: {
        id: planId,
        productId,
        product: { workspaceId },
        active: true,
      },
      include: { product: { select: { name: true } } },
    });

    if (!plan) {
      throw new NotFoundException(
        `Plano ${planId} não encontrado para produto ${productId} neste workspace.`,
      );
    }

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

    return this.prisma
      .$transaction(
        async (tx) => {
          // 1. Create the pending sale record
          const sale = await tx.kloelSale.create({
            data: {
              workspaceId,
              productName,
              amount: plan.price,
              status: 'pending',
              paymentMethod: 'PIX',
              leadPhone: buyerData.phone ?? null,
              metadata: {
                productId,
                planId,
                buyerName: buyerData.name,
                buyerEmail: buyerData.email,
              },
            },
          });

          // 2. Audit: sale created
          await this.audit.logWithTx(tx, {
            workspaceId,
            action: 'SALE_CREATED',
            resource: 'KloelSale',
            resourceId: sale.id,
            details: {
              productId,
              planId,
              amount: plan.price,
              paymentMethod: 'PIX',
            },
          });

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
            where: { id: sale.id },
            data: {
              externalPaymentId: pixResult.externalId,
              paymentLink: pixResult.ticketUrl || null,
              metadata: {
                productId,
                planId,
                buyerName: buyerData.name,
                buyerEmail: buyerData.email,
                pixExternalId: pixResult.externalId,
                pixStatus: pixResult.status,
              },
            },
          });

          // 5. Audit: payment pending
          await this.audit.logWithTx(tx, {
            workspaceId,
            action: 'PAYMENT_PENDING',
            resource: 'KloelSale',
            resourceId: sale.id,
            details: {
              externalPaymentId: pixResult.externalId,
              gateway: 'mercadopago',
              method: 'PIX',
              amount: plan.price,
              status: pixResult.status,
            },
          });

          return { sale, pixResult };
        },
        { isolationLevel: 'ReadCommitted' },
      )
      .then(({ sale, pixResult }) => {
        // 6. Emit spine events (after transaction commits; fire-and-forget)
        void this.spine
          .emit({
            eventName: 'sale.created',
            workspaceId,
            entityRef: { entityType: 'sale', entityId: sale.id },
            truthMode: 'observed',
            provenance: SALES_PROVENANCE,
            payload: {
              saleId: sale.id,
              productId,
              planId,
              amount: plan.price,
              paymentMethod: 'PIX',
              externalPaymentId: pixResult.externalId,
            },
          })
          .catch((err: unknown) => {
            this.logger.warn(
              `sale.created emission failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });

        void this.spine
          .emit({
            eventName: 'payment.pending',
            workspaceId,
            entityRef: { entityType: 'sale', entityId: sale.id },
            truthMode: 'observed',
            provenance: SALES_PROVENANCE,
            payload: {
              saleId: sale.id,
              externalPaymentId: pixResult.externalId,
              gateway: 'mercadopago',
              method: 'PIX',
              amount: plan.price,
              status: 'pending',
            },
          })
          .catch((err: unknown) => {
            this.logger.warn(
              `payment.pending emission failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });

        this.logger.log(
          `PIX sale created: saleId=${sale.id} externalPaymentId=${pixResult.externalId} workspace=${workspaceId}`,
        );

        // 7. Return PIX display data
        return {
          saleId: sale.id,
          pixQrCode: pixResult.qrCode || pixResult.qrCodeBase64,
          pixQrCodeBase64: pixResult.qrCodeBase64,
          pixCopyPaste: pixResult.qrCode,
          pixExpiresAt: expiresAt,
          externalPaymentId: pixResult.externalId,
          ticketUrl: pixResult.ticketUrl,
        };
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
    const plan = await this.prisma.productPlan.findFirst({
      where: {
        id: planId,
        productId,
        product: { workspaceId },
        active: true,
      },
      include: { product: { select: { name: true } } },
    });

    if (!plan) {
      throw new NotFoundException(
        `Plano ${planId} não encontrado para produto ${productId} neste workspace.`,
      );
    }

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

    return this.prisma
      .$transaction(
        async (tx) => {
          const sale = await tx.kloelSale.create({
            data: {
              workspaceId,
              productName,
              amount: plan.price,
              status: 'pending',
              paymentMethod: 'BOLETO',
              leadPhone: buyerData.phone ?? null,
              metadata: {
                productId,
                planId,
                buyerName: buyerData.name,
                buyerEmail: buyerData.email,
                buyerAddress: buyerAddressMetadata,
              },
            },
          });

          await this.audit.logWithTx(tx, {
            workspaceId,
            action: 'SALE_CREATED',
            resource: 'KloelSale',
            resourceId: sale.id,
            details: {
              productId,
              planId,
              amount: plan.price,
              paymentMethod: 'BOLETO',
            },
          });

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
              metadata: {
                productId,
                planId,
                buyerName: buyerData.name,
                buyerEmail: buyerData.email,
                buyerAddress: buyerAddressMetadata,
                boletoExternalId: boletoResult.externalId,
                boletoStatus: boletoResult.status,
                boletoBarcode: boletoResult.digitableLine || boletoResult.barcodeContent,
              },
            },
          });

          await this.audit.logWithTx(tx, {
            workspaceId,
            action: 'PAYMENT_PENDING',
            resource: 'KloelSale',
            resourceId: sale.id,
            details: {
              externalPaymentId: boletoResult.externalId,
              gateway: 'mercadopago',
              method: 'BOLETO',
              amount: plan.price,
              status: boletoResult.status,
            },
          });

          return { sale, boletoResult };
        },
        { isolationLevel: 'ReadCommitted' },
      )
      .then(({ sale, boletoResult }) => {
        void this.spine
          .emit({
            eventName: 'sale.created',
            workspaceId,
            entityRef: { entityType: 'sale', entityId: sale.id },
            truthMode: 'observed',
            provenance: SALES_PROVENANCE,
            payload: {
              saleId: sale.id,
              productId,
              planId,
              amount: plan.price,
              paymentMethod: 'BOLETO',
              externalPaymentId: boletoResult.externalId,
            },
          })
          .catch((err: unknown) => {
            this.logger.warn(
              `sale.created emission failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });

        void this.spine
          .emit({
            eventName: 'payment.pending',
            workspaceId,
            entityRef: { entityType: 'sale', entityId: sale.id },
            truthMode: 'observed',
            provenance: SALES_PROVENANCE,
            payload: {
              saleId: sale.id,
              externalPaymentId: boletoResult.externalId,
              gateway: 'mercadopago',
              method: 'BOLETO',
              amount: plan.price,
              status: 'pending',
            },
          })
          .catch((err: unknown) => {
            this.logger.warn(
              `payment.pending emission failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });

        this.logger.log(
          `Boleto sale created: saleId=${sale.id} externalPaymentId=${boletoResult.externalId} workspace=${workspaceId}`,
        );

        return {
          saleId: sale.id,
          boletoBarcode: boletoResult.digitableLine || boletoResult.barcodeContent,
          boletoExpiresAt: boletoResult.expiresAt,
          boletoUrl: boletoResult.ticketUrl,
          externalPaymentId: boletoResult.externalId,
        };
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
    const plan = await this.prisma.productPlan.findFirst({
      where: {
        id: planId,
        productId,
        product: { workspaceId },
        active: true,
      },
      include: { product: { select: { name: true } } },
    });

    if (!plan) {
      throw new NotFoundException(
        `Plano ${planId} não encontrado para produto ${productId} neste workspace.`,
      );
    }

    const amountCents = planPriceToCentsNumber(plan.price);
    if (amountCents <= 0) {
      throw new ServiceUnavailableException('O plano possui preço inválido.');
    }

    const productName = plan.product.name;

    return this.prisma
      .$transaction(
        async (tx) => {
          const sale = await tx.kloelSale.create({
            data: {
              workspaceId,
              productName,
              amount: plan.price,
              status: 'pending',
              paymentMethod: 'CREDIT_CARD',
              leadPhone: buyerData.phone ?? null,
              metadata: {
                productId,
                planId,
                buyerName: buyerData.name,
                buyerEmail: buyerData.email,
              },
            },
          });

          await this.audit.logWithTx(tx, {
            workspaceId,
            action: 'SALE_CREATED',
            resource: 'KloelSale',
            resourceId: sale.id,
            details: {
              productId,
              planId,
              amount: plan.price,
              paymentMethod: 'CREDIT_CARD',
            },
          });

          const frontendOrigin = resolveFrontendOrigin();
          const { successUrl, cancelUrl } = buildStripeCheckoutUrls(frontendOrigin, sale.id);
          const session = await this.stripeService.stripe.checkout.sessions.create(
            {
              mode: 'payment',
              payment_method_types: ['card'],
              customer_email: buyerData.email,
              line_items: [
                {
                  quantity: 1,
                  price_data: {
                    currency: 'brl',
                    unit_amount: amountCents,
                    product_data: { name: productName },
                  },
                },
              ],
              success_url: successUrl,
              cancel_url: cancelUrl,
              metadata: {
                workspace_id: workspaceId,
                workspaceId,
                kloel_order_id: sale.id,
                orderId: sale.id,
                saleId: sale.id,
                productId,
                planId,
                productName,
                payment_method: 'CREDIT_CARD',
                sourceCapability: 'sales.create_card_link',
                ...(buyerData.phone ? { phone: buyerData.phone } : {}),
              },
              payment_intent_data: {
                metadata: {
                  workspace_id: workspaceId,
                  workspaceId,
                  kloel_order_id: sale.id,
                  orderId: sale.id,
                  saleId: sale.id,
                  payment_method: 'CREDIT_CARD',
                  sourceCapability: 'sales.create_card_link',
                },
              },
            },
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
              metadata: {
                productId,
                planId,
                buyerName: buyerData.name,
                buyerEmail: buyerData.email,
                stripeCheckoutSessionId: session.id,
                stripePaymentIntentId: externalPaymentId,
              },
            },
          });

          await this.audit.logWithTx(tx, {
            workspaceId,
            action: 'PAYMENT_PENDING',
            resource: 'KloelSale',
            resourceId: sale.id,
            details: {
              externalPaymentId,
              gateway: 'stripe',
              method: 'CREDIT_CARD',
              amount: plan.price,
              status: 'pending',
            },
          });

          return { sale, session, externalPaymentId, checkoutUrl: session.url };
        },
        { isolationLevel: 'ReadCommitted' },
      )
      .then(({ sale, session, externalPaymentId, checkoutUrl }) => {
        void this.spine
          .emit({
            eventName: 'sale.created',
            workspaceId,
            entityRef: { entityType: 'sale', entityId: sale.id },
            truthMode: 'observed',
            provenance: SALES_PROVENANCE,
            payload: {
              saleId: sale.id,
              productId,
              planId,
              amount: plan.price,
              paymentMethod: 'CREDIT_CARD',
              externalPaymentId,
              checkoutSessionId: session.id,
            },
          })
          .catch((err: unknown) => {
            this.logger.warn(
              `sale.created emission failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });

        void this.spine
          .emit({
            eventName: 'payment.pending',
            workspaceId,
            entityRef: { entityType: 'sale', entityId: sale.id },
            truthMode: 'observed',
            provenance: SALES_PROVENANCE,
            payload: {
              saleId: sale.id,
              externalPaymentId,
              gateway: 'stripe',
              method: 'CREDIT_CARD',
              amount: plan.price,
              status: 'pending',
              checkoutSessionId: session.id,
            },
          })
          .catch((err: unknown) => {
            this.logger.warn(
              `payment.pending emission failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });

        this.logger.log(
          `Stripe card checkout link created: saleId=${sale.id} externalPaymentId=${externalPaymentId} workspace=${workspaceId}`,
        );

        return {
          saleId: sale.id,
          checkoutSessionId: session.id,
          checkoutUrl,
          externalPaymentId,
        };
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
