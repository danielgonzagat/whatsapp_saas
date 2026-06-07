import { validatePaymentTransition } from '../common/payment-state-machine';
import type { StripeHandlerDeps } from './payment-webhook-stripe.handlers';
import type { StripeCheckoutSessionLike, StripePaymentIntentLike } from './payment-webhook-types';
import { FINANCIAL_TRANSACTION_OPTIONS } from './payment-webhook-types';
import { isPaymentLedgerTxEnabled } from './payment-ledger-tx.flag';

type KloelSaleStripeMatcher = { externalPaymentId: string } | { id: string };

type KloelSaleStripeWhere =
  | { workspaceId: string; externalPaymentId: string }
  | { workspaceId: string; id: string }
  | { workspaceId: string; OR: KloelSaleStripeMatcher[] };

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function readSaleIdFromStripeMetadata(
  metadata: StripeCheckoutSessionLike['metadata'] | StripePaymentIntentLike['metadata'],
): string | undefined {
  return (
    nonEmptyString(metadata?.kloel_order_id) ||
    nonEmptyString(metadata?.orderId) ||
    nonEmptyString(metadata?.saleId)
  );
}

export function buildKloelSaleStripeWhere(
  workspaceId: string,
  stripePaymentExternalId?: string | null,
  saleId?: string | null,
): KloelSaleStripeWhere | null {
  const matchers: KloelSaleStripeMatcher[] = [];
  const externalId = nonEmptyString(stripePaymentExternalId);
  const id = nonEmptyString(saleId);
  if (externalId) {
    matchers.push({ externalPaymentId: externalId });
  }
  if (id) {
    matchers.push({ id });
  }
  if (matchers.length === 0) {
    return null;
  }
  const first = matchers[0];
  if (matchers.length === 1 && first) {
    if ('externalPaymentId' in first) {
      return { workspaceId, externalPaymentId: first.externalPaymentId };
    }
    return { workspaceId, id: first.id };
  }
  return { workspaceId, OR: matchers };
}

export async function updatePaymentAndSaleForSessionHelper(
  deps: StripeHandlerDeps,
  session: StripeCheckoutSessionLike,
  workspaceId: string,
): Promise<void> {
  const stripePaymentExternalId = session.payment_intent || session.id;
  if (isPaymentLedgerTxEnabled()) {
    await updatePaymentAndSaleForSessionAtomicHelper(
      deps,
      session,
      workspaceId,
      stripePaymentExternalId,
    );
    return;
  }
  try {
    if (deps.prisma.payment) {
      const existingPayment = await deps.prisma.payment.findFirst({
        where: {
          workspaceId,
          ...(stripePaymentExternalId ? { externalId: stripePaymentExternalId } : {}),
        },
      });
      const canTransition =
        !existingPayment ||
        validatePaymentTransition(existingPayment.status || 'PENDING', 'RECEIVED', {
          paymentId: existingPayment?.id,
          provider: 'stripe',
          ...(stripePaymentExternalId ? { externalId: stripePaymentExternalId } : {}),
        });
      if (canTransition) {
        await deps.prisma.payment.updateMany({
          where: {
            workspaceId,
            ...(stripePaymentExternalId ? { externalId: stripePaymentExternalId } : {}),
          },
          data: { status: 'RECEIVED' },
        });
      } else {
        deps.logger.warn(
          `Stripe webhook rejected by state machine: ${existingPayment?.status} -> RECEIVED for ${stripePaymentExternalId}`,
        );
      }
    }
  } catch (paymentErr: unknown) {
    const msg =
      paymentErr instanceof Error
        ? paymentErr
        : new Error(typeof paymentErr === 'string' ? paymentErr : 'unknown error');
    deps.financialAlert.webhookProcessingFailed(msg, {
      provider: 'stripe',
      externalId: stripePaymentExternalId ?? undefined,
      eventType: 'checkout.session.completed',
    });
    deps.logger.error(
      `[STRIPE] Failed to update payment for ${stripePaymentExternalId}: ${msg?.message}`,
      {
        workspaceId,
        stripePaymentExternalId,
        stack: msg?.stack,
      },
    );
    throw msg;
  }
  try {
    if (deps.prisma.kloelSale) {
      const saleId = readSaleIdFromStripeMetadata(session.metadata);
      const saleWhere = buildKloelSaleStripeWhere(workspaceId, stripePaymentExternalId, saleId);
      if (saleWhere) {
        await deps.prisma.kloelSale.updateMany({
          where: { workspaceId, ...saleWhere },
          data: {
            status: 'paid',
            paidAt: new Date(),
            ...(stripePaymentExternalId ? { externalPaymentId: stripePaymentExternalId } : {}),
          },
        });
      }
    }
  } catch (saleErr: unknown) {
    const msg =
      saleErr instanceof Error
        ? saleErr
        : new Error(typeof saleErr === 'string' ? saleErr : 'unknown error');
    deps.financialAlert.webhookProcessingFailed(msg, {
      provider: 'stripe',
      externalId: stripePaymentExternalId ?? undefined,
      eventType: 'checkout.session.completed',
    });
    deps.logger.error(
      `[STRIPE] Failed to update KloelSale for ${stripePaymentExternalId}: ${msg?.message}`,
      {
        workspaceId,
        stripePaymentExternalId,
        stack: msg?.stack,
      },
    );
    throw msg;
  }
}

/**
 * Flag-ON (`KLOEL_PAYMENT_LEDGER_TX==='true'`) path for
 * `updatePaymentAndSaleForSessionHelper`: the `Payment` RECEIVED flip and the
 * `KloelSale` paid flip are folded into ONE `$transaction` with
 * `FINANCIAL_TRANSACTION_OPTIONS`, so a partial failure rolls BOTH back. The
 * `validatePaymentTransition` guard + the `buildKloelSaleStripeWhere` join are
 * preserved verbatim from the legacy two-write path. Any transaction failure is
 * re-thrown (via `financialAlert` + `throw`) so the outer
 * `handleCheckoutSessionCompleted` catch surfaces it and Stripe retries —
 * NEVER the silent swallow of the legacy path. Idempotency is unchanged: the
 * Redis NX guard + `WebhookEvent` unique row still gate replays, and
 * `updateMany` on already-paid rows is itself idempotent.
 */
export async function updatePaymentAndSaleForSessionAtomicHelper(
  deps: StripeHandlerDeps,
  session: StripeCheckoutSessionLike,
  workspaceId: string,
  stripePaymentExternalId: string | null | undefined,
): Promise<void> {
  try {
    let canTransitionPayment = false;
    if (deps.prisma.payment) {
      const existingPayment = await deps.prisma.payment.findFirst({
        where: {
          workspaceId,
          ...(stripePaymentExternalId ? { externalId: stripePaymentExternalId } : {}),
        },
      });
      canTransitionPayment =
        !existingPayment ||
        validatePaymentTransition(existingPayment.status || 'PENDING', 'RECEIVED', {
          paymentId: existingPayment?.id,
          provider: 'stripe',
          ...(stripePaymentExternalId ? { externalId: stripePaymentExternalId } : {}),
        });
      if (!canTransitionPayment) {
        deps.logger.warn(
          `Stripe webhook rejected by state machine: ${existingPayment?.status} -> RECEIVED for ${stripePaymentExternalId}`,
        );
      }
    }

    const saleId = readSaleIdFromStripeMetadata(session.metadata);
    const saleWhere = deps.prisma.kloelSale
      ? buildKloelSaleStripeWhere(workspaceId, stripePaymentExternalId, saleId)
      : null;

    await deps.prisma.$transaction(async (tx) => {
      if (deps.prisma.payment && canTransitionPayment) {
        await tx.payment.updateMany({
          where: {
            workspaceId,
            ...(stripePaymentExternalId ? { externalId: stripePaymentExternalId } : {}),
          },
          data: { status: 'RECEIVED' },
        });
      }
      if (deps.prisma.kloelSale && saleWhere) {
        await tx.kloelSale.updateMany({
          where: { workspaceId, ...saleWhere },
          data: {
            status: 'paid',
            paidAt: new Date(),
            ...(stripePaymentExternalId ? { externalPaymentId: stripePaymentExternalId } : {}),
          },
        });
      }
    }, FINANCIAL_TRANSACTION_OPTIONS);
  } catch (txErr: unknown) {
    const msg =
      txErr instanceof Error
        ? txErr
        : new Error(typeof txErr === 'string' ? txErr : 'unknown error');
    deps.financialAlert.webhookProcessingFailed(msg, {
      provider: 'stripe',
      externalId: stripePaymentExternalId ?? undefined,
      eventType: 'checkout.session.completed',
    });
    deps.logger.error(
      `[STRIPE] Failed atomic payment+sale update for ${stripePaymentExternalId}: ${msg?.message}`,
      {
        workspaceId,
        stripePaymentExternalId,
        stack: msg?.stack,
      },
    );
    throw msg;
  }
}

export async function sendCheckoutConfirmationHelper(
  deps: StripeHandlerDeps,
  workspaceId: string,
  customerPhone: string,
  amount: number,
  currency: string,
  session: StripeCheckoutSessionLike,
): Promise<void> {
  try {
    const formattedAmount = amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const confirmationMessage = `Pagamento confirmado.\n\nValor: ${currency === 'BRL' ? 'R$' : currency} ${formattedAmount}\nID: ${session.payment_intent || session.id}\n\nObrigado pela sua compra.\n\nSe tiver qualquer dúvida, estou à disposição.`;
    await deps.whatsapp.sendMessage(workspaceId, customerPhone, confirmationMessage);
    deps.logger.log(`[STRIPE] Notificação enviada para ${customerPhone}`);
  } catch (notifyErr: unknown) {
    const notifyErrMsg = notifyErr instanceof Error ? notifyErr.message : 'unknown error';
    deps.financialAlert.webhookProcessingFailed(
      notifyErr instanceof Error ? notifyErr : new Error(notifyErrMsg),
      {
        provider: 'stripe',
        externalId: session.id ?? undefined,
        eventType: 'checkout.session.completed',
      },
    );
    deps.logger.error(`[STRIPE] Failed to notify customer ${customerPhone}: ${notifyErrMsg}`, {
      workspaceId,
      sessionId: session.id,
    });
    throw notifyErr;
  }
}
