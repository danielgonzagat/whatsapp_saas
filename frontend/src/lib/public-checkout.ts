import type {
  PixelConfig,
  PublicCheckoutOrderBump,
  PublicCheckoutRecord,
  PublicCheckoutResponse,
  PublicCheckoutTestimonial,
} from './public-checkout-contract';

function asRecord(value: unknown): PublicCheckoutRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as PublicCheckoutRecord;
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function asOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

function readRequiredString(record: PublicCheckoutRecord, key: string, label: string) {
  const value = asString(record[key]).trim();
  if (!value) {
    throw new Error(`Checkout público sem ${label}.`);
  }
  return value;
}

export function normalizePublicCheckoutResponse(input: unknown): PublicCheckoutResponse {
  const record = asRecord(input);
  if (!record) {
    throw new Error('Checkout público com payload inválido.');
  }

  const productRecord = asRecord(record.product);
  if (!productRecord) {
    throw new Error('Checkout público sem produto.');
  }

  const merchantRecord = asRecord(record.merchant);
  const configRecord = asRecord(record.checkoutConfig);
  const providerRecord = asRecord(record.paymentProvider);
  const affiliateRecord = asRecord(record.affiliateContext);

  const productName = readRequiredString(productRecord, 'name', 'nome do produto');
  const brandName =
    asString(configRecord?.brandName).trim() ||
    asString(merchantRecord?.companyName).trim() ||
    asString(merchantRecord?.workspaceName).trim() ||
    productName;

  return {
    id: readRequiredString(record, 'id', 'id'),
    name: readRequiredString(record, 'name', 'nome'),
    slug: readRequiredString(record, 'slug', 'slug'),
    priceInCents: asNumber(record.priceInCents, 0),
    compareAtPrice:
      record.compareAtPrice === undefined ? undefined : asNumber(record.compareAtPrice, 0),
    currency: asOptionalString(record.currency),
    maxInstallments:
      record.maxInstallments === undefined ? undefined : asNumber(record.maxInstallments, 1),
    installmentsFee:
      record.installmentsFee === undefined ? undefined : asBoolean(record.installmentsFee),
    quantity: record.quantity === undefined ? undefined : asNumber(record.quantity, 1),
    freeShipping: record.freeShipping === undefined ? undefined : asBoolean(record.freeShipping),
    shippingPrice:
      record.shippingPrice === undefined ? undefined : asNumber(record.shippingPrice, 0),
    checkoutCode: asOptionalString(record.checkoutCode),
    product: {
      id: readRequiredString(productRecord, 'id', 'id do produto'),
      name: productName,
      description: asOptionalString(productRecord.description),
      imageUrl: asOptionalString(productRecord.imageUrl),
      images: asStringArray(productRecord.images),
      workspaceId: asOptionalString(productRecord.workspaceId),
    },
    merchant: merchantRecord
      ? {
          workspaceId: asOptionalString(merchantRecord.workspaceId),
          workspaceName: asOptionalString(merchantRecord.workspaceName),
          companyName: asOptionalString(merchantRecord.companyName),
          brandLogo: asOptionalString(merchantRecord.brandLogo) || null,
          customDomain: asOptionalString(merchantRecord.customDomain) || null,
          cnpj: asOptionalString(merchantRecord.cnpj) || null,
          addressLine: asOptionalString(merchantRecord.addressLine) || null,
        }
      : undefined,
    checkoutConfig: configRecord
      ? {
          theme: configRecord.theme === 'NOIR' ? 'NOIR' : 'BLANC',
          accentColor: asOptionalString(configRecord.accentColor),
          accentColor2: asOptionalString(configRecord.accentColor2),
          backgroundColor: asOptionalString(configRecord.backgroundColor),
          cardColor: asOptionalString(configRecord.cardColor),
          textColor: asOptionalString(configRecord.textColor),
          mutedTextColor: asOptionalString(configRecord.mutedTextColor),
          fontBody: asOptionalString(configRecord.fontBody),
          fontDisplay: asOptionalString(configRecord.fontDisplay),
          brandName,
          brandLogo: asOptionalString(configRecord.brandLogo),
          headerMessage: asOptionalString(configRecord.headerMessage),
          headerSubMessage: asOptionalString(configRecord.headerSubMessage),
          productImage: asOptionalString(configRecord.productImage),
          productDisplayName: asOptionalString(configRecord.productDisplayName),
          btnStep1Text: asOptionalString(configRecord.btnStep1Text),
          btnStep2Text: asOptionalString(configRecord.btnStep2Text),
          btnFinalizeText: asOptionalString(configRecord.btnFinalizeText),
          btnFinalizeIcon: asOptionalString(configRecord.btnFinalizeIcon),
          requireCPF:
            configRecord.requireCPF === undefined ? undefined : asBoolean(configRecord.requireCPF),
          requirePhone:
            configRecord.requirePhone === undefined
              ? undefined
              : asBoolean(configRecord.requirePhone),
          phoneLabel: asOptionalString(configRecord.phoneLabel),
          enableCreditCard:
            configRecord.enableCreditCard === undefined
              ? undefined
              : asBoolean(configRecord.enableCreditCard),
          enablePix:
            configRecord.enablePix === undefined ? undefined : asBoolean(configRecord.enablePix),
          enableBoleto:
            configRecord.enableBoleto === undefined
              ? undefined
              : asBoolean(configRecord.enableBoleto),
          enableCoupon:
            configRecord.enableCoupon === undefined
              ? undefined
              : asBoolean(configRecord.enableCoupon),
          showCouponPopup:
            configRecord.showCouponPopup === undefined
              ? undefined
              : asBoolean(configRecord.showCouponPopup),
          couponPopupDelay:
            configRecord.couponPopupDelay === undefined
              ? undefined
              : asNumber(configRecord.couponPopupDelay, 0),
          couponPopupTitle: asOptionalString(configRecord.couponPopupTitle),
          couponPopupDesc: asOptionalString(configRecord.couponPopupDesc),
          couponPopupBtnText: asOptionalString(configRecord.couponPopupBtnText),
          couponPopupDismiss: asOptionalString(configRecord.couponPopupDismiss),
          autoCouponCode: asOptionalString(configRecord.autoCouponCode),
          enableTimer:
            configRecord.enableTimer === undefined
              ? undefined
              : asBoolean(configRecord.enableTimer),
          timerType:
            configRecord.timerType === 'EXPIRATION'
              ? 'EXPIRATION'
              : configRecord.timerType === 'COUNTDOWN'
                ? 'COUNTDOWN'
                : undefined,
          timerMinutes:
            configRecord.timerMinutes === undefined
              ? undefined
              : asNumber(configRecord.timerMinutes, 0),
          timerMessage: asOptionalString(configRecord.timerMessage),
          timerExpiredMessage: asOptionalString(configRecord.timerExpiredMessage),
          timerPosition: asOptionalString(configRecord.timerPosition),
          shippingMode:
            configRecord.shippingMode === 'VARIABLE'
              ? 'VARIABLE'
              : configRecord.shippingMode === 'FIXED'
                ? 'FIXED'
                : configRecord.shippingMode === 'FREE'
                  ? 'FREE'
                  : undefined,
          shippingOriginZip: asOptionalString(configRecord.shippingOriginZip),
          shippingVariableMinInCents:
            configRecord.shippingVariableMinInCents === undefined
              ? undefined
              : asNumber(configRecord.shippingVariableMinInCents, 0),
          shippingVariableMaxInCents:
            configRecord.shippingVariableMaxInCents === undefined
              ? undefined
              : asNumber(configRecord.shippingVariableMaxInCents, 0),
          shippingUseKloelCalculator:
            configRecord.shippingUseKloelCalculator === undefined
              ? undefined
              : asBoolean(configRecord.shippingUseKloelCalculator),
          affiliateCustomCommissionEnabled:
            configRecord.affiliateCustomCommissionEnabled === undefined
              ? undefined
              : asBoolean(configRecord.affiliateCustomCommissionEnabled),
          affiliateCustomCommissionType:
            configRecord.affiliateCustomCommissionType === 'AMOUNT'
              ? 'AMOUNT'
              : configRecord.affiliateCustomCommissionType === 'PERCENT'
                ? 'PERCENT'
                : undefined,
          affiliateCustomCommissionAmountInCents:
            configRecord.affiliateCustomCommissionAmountInCents === undefined
              ? undefined
              : asNumber(configRecord.affiliateCustomCommissionAmountInCents, 0),
          affiliateCustomCommissionPercent:
            configRecord.affiliateCustomCommissionPercent === undefined
              ? undefined
              : asNumber(configRecord.affiliateCustomCommissionPercent, 0),
          enableExitIntent:
            configRecord.enableExitIntent === undefined
              ? undefined
              : asBoolean(configRecord.enableExitIntent),
          exitIntentTitle: asOptionalString(configRecord.exitIntentTitle),
          exitIntentDescription: asOptionalString(configRecord.exitIntentDescription),
          exitIntentCouponCode: asOptionalString(configRecord.exitIntentCouponCode),
          enableFloatingBar:
            configRecord.enableFloatingBar === undefined
              ? undefined
              : asBoolean(configRecord.enableFloatingBar),
          floatingBarMessage: asOptionalString(configRecord.floatingBarMessage),
          enableTestimonials:
            configRecord.enableTestimonials === undefined
              ? undefined
              : asBoolean(configRecord.enableTestimonials),
          testimonials: Array.isArray(configRecord.testimonials)
            ? configRecord.testimonials
                .map<PublicCheckoutTestimonial | null>((entry) => {
                  const testimonial = asRecord(entry);
                  if (!testimonial) return null;
                  const name = asString(testimonial.name).trim();
                  const text = asString(testimonial.text).trim();
                  if (!name || !text) return null;
                  return {
                    name,
                    text,
                    rating: asNumber(testimonial.rating, 5),
                    avatar: asOptionalString(testimonial.avatar),
                  };
                })
                .filter(isPresent)
            : undefined,
          enableGuarantee:
            configRecord.enableGuarantee === undefined
              ? undefined
              : asBoolean(configRecord.enableGuarantee),
          guaranteeTitle: asOptionalString(configRecord.guaranteeTitle),
          guaranteeText: asOptionalString(configRecord.guaranteeText),
          guaranteeDays:
            configRecord.guaranteeDays === undefined
              ? undefined
              : asNumber(configRecord.guaranteeDays, 0),
          enableTrustBadges:
            configRecord.enableTrustBadges === undefined
              ? undefined
              : asBoolean(configRecord.enableTrustBadges),
          trustBadges: asStringArray(configRecord.trustBadges),
          footerText: asOptionalString(configRecord.footerText),
          showPaymentIcons:
            configRecord.showPaymentIcons === undefined
              ? undefined
              : asBoolean(configRecord.showPaymentIcons),
          pixels: Array.isArray(configRecord.pixels)
            ? (configRecord.pixels.filter(Boolean) as PixelConfig[])
            : undefined,
        }
      : undefined,
    orderBumps: Array.isArray(record.orderBumps)
      ? record.orderBumps
          .map<PublicCheckoutOrderBump | null>((entry) => {
            const bump = asRecord(entry);
            if (!bump) return null;
            const id = asString(bump.id).trim();
            const title = asString(bump.title).trim();
            if (!id || !title) return null;
            return {
              id,
              title,
              description: asString(bump.description),
              productName: asString(bump.productName),
              image: asOptionalString(bump.image),
              priceInCents: asNumber(bump.priceInCents, 0),
              compareAtPrice:
                bump.compareAtPrice === undefined ? undefined : asNumber(bump.compareAtPrice, 0),
              highlightColor: asOptionalString(bump.highlightColor),
              checkboxLabel: asOptionalString(bump.checkboxLabel),
            };
          })
          .filter(isPresent)
      : undefined,
    paymentProvider: providerRecord
      ? {
          provider: 'mercado_pago',
          connected: asBoolean(providerRecord.connected),
          checkoutEnabled: asBoolean(providerRecord.checkoutEnabled),
          publicKey: asOptionalString(providerRecord.publicKey) || null,
          unavailableReason: asOptionalString(providerRecord.unavailableReason) || null,
          marketplaceFeePercent:
            providerRecord.marketplaceFeePercent === undefined
              ? undefined
              : asNumber(providerRecord.marketplaceFeePercent, 0),
          installmentInterestMonthlyPercent:
            providerRecord.installmentInterestMonthlyPercent === undefined
              ? undefined
              : asNumber(providerRecord.installmentInterestMonthlyPercent, 0),
          availablePaymentMethodIds: asStringArray(providerRecord.availablePaymentMethodIds),
          availablePaymentMethodTypes: asStringArray(providerRecord.availablePaymentMethodTypes),
          supportsCreditCard:
            providerRecord.supportsCreditCard === undefined
              ? undefined
              : asBoolean(providerRecord.supportsCreditCard),
          supportsPix:
            providerRecord.supportsPix === undefined
              ? undefined
              : asBoolean(providerRecord.supportsPix),
          supportsBoleto:
            providerRecord.supportsBoleto === undefined
              ? undefined
              : asBoolean(providerRecord.supportsBoleto),
        }
      : undefined,
    affiliateContext: affiliateRecord
      ? {
          affiliateLinkId: asOptionalString(affiliateRecord.affiliateLinkId),
          affiliateWorkspaceId: asOptionalString(affiliateRecord.affiliateWorkspaceId),
          affiliateProductId: asOptionalString(affiliateRecord.affiliateProductId),
          affiliateCode: asOptionalString(affiliateRecord.affiliateCode),
          commissionPct:
            affiliateRecord.commissionPct === undefined
              ? undefined
              : asNumber(affiliateRecord.commissionPct, 0),
        }
      : null,
  };
}
