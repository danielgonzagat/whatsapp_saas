/**
 * Pure helpers extracted from `wallet.service.ts` so the service stays focused
 * on orchestration. Anything that touches Prisma, Stripe, MercadoPago, or
 * NestJS DI stays in the service; only side-effect-free
 * parsing/formatting/derivation lives here.
 *
 * Hard rule: NO money arithmetic in this file. Helpers may inspect amounts,
 * normalize sign (`absAmountCents`), or format strings, but never combine two
 * money operands into a third value — that stays inside the Prisma
 * transaction in the service so the audit trail and atomicity are obvious.
 *
 * This file is a barrel: every helper lives in a per-domain sibling module
 * ({@link ./wallet.service.helpers.shared},
 * {@link ./wallet.service.helpers.audit},
 * {@link ./wallet.service.helpers.stripe},
 * {@link ./wallet.service.helpers.mp}) and is re-exported here so consumers
 * keep a single, stable import surface (`./wallet.service.helpers`).
 */

export {
  DEFAULT_BACKEND_ORIGIN,
  MP_WEBHOOK_PATH,
  PIX_EXPIRATION_MINUTES,
  WALLET_MERCADOPAGO_REFERENCE_TYPE,
  WALLET_TX_OPTIONS,
  absAmountCents,
  assertExclusivePricingBasis,
  assertNonNegativeActualCost,
  assertPositiveTopupAmount,
  assertValidQuotedCost,
  assertValidUsageUnits,
  buildExistingTxQuery,
  buildFraudGateUserMessage,
  buildFraudGateWarningMessage,
  buildFraudReasonsLog,
  buildIdempotentChargeUsageResult,
  buildRefundCompensationTxData,
  buildRefundReferenceType,
  buildSettlementAdjustmentTxData,
  buildSettlementReferenceType,
  buildUsageDebitTxData,
  buildUsageReferenceType,
  classifyTopupFraudDecision,
  resolveBackendOrigin,
} from './wallet.service.helpers.shared';

export {
  buildInsufficientBalanceReport,
  buildRefundMetadata,
  buildSettlementMetadata,
  buildUsageMetadata,
} from './wallet.service.helpers.audit';

export {
  buildStripeTopupCreditTxData,
  buildStripeTopupIntentParams,
  buildStripeTopupMetadata,
  buildStripeTopupTransactionMetadata,
  buildWalletNotFoundOnStripeWebhookReport,
  extractStripeTopupWalletId,
  isValidStripeTopupPaymentIntent,
  shapeStripeIntentResult,
} from './wallet.service.helpers.stripe';

export {
  buildMercadoPagoTopupCreditTxData,
  buildMercadoPagoTopupTransactionMetadata,
  buildPixTopupChargeRequest,
  buildWalletNotFoundOnMercadoPagoWebhookReport,
  formatMercadoPagoQrImage,
  normalizePayerDocument,
  parseMercadoPagoWalletReference,
  readMercadoPagoTransactionAmountCents,
  shapePixTopupResult,
} from './wallet.service.helpers.mp';
