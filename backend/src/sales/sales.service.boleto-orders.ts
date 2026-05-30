/**
 * V1 `createBoletoOrder` orchestrator — Mercado Pago boleto. Extracted from
 * {@link ./sales.service.v1-orders} so the file stays under the 400-LOC
 * governance cap. Preserves the original ordering: `KloelSale.create` → audit
 * `SALE_CREATED` → MP boleto charge → `KloelSale.update` with external id +
 * metadata → audit `PAYMENT_PENDING` → emit spine events + success log →
 * return shaped result.
 */

import { ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  buildBoletoAddressMetadata,
  buildBoletoOrderResult,
  buildBoletoSaleCreateMetadata,
  buildBoletoSaleUpdateMetadata,
  buildKloelSaleCreateData,
  buildMercadoPagoNotificationUrl,
  buildPaymentPendingAuditDetails,
  buildSaleCreatedAuditDetails,
  buildSaleDescription,
  computeBoletoExpiresAt,
  pickSaleBuyerMetadataInput,
  planPriceToCents,
  sanitizeDocumentDigits,
} from './sales.helpers';
import type { BoletoBuyerData, CreateBoletoOrderResult } from './sales.service.types';
import { auditSale, emitSaleAndLog, type SalesV1Deps } from './sales.service.v1-shared';

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
        await tx.kloelSale.updateMany({
          where: { id: sale.id, workspaceId },
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
