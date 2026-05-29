/**
 * V1 create-order orchestrators extracted from {@link SalesService} so the
 * service stays under the 600-LOC governance cap. Each function owns one
 * provider's transaction flow (PIX/boleto/Stripe) and receives the deps it
 * needs from the service via the {@link SalesV1Deps} bundle — no DI rewrite
 * required.
 *
 * All three keep the original ordering: `KloelSale.create` → audit
 * `SALE_CREATED` → provider call → `KloelSale.update` with external id +
 * metadata → audit `PAYMENT_PENDING` → emit spine events + success log →
 * return shaped result.
 */

import { ServiceUnavailableException, type Logger } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { AuditService } from '../audit/audit.service';
import { StripeService } from '../billing/stripe.service';
import { SpineEmitterService } from '../kloel/spine/spine-emitter.service';
import { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
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
  buildSaleCreatedAuditDetails,
  buildSaleDescription,
  buildSaleEventPair,
  buildSaleSuccessLogMessage,
  buildSpineSaleEnvelope,
  buildStripeCardLinkResult,
  buildStripeCheckoutSessionInput,
  buildStripeCheckoutUrls,
  buildStripeSaleUpdateMetadata,
  computeBoletoExpiresAt,
  computePixExpiresAt,
  pickSaleBuyerMetadataInput,
  pickStripeExternalPaymentId,
  planPriceToCents,
  planPriceToCentsNumber,
  resolveFrontendOrigin,
  sanitizeDocumentDigits,
} from './sales.helpers';
import type {
  BoletoBuyerData,
  BuyerData,
  CreateBoletoOrderResult,
  CreatePixOrderResult,
  CreateStripeCardLinkResult,
} from './sales.service.types';

/** Dependency bundle the service passes into every V1 orchestrator. */
export interface SalesV1Deps {
  prisma: PrismaService;
  mpPix: MercadoPagoPixChargeService;
  mpBoleto: MercadoPagoBoletoChargeService;
  stripeService: StripeService;
  audit: AuditService;
  spine: SpineEmitterService;
  logger: Logger;
  /** Workspace-scoped plan lookup used by all V1 paths. */
  loadActivePlanOrThrow(
    workspaceId: string,
    productId: string,
    planId: string,
  ): Promise<{ id: string; name: string; price: number; product: { name: string } }>;
}

// ---------------------------------------------------------------------------
// Shared audit + spine helpers
// ---------------------------------------------------------------------------

function auditSale(
  deps: Pick<SalesV1Deps, 'audit'>,
  tx: Prisma.TransactionClient,
  saleId: string,
  workspaceId: string,
  action: 'SALE_CREATED' | 'PAYMENT_PENDING',
  details: Record<string, unknown>,
): Promise<void> {
  return deps.audit.logWithTx(tx, {
    workspaceId,
    action,
    resource: 'KloelSale',
    resourceId: saleId,
    details,
  });
}

function emitSaleEvent(
  deps: Pick<SalesV1Deps, 'spine' | 'logger'>,
  args: {
    eventName: string;
    workspaceId: string;
    saleId: string;
    payload: Record<string, unknown>;
  },
): void {
  void deps.spine.emit(buildSpineSaleEnvelope(args)).catch((err: unknown) => {
    deps.logger.warn(
      `${args.eventName} emission failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}

function emitSaleAndLog(
  deps: Pick<SalesV1Deps, 'spine' | 'logger'>,
  args: {
    saleId: string;
    workspaceId: string;
    productId: string;
    planId: string;
    amount: number;
    paymentMethod: 'PIX' | 'BOLETO' | 'CREDIT_CARD';
    externalPaymentId: string;
    gateway: 'mercadopago' | 'stripe';
    method: string;
    checkoutSessionId?: string;
  },
): void {
  const { saleCreated, paymentPending } = buildSaleEventPair({
    saleId: args.saleId,
    productId: args.productId,
    planId: args.planId,
    amount: args.amount,
    paymentMethod: args.paymentMethod,
    externalPaymentId: args.externalPaymentId,
    gateway: args.gateway,
    ...(args.checkoutSessionId ? { checkoutSessionId: args.checkoutSessionId } : {}),
  });
  emitSaleEvent(deps, {
    eventName: 'sale.created',
    workspaceId: args.workspaceId,
    saleId: args.saleId,
    payload: saleCreated,
  });
  emitSaleEvent(deps, {
    eventName: 'payment.pending',
    workspaceId: args.workspaceId,
    saleId: args.saleId,
    payload: paymentPending,
  });
  deps.logger.log(
    buildSaleSuccessLogMessage({
      method: args.method,
      saleId: args.saleId,
      externalPaymentId: args.externalPaymentId,
      workspaceId: args.workspaceId,
    }),
  );
}

// ---------------------------------------------------------------------------
// createPixOrder (V1 legacy) — Mercado Pago direct PIX
// ---------------------------------------------------------------------------

export async function createPixOrderLegacy(
  deps: SalesV1Deps,
  workspaceId: string,
  productId: string,
  planId: string,
  buyerData: BuyerData,
): Promise<CreatePixOrderResult> {
  const plan = await deps.loadActivePlanOrThrow(workspaceId, productId, planId);
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

  return deps.prisma
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
        await auditSale(
          deps,
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
        const pixResult = await deps.mpPix.create({
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
            metadata: buildPixSaleUpdateMetadata(buyerMeta, pixResult.externalId, pixResult.status),
          },
        });
        await auditSale(
          deps,
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
      emitSaleAndLog(deps, {
        saleId: sale.id,
        workspaceId,
        productId,
        planId,
        amount: plan.price,
        paymentMethod: 'PIX',
        externalPaymentId: pixResult.externalId,
        gateway: 'mercadopago',
        method: 'PIX sale',
      });
      return buildPixOrderResult({ saleId: sale.id, expiresAt, pixResult });
    });
}

// ---------------------------------------------------------------------------
// createBoletoOrder — Mercado Pago boleto
// ---------------------------------------------------------------------------

export async function createBoletoOrder(
  deps: SalesV1Deps,
  workspaceId: string,
  productId: string,
  planId: string,
  buyerData: BoletoBuyerData,
): Promise<CreateBoletoOrderResult> {
  const plan = await deps.loadActivePlanOrThrow(workspaceId, productId, planId);
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

  return deps.prisma
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
        await auditSale(
          deps,
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
        const boletoResult = await deps.mpBoleto.create({
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
        await auditSale(
          deps,
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
      emitSaleAndLog(deps, {
        saleId: sale.id,
        workspaceId,
        productId,
        planId,
        amount: plan.price,
        paymentMethod: 'BOLETO',
        externalPaymentId: boletoResult.externalId,
        gateway: 'mercadopago',
        method: 'Boleto sale',
      });
      return buildBoletoOrderResult({ saleId: sale.id, boletoResult });
    });
}

// ---------------------------------------------------------------------------
// createStripeCardLink — Stripe Checkout Session (card-only)
// ---------------------------------------------------------------------------

export async function createStripeCardLink(
  deps: SalesV1Deps,
  workspaceId: string,
  productId: string,
  planId: string,
  buyerData: BuyerData,
): Promise<CreateStripeCardLinkResult> {
  const plan = await deps.loadActivePlanOrThrow(workspaceId, productId, planId);
  const amountCents = planPriceToCentsNumber(plan.price);
  if (amountCents <= 0) {
    throw new ServiceUnavailableException('O plano possui preço inválido.');
  }
  const productName = plan.product.name;
  const buyerMeta = pickSaleBuyerMetadataInput(productId, planId, buyerData);

  return deps.prisma
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
        await auditSale(
          deps,
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
        const session = await deps.stripeService.stripe.checkout.sessions.create(
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
        await auditSale(
          deps,
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
      emitSaleAndLog(deps, {
        saleId: sale.id,
        workspaceId,
        productId,
        planId,
        amount: plan.price,
        paymentMethod: 'CREDIT_CARD',
        externalPaymentId,
        gateway: 'stripe',
        method: 'Stripe card checkout link',
        checkoutSessionId: session.id,
      });
      return buildStripeCardLinkResult({
        saleId: sale.id,
        checkoutSessionId: session.id,
        checkoutUrl,
        externalPaymentId,
      });
    });
}
