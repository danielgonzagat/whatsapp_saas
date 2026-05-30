/**
 * V1 `createStripeCardLink` orchestrator — Stripe Checkout Session (card-only).
 * Extracted from {@link ./sales.service.v1-orders} so the file stays under the
 * 400-LOC governance cap. Preserves the original ordering: `KloelSale.create`
 * → audit `SALE_CREATED` → Stripe checkout session create → `KloelSale.update`
 * with external id + metadata → audit `PAYMENT_PENDING` → emit spine events +
 * success log → return shaped result.
 */

import { ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  buildKloelSaleCreateData,
  buildPaymentPendingAuditDetails,
  buildSaleBuyerMetadata,
  buildSaleCreatedAuditDetails,
  buildStripeCardLinkResult,
  buildStripeCheckoutSessionInput,
  buildStripeCheckoutUrls,
  buildStripeSaleUpdateMetadata,
  pickSaleBuyerMetadataInput,
  pickStripeExternalPaymentId,
  planPriceToCentsNumber,
  resolveFrontendOrigin,
} from './sales.helpers';
import type { BuyerData, CreateStripeCardLinkResult } from './sales.service.types';
import { auditSale, emitSaleAndLog, type SalesV1Deps } from './sales.service.v1-shared';

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
        await tx.kloelSale.updateMany({
          where: { id: sale.id, workspaceId },
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
