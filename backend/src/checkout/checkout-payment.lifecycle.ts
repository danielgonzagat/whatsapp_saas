import { Prisma } from '@prisma/client';

import type { AuditService } from '../audit/audit.service';
import { validateOrderTransition } from '../common/checkout-order-state-machine';
import type { CheckoutPostPaymentEffectsService } from './checkout-post-payment-effects.service';

import {
  buildFinancialAlertContext,
  buildPaymentCaptureContext,
  type CheckoutPaymentFinancialAlert,
  type CheckoutPaymentSentryCapture,
} from './checkout-payment.builders';
import { describeError } from './checkout-payment.mappers';
import {
  type AuditableFraudAction,
  type CheckoutLifecycleEmitter,
  type CheckoutPaymentFailureLogger,
  type CheckoutPaymentHelperLogger,
  type CheckoutPaymentMethod,
  FRAUD_ACTION_AUDIT_MAP,
} from './checkout-payment.types';

/**
 * Lifecycle orchestration helpers for checkout payment flows. Split out from
 * `checkout-payment.helpers.ts` (Wave 83). Every export below is re-exported
 * by `checkout-payment.helpers.ts`. No money arithmetic — the helpers wire
 * emitter calls, audit-log writes, and DB transitions but never compute or
 * mutate amount fields. Side effects are limited to the explicitly-passed
 * dependencies (emitter / auditService / logger / tx / sentryCapture / etc.).
 */

type CheckoutOrderForPostEffects = Parameters<
  CheckoutPostPaymentEffectsService['markLeadConverted']
>[0];

/**
 * Fire the `paymentInitiated` lifecycle event and, when approved, the `paymentApproved`
 * event on the optional emitter. Both calls are fire-and-forget — failures are not
 * awaited and do not affect the caller. Pure orchestration, no money math.
 */
export function emitPaymentLifecycleEvents(
  emitter: CheckoutLifecycleEmitter | undefined,
  input: {
    workspaceId: string;
    orderId: string;
    paymentIntentId: string;
    paymentMethod: CheckoutPaymentMethod;
    amountInCents: number;
    correlationId?: string | undefined;
    approved: boolean;
  },
): void {
  void emitter?.paymentInitiated({
    workspaceId: input.workspaceId,
    orderId: input.orderId,
    paymentIntentId: input.paymentIntentId,
    paymentMethod: input.paymentMethod,
    amountInCents: input.amountInCents,
    correlationId: input.correlationId,
  });
  if (input.approved) {
    void emitter?.paymentApproved({
      workspaceId: input.workspaceId,
      orderId: input.orderId,
      paymentIntentId: input.paymentIntentId,
      amountInCents: input.amountInCents,
      correlationId: input.correlationId,
    });
  }
}

/**
 * Fire the `paymentDeclined` lifecycle event when a provider charge throws. The
 * declined event always carries `paymentIntentId: undefined` because the intent was
 * not created. Fire-and-forget. Pure.
 */
export function emitPaymentDeclined(
  emitter: CheckoutLifecycleEmitter | undefined,
  input: {
    workspaceId: string;
    orderId: string;
    correlationId?: string | undefined;
    error: unknown;
  },
): void {
  void emitter?.paymentDeclined({
    workspaceId: input.workspaceId,
    orderId: input.orderId,
    paymentIntentId: undefined,
    correlationId: input.correlationId,
    reason: describeError(input.error),
  });
}

/**
 * Record an audit log entry for a non-allow fraud decision. No-op when the
 * decision action is `allow`. Pure I/O: takes the AuditService as an argument
 * so the helper stays free of instance state. Money path untouched.
 */
export async function logCheckoutFraudDecision(
  auditService: Pick<AuditService, 'log'>,
  params: {
    workspaceId: string;
    orderId: string;
    paymentMethod: CheckoutPaymentMethod;
    chargedTotalInCents: number;
    decision: {
      action: 'allow' | 'review' | 'require_3ds' | 'block';
      score: number;
      reasons: Array<{ signal: string; detail: string }>;
    };
  },
): Promise<void> {
  if (params.decision.action === 'allow') {
    return;
  }

  const auditableAction: AuditableFraudAction = params.decision.action;
  await auditService.log({
    workspaceId: params.workspaceId,
    action: FRAUD_ACTION_AUDIT_MAP[auditableAction],
    resource: 'CheckoutOrder',
    resourceId: params.orderId,
    details: {
      orderId: params.orderId,
      paymentMethod: params.paymentMethod,
      chargedTotalInCents: params.chargedTotalInCents,
      fraudDecision: {
        action: params.decision.action,
        score: params.decision.score,
        reasonSignals: params.decision.reasons.map((reason) => reason.signal),
        reasons: params.decision.reasons,
      },
    },
  });
}

/**
 * Look up an existing checkout payment for the order inside an open transaction
 * and decide whether the current charge is a no-op replay. Returns the existing
 * payment iff `externalId` matches the new charge (idempotency hit); otherwise
 * returns null so the caller proceeds to create a fresh payment row, logging a
 * divergence warning when an existing row carries a different externalId.
 *
 * `chargeLabel` is the human-readable provider label embedded in the log line
 * (e.g. `PaymentIntent`, `Mercado Pago payment`, `Mercado Pago boleto`) to keep
 * the per-arm log surface stable. Pure: takes the logger as an argument.
 */
export async function resolveExistingCheckoutPaymentForIdempotency<
  TExisting extends { externalId: string },
>(
  tx: Prisma.TransactionClient,
  logger: CheckoutPaymentHelperLogger,
  orderId: string,
  newExternalId: string,
  chargeLabel: string,
): Promise<TExisting | null> {
  const existingPayment = (await tx.checkoutPayment.findFirst({
    where: { orderId },
  })) as unknown as TExisting | null;
  if (!existingPayment) {
    return null;
  }
  if (existingPayment.externalId === newExternalId) {
    logger.log(
      `Idempotency: payment already exists for order ${orderId} with same ${chargeLabel} ${newExternalId}`,
    );
    return existingPayment;
  }
  logger.warn(
    `Idempotency: payment exists for order ${orderId} but with different externalId (existing=${existingPayment.externalId}, new=${newExternalId})`,
  );
  return null;
}

/**
 * Transition a checkout order to PAID inside an open transaction, advancing
 * through PROCESSING when needed. Validates every hop with the canonical
 * state-machine guard; silently aborts when a transition is illegal so the
 * caller's persist-tx commits the payment row without flipping the order
 * status. Pure tx logic — no money math, no `this` dependencies.
 */
export async function transitionCheckoutOrderToApproved(
  tx: Prisma.TransactionClient,
  orderId: string,
  workspaceId: string,
): Promise<void> {
  const currentOrder = await tx.checkoutOrder.findFirst({
    where: { id: orderId, workspaceId },
    select: { status: true },
  });
  let currentStatus = currentOrder?.status || 'PENDING';
  const transitionContext = { orderId, workspaceId };
  if (currentStatus !== 'PROCESSING') {
    if (!validateOrderTransition(currentStatus, 'PROCESSING', transitionContext)) {
      return;
    }
    await tx.checkoutOrder.updateMany({
      where: { id: orderId, workspaceId },
      data: { status: 'PROCESSING' },
    });
    currentStatus = 'PROCESSING';
  }
  if (!validateOrderTransition(currentStatus, 'PAID', transitionContext)) {
    return;
  }
  await tx.checkoutOrder.updateMany({
    where: { id: orderId, workspaceId },
    data: { status: 'PAID', paidAt: new Date() },
  });
}

/**
 * Run the post-payment effects that fire after a charge is approved across all
 * payment-method arms (Stripe card, Mercado Pago PIX, Mercado Pago boleto). Each
 * effect is awaited but its rejection is swallowed and logged at warn level —
 * preserving the original per-arm behavior. Pure I/O orchestration, no money math.
 */
export async function runApprovedCheckoutPostPaymentEffects(
  postPaymentEffects: Pick<
    CheckoutPostPaymentEffectsService,
    'markLeadConverted' | 'sendPurchaseSignals'
  >,
  logger: CheckoutPaymentHelperLogger,
  order: CheckoutOrderForPostEffects,
  params: { orderId: string; workspaceId: string },
  amount: number,
): Promise<void> {
  const warn = (label: string, error: unknown) =>
    logger.warn(
      `Checkout post-payment ${label} failed for order ${params.orderId}: ${describeError(error)}`,
    );
  await postPaymentEffects
    .markLeadConverted(order, params.workspaceId)
    .catch((error) => warn('lead conversion', error));
  await postPaymentEffects
    .sendPurchaseSignals(order, amount)
    .catch((error) => warn('purchase signals', error));
}

/**
 * Unified failure-reporting trifecta executed by every payment-method arm when a
 * provider charge throws. Fires the four required side effects in a fixed order
 * preserving prior behavior: (1) `paymentDeclined` lifecycle event, (2) structured
 * error log, (3) Sentry exception capture with the operation tag, (4) financial
 * alert dispatch. Pure orchestration — never re-throws (caller owns the rethrow)
 * and never touches money fields beyond echoing the already-resolved `amount`.
 */
export function reportCheckoutPaymentFailure(input: {
  emitter: CheckoutLifecycleEmitter | undefined;
  logger: CheckoutPaymentFailureLogger;
  sentryCapture: CheckoutPaymentSentryCapture;
  financialAlert: CheckoutPaymentFinancialAlert;
  workspaceId: string;
  orderId: string;
  correlationId?: string | undefined;
  amount: number;
  gateway: 'stripe' | 'mercadopago';
  operation: string;
  logPrefix: string;
  error: unknown;
}): void {
  const {
    emitter,
    logger,
    sentryCapture,
    financialAlert,
    workspaceId,
    orderId,
    correlationId,
    amount,
    gateway,
    operation,
    logPrefix,
    error,
  } = input;
  emitPaymentDeclined(emitter, { workspaceId, orderId, correlationId, error });
  logger.error(`${logPrefix} for order ${orderId}: ${describeError(error)}`);
  sentryCapture(
    error,
    buildPaymentCaptureContext({ operation, workspaceId, orderId, amount, gateway }),
  );
  financialAlert.paymentFailed(
    error as Error,
    buildFinancialAlertContext({ workspaceId, orderId, amount, gateway }),
  );
}

/**
 * Fire the lifecycle events and — when the charge is approved — run the post-
 * payment effects. Combines the two side-effect blocks every arm executes after a
 * successful persistence. Pure orchestration: no money math, no DB writes.
 */
export async function finalizeApprovedCheckoutPayment(input: {
  emitter: CheckoutLifecycleEmitter | undefined;
  postPaymentEffects: Pick<
    CheckoutPostPaymentEffectsService,
    'markLeadConverted' | 'sendPurchaseSignals'
  >;
  logger: CheckoutPaymentHelperLogger;
  order: CheckoutOrderForPostEffects;
  workspaceId: string;
  orderId: string;
  paymentIntentId: string;
  paymentMethod: CheckoutPaymentMethod;
  amountInCents: number;
  amount: number;
  correlationId?: string | undefined;
  approved: boolean;
}): Promise<void> {
  emitPaymentLifecycleEvents(input.emitter, {
    workspaceId: input.workspaceId,
    orderId: input.orderId,
    paymentIntentId: input.paymentIntentId,
    paymentMethod: input.paymentMethod,
    amountInCents: input.amountInCents,
    correlationId: input.correlationId,
    approved: input.approved,
  });
  if (input.approved) {
    await runApprovedCheckoutPostPaymentEffects(
      input.postPaymentEffects,
      input.logger,
      input.order,
      { orderId: input.orderId, workspaceId: input.workspaceId },
      input.amount,
    );
  }
}
