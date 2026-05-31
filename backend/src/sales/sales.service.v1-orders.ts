/**
 * V1 `createPixOrderLegacy` orchestrator — Mercado Pago direct PIX. Companion
 * provider flows live alongside this file (boleto in
 * {@link ./sales.service.boleto-orders}, Stripe card link in
 * {@link ./sales.service.stripe-orders}) so each stays under the 400-LOC
 * governance cap. Shared dependency bundle + audit/spine plumbing lives in
 * {@link ./sales.service.v1-shared}. Preserves the original ordering:
 * `KloelSale.create` → audit `SALE_CREATED` → provider call →
 * `KloelSale.update` with external id + metadata → audit `PAYMENT_PENDING` →
 * emit spine events + success log → return shaped result.
 */

import { ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  buildKloelSaleCreateData,
  buildMercadoPagoNotificationUrl,
  buildPaymentPendingAuditDetails,
  buildPixOrderResult,
  buildPixSaleUpdateMetadata,
  buildSaleBuyerMetadata,
  buildSaleCreatedAuditDetails,
  buildSaleDescription,
  computePixExpiresAt,
  pickSaleBuyerMetadataInput,
  planPriceToCents,
  sanitizeDocumentDigits,
} from './sales.helpers';
import type { BuyerData, CreatePixOrderResult } from './sales.service.types';
import { auditSale, emitSaleAndLog, type SalesV1Deps } from './sales.service.v1-shared';

// Re-export sibling orchestrators + the shared deps bundle so existing
// `./sales.service.v1-orders` imports keep resolving without churn.
export { createBoletoOrder } from './sales.service.boleto-orders';
export { createStripeCardLink } from './sales.service.stripe-orders';
export type { SalesV1Deps } from './sales.service.v1-shared';

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
