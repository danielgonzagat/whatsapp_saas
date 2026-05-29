/**
 * Shared dependency bundle + audit/spine helpers used by every V1 create-order
 * orchestrator (PIX/boleto/Stripe). Extracted from
 * {@link ./sales.service.v1-orders} so each provider flow can live in its own
 * file under the 400-LOC governance cap without duplicating the audit/spine
 * scaffolding.
 */

import { type Logger } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { StripeService } from '../billing/stripe.service';
import { SpineEmitterService } from '../kloel/spine/spine-emitter.service';
import { MercadoPagoBoletoChargeService } from '../payments/mercadopago/mercadopago-boleto-charge.service';
import { MercadoPagoPixChargeService } from '../payments/mercadopago/mercadopago-pix-charge.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildSaleEventPair, buildSaleSuccessLogMessage, buildSpineSaleEnvelope } from './sales.helpers';

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

export function auditSale(
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

export function emitSaleAndLog(
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
