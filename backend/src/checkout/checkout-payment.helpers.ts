/**
 * Checkout payment helpers — barrel re-export.
 *
 * Wave 83 split the original 1153-LOC helpers file into four focused modules
 * to honor the 800-LOC ratchet without touching the money path or any
 * consumer's import surface. Every symbol historically imported from
 * `./checkout-payment.helpers` continues to resolve here, byte-for-byte.
 *
 * Layout:
 *   - checkout-payment.types       — pure types + frozen constants
 *   - checkout-payment.mappers     — pure formatters / normalizers / value mappers
 *   - checkout-payment.builders    — pure input/output envelope builders
 *   - checkout-payment.guards      — pure domain guards / asserts
 *   - checkout-payment.lifecycle   — orchestration (audit / DB tx / lifecycle events)
 *
 * No symbol is added, removed, or renamed by this refactor. Money values
 * remain BigInt-of-integer-cents end-to-end.
 */

export {
  type AuditableFraudAction,
  BOLETO_EXPIRATION_DAYS,
  type BoletoDisplayData,
  type CheckoutLifecycleEmitter,
  type CheckoutOrderMetadataView,
  type CheckoutPaymentFailureLogger,
  type CheckoutPaymentHelperLogger,
  type CheckoutPaymentMethod,
  type CheckoutPaymentStatus,
  EMPTY_BOLETO_DATA,
  EMPTY_PIX_DATA,
  FRAUD_ACTION_AUDIT_MAP,
  MP_WEBHOOK_PATH,
  PIX_EXPIRATION_MINUTES,
  type PixDisplayData,
  STRIPE_THREE_DS_REQUEST_ANY,
} from './checkout-payment.types';

export {
  buildMercadoPagoBoletoDisplay,
  buildMercadoPagoPixDisplay,
  buildPaymentDescription,
  describeError,
  extractOrderMetadataView,
  extractProductName,
  formatMercadoPagoQrImage,
  mapMercadoPagoPaymentStatus,
  mapStripePaymentStatus,
  normalizeBoletoAddress,
  readBoletoAddressField,
  resolveBackendOrigin,
  toJsonValue,
  toProviderPaymentMethod,
} from './checkout-payment.mappers';

export {
  buildCheckoutPaymentCreatedAuditPayload,
  buildCheckoutPaymentResult,
  buildFinancialAlertContext,
  buildMercadoPagoBoletoChargeInput,
  buildMercadoPagoBoletoPaymentData,
  buildMercadoPagoPixChargeInput,
  buildMercadoPagoPixPaymentData,
  buildPaymentBreadcrumb,
  buildPaymentCaptureContext,
  buildStripeChargeInput,
  buildStripePaymentData,
  type CheckoutPaymentFinancialAlert,
  type CheckoutPaymentSentryCapture,
} from './checkout-payment.builders';

export { assertCanonicalProvider, enforceCheckoutFraudGate } from './checkout-payment.guards';

export {
  emitPaymentDeclined,
  emitPaymentLifecycleEvents,
  finalizeApprovedCheckoutPayment,
  logCheckoutFraudDecision,
  reportCheckoutPaymentFailure,
  resolveExistingCheckoutPaymentForIdempotency,
  runApprovedCheckoutPostPaymentEffects,
  transitionCheckoutOrderToApproved,
} from './checkout-payment.lifecycle';
