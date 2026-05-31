import type { ProviderRoutingDecision } from '../payments/provider-router/provider-router.types';

import type { CheckoutPaymentHelperLogger, CheckoutPaymentMethod } from './checkout-payment.types';

/**
 * Pure domain guards used by checkout payment flows. Split out from
 * `checkout-payment.helpers.ts` (Wave 83). Every export below is re-exported by
 * `checkout-payment.helpers.ts`. No money math, no I/O beyond structured logger
 * warnings.
 */

/**
 * Pure type guard: asserts that the provider router resolved to the expected canonical
 * provider for the given checkout payment method. Throws a deterministic error whose
 * shape (`payment_provider_route_mismatch:<METHOD>:expected_<X>:got_<Y>`) is part of
 * the contract observed by checkout payment specs.
 */
export function assertCanonicalProvider(
  decision: ProviderRoutingDecision,
  expectedProvider: ProviderRoutingDecision['provider'],
  method: CheckoutPaymentMethod,
): void {
  if (decision.provider !== expectedProvider) {
    throw new Error(
      `payment_provider_route_mismatch:${method}:expected_${expectedProvider}:got_${decision.provider}`,
    );
  }
}

/**
 * Enforce the fraud-engine gate before any provider call. Routes `block` and
 * `review` actions to identical per-arm behavior: structured warn-log + throw
 * `BadRequestException` with the canonical PT-BR copy. Pure orchestration — no
 * money math, no side effects beyond logging. The throw factory is injected so
 * the helper file stays decoupled from `@nestjs/common`.
 *
 * Returns `void` when the decision is `allow` or `require_3ds` (caller proceeds).
 * Throws when the decision is `block` or `review` (caller never reaches provider).
 */
export function enforceCheckoutFraudGate(input: {
  logger: CheckoutPaymentHelperLogger;
  decision: {
    action: 'allow' | 'review' | 'require_3ds' | 'block';
    reasons: Array<{ signal: string }>;
  };
  orderId: string;
  workspaceId: string;
  throwBadRequest: (message: string) => never;
}): void {
  const { logger, decision, orderId, workspaceId, throwBadRequest } = input;
  if (decision.action !== 'block' && decision.action !== 'review') {
    return;
  }
  const reasonSignals = decision.reasons.map((reason) => reason.signal).join(',');
  if (decision.action === 'block') {
    logger.warn(
      `Checkout antifraud blocked order=${orderId} workspace=${workspaceId} reasons=${reasonSignals}`,
    );
    throwBadRequest('Pagamento bloqueado pela política antifraude.');
  }
  logger.warn(
    `Checkout antifraud routed order=${orderId} workspace=${workspaceId} to manual review reasons=${reasonSignals}`,
  );
  throwBadRequest('Pagamento retido para revisão manual.');
}
