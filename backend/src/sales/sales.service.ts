import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { SpineEmitterService } from '../kloel/spine/spine-emitter.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import { PrismaService } from '../prisma/prisma.service';const PROCESSOR = 'sales-service';
const PROCESSOR_VERSION = '1.0.0';
const SCHEMA_VERSION = '1.0.0';

const MP_WEBHOOK_PATH = '/webhooks/mercadopago';

/** 30 minutes — standard MP PIX expiration window. */
const PIX_EXPIRATION_MINUTES = 30;// ------- Types -------

export interface BuyerData {
  name: string;
  email: string;
  cpf: string;
  phone?: string;
}

export interface CreatePixOrderResult {
  saleId: string;
  pixQrCode: string;
  pixQrCodeBase64: string;
  pixCopyPaste: string;
  pixExpiresAt: Date;
  externalPaymentId: string;
  ticketUrl: string;
}// ------- Helpers -------

function resolveBackendOrigin(): string {
  const raw =
    process.env.BACKEND_PUBLIC_URL ||
    process.env.PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    process.env.API_PUBLIC_URL ||
    process.env.APP_URL ||
    'http://localhost:3001';
  const trimmed = raw.replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}/**
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
    private readonly mpPix: MercadoPagoPixChargeService,
    private readonly audit: AuditService,
    private readonly spine: SpineEmitterService,
  ) {}  /**
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

    const amountCents = BigInt(Math.round(plan.price * 100));
    if (amountCents <= 0n) {
      throw new ServiceUnavailableException('O plano possui preço inválido.');
    }

    const productName = plan.product.name;
    const description = productName || `Plano ${plan.name}`;

    const idempotencyKey = `sale_${randomUUID()}`;
    const notificationUrl = `${resolveBackendOrigin()}${MP_WEBHOOK_PATH}`;
    const expiresAt = new Date(Date.now() + PIX_EXPIRATION_MINUTES * 60_000);

    const payerDocDigits = buyerData.cpf.replace(/\D/g, '');

    return this.prisma.$transaction(
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
          payerDocument: payerDocDigits || undefined,
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
    ).then(({ sale, pixResult }) => {
      // 6. Emit spine events (after transaction commits; fire-and-forget)
      void this.spine
        .emit({
          eventName: 'sale.created',
          workspaceId,
          entityRef: { entityType: 'sale', entityId: sale.id },
          truthMode: 'observed',
          provenance: {
            source: 'production',
            processor: PROCESSOR,
            processorVersion: PROCESSOR_VERSION,
            schemaVersion: SCHEMA_VERSION,
          },
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
          provenance: {
            source: 'production',
            processor: PROCESSOR,
            processorVersion: PROCESSOR_VERSION,
            schemaVersion: SCHEMA_VERSION,
          },
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
  }  /**
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