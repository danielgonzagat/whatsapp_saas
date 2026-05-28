/**
 * Pure helpers extracted from {@link SalesService} so they can be unit-tested
 * in isolation without instantiating the Nest module. No side effects, no
 * dependency on Prisma/Stripe/MP/audit/spine — only the inputs they receive.
 *
 * This file is a barrel: every helper lives in a per-domain sibling module
 * ({@link ./sales.helpers.shared}, {@link ./sales.helpers.pix},
 * {@link ./sales.helpers.boleto}, {@link ./sales.helpers.stripe}) and is
 * re-exported here so consumers keep a single, stable import surface
 * (`./sales.helpers`).
 */

export {
  BOLETO_EXPIRATION_DAYS,
  MP_WEBHOOK_PATH,
  PIX_EXPIRATION_MINUTES,
  SALES_PROCESSOR,
  SALES_PROCESSOR_VERSION,
  SALES_PROVENANCE,
  SALES_SCHEMA_VERSION,
  buildKloelSaleCreateData,
  buildMercadoPagoNotificationUrl,
  buildPaymentPendingAuditDetails,
  buildPaymentPendingPayload,
  buildSaleBuyerMetadata,
  buildSaleCreatedAuditDetails,
  buildSaleCreatedPayload,
  buildSaleDescription,
  buildSaleEventPair,
  buildSaleSuccessLogMessage,
  buildSpineSaleEnvelope,
  computeBoletoExpiresAt,
  computePixExpiresAt,
  pickSaleBuyerMetadataInput,
  planPriceToCents,
  planPriceToCentsNumber,
  resolveBackendOrigin,
  resolveFrontendOrigin,
  sanitizeDocumentDigits,
} from './sales.helpers.shared';
export type {
  KloelSaleCreateDataInput,
  PaymentPendingAuditDetailsInput,
  PaymentPendingPayloadInput,
  SaleBuyerMetadataInput,
  SaleCreatedAuditDetailsInput,
  SaleCreatedPayloadInput,
  SaleEventPairInput,
  SaleSuccessLogInput,
  SalesPaymentMethod,
  SpineSaleEnvelopeInput,
} from './sales.helpers.shared';

export { buildPixOrderResult, buildPixSaleUpdateMetadata } from './sales.helpers.pix';
export type { PixOrderResultInput } from './sales.helpers.pix';

export {
  buildBoletoAddressMetadata,
  buildBoletoOrderResult,
  buildBoletoSaleCreateMetadata,
  buildBoletoSaleUpdateMetadata,
} from './sales.helpers.boleto';
export type { BoletoOrderResultInput, BoletoUpdateMetadataInput } from './sales.helpers.boleto';

export {
  buildStripeCardLinkResult,
  buildStripeCheckoutLineItems,
  buildStripeCheckoutSessionInput,
  buildStripeCheckoutUrls,
  buildStripePaymentIntentMetadata,
  buildStripeSaleUpdateMetadata,
  buildStripeSessionMetadata,
  pickStripeExternalPaymentId,
} from './sales.helpers.stripe';
export type {
  BuildStripeCheckoutSessionInputArgs,
  StripeCardLinkResultInput,
  StripeCheckoutSessionInput,
  StripeSessionMetadataInput,
} from './sales.helpers.stripe';
