import { BadRequestException } from '@nestjs/common';
import {
  LooseObject,
  parseNumber,
  parseObject,
  pickRecordOrUndefined,
  removeUndefined,
  safeStr,
  slugifyPlan,
} from './common.helpers';

export function buildPlanExtraConfig(body: LooseObject, current: LooseObject) {
  const next = { ...current };
  const patches: LooseObject = {
    imageUrl: body.imageUrl,
    redirectUrl: body.redirectUrl,
    freeSample: body.freeSample,
    requireEmail: body.requireEmail,
    requireEmailConfirm: body.requireEmailConfirm,
    requireAddress: body.requireAddress,
    limitSales: body.limitSales,
    salesLimit: parseNumber(body.salesLimit),
    limitPerApproved: body.limitPerApproved,
    approvedLimit: parseNumber(body.approvedLimit),
    minStock: body.minStock,
    stockMin: parseNumber(body.stockMin),
    notifyBoleto: body.notifyBoleto,
    limitedBilling: body.limitedBilling,
    affiliateRecurring: body.affiliateRecurring,
    boletoInstallment: body.boletoInstallment,
    boletoInstallments: parseNumber(body.boletoInstallments),
    boletoInterest: body.boletoInterest,
    paymentMethods:
      body.paymentMethods && typeof body.paymentMethods === 'object'
        ? body.paymentMethods
        : undefined,
  };

  for (const [key, entry] of Object.entries(patches)) {
    if (entry !== undefined) {
      next[key] = entry;
    }
  }

  return next;
}

export function buildPackagingConfig(body: LooseObject, current: LooseObject) {
  const next = { ...current };
  const rawDimensions = parseObject(body.dimensions);
  const dimensions =
    body.dimensions && typeof body.dimensions === 'object'
      ? removeUndefined({
          width: parseNumber(rawDimensions.width),
          height: parseNumber(rawDimensions.height),
          length: parseNumber(rawDimensions.length),
        })
      : undefined;

  const patches: LooseObject = {
    packageType: body.packageType,
    dimensions,
    weight: parseNumber(body.weight),
  };

  for (const [key, entry] of Object.entries(patches)) {
    if (entry !== undefined) {
      next[key] = entry;
    }
  }

  return next;
}

function pickRequestedFreightType(body: LooseObject): string | undefined {
  if (typeof body.freightType === 'string') {
    return body.freightType;
  }
  if (typeof body.shippingCost === 'string') {
    return body.shippingCost;
  }
  return undefined;
}

function resolveFreightType(body: LooseObject, current: LooseObject): string | undefined {
  if (body.freeShipping === true) {
    return 'free';
  }
  const requested = pickRequestedFreightType(body);
  if (requested !== undefined) {
    return requested;
  }
  if (body.freeShipping === false) {
    return current.freightType === 'free' ? 'calculated' : safeStr(current.freightType);
  }
  return undefined;
}

function buildShippingPatches(
  body: LooseObject,
  freightType: string | undefined,
  shippingCostNumber: number | undefined,
): LooseObject {
  return {
    shipper: body.shipper ?? body.whoShips,
    shipFrom: body.shipFrom,
    dispatchTime: body.dispatchTime,
    carriers: Array.isArray(body.carriers) ? body.carriers : undefined,
    freightType,
    fixedFreight: shippingCostNumber,
    tracking: body.tracking,
    regionPrazos: pickRecordOrUndefined(body.regionPrazos),
    faqAnswers: pickRecordOrUndefined(body.faqAnswers),
  };
}

function applyDefinedPatches(target: LooseObject, patches: LooseObject) {
  for (const [key, entry] of Object.entries(patches)) {
    if (entry !== undefined) {
      target[key] = entry;
    }
  }
}

export function buildShippingConfig(body: LooseObject, current: LooseObject) {
  const next = { ...current };
  const freightType = resolveFreightType(body, current);
  const fixedFreight = parseNumber(body.fixedFreight) ?? parseNumber(body.shippingPrice);
  const shippingCostNumber = fixedFreight ?? parseNumber(body.shippingCost);
  const patches = buildShippingPatches(body, freightType, shippingCostNumber);
  applyDefinedPatches(next, patches);
  return next;
}

function resolvePlanPrice(body: LooseObject): number | undefined {
  const direct = parseNumber(body.price);
  if (direct !== undefined) {
    return direct;
  }
  const cents = parseNumber(body.priceInCents);
  if (cents === undefined) {
    return undefined;
  }
  return Number(cents / 100);
}

function resolveVisibleToAffiliates(body: LooseObject): unknown {
  if (body.visibleToAffiliates !== undefined) {
    return body.visibleToAffiliates;
  }
  if (body.hideAffiliates === undefined) {
    return undefined;
  }
  return !body.hideAffiliates;
}

export function buildPlanData(body: LooseObject, current?: LooseObject) {
  const currentExtra = parseObject(current?.checkoutImages);
  const currentPackaging = parseObject(current?.packagingConfig);
  const currentShipping = parseObject(current?.shippingConfig);

  const price = resolvePlanPrice(body);
  const itemsPerPlan =
    parseNumber(body.itemsPerPlan) ?? parseNumber(body.quantity) ?? parseNumber(body.items);
  const active = body.active ?? body.isActive ?? body.available;
  const visibleToAffiliates = resolveVisibleToAffiliates(body);
  const maxNoInterest =
    parseNumber(body.maxNoInterest) ?? parseNumber(body.interestFreeInstallments);
  const recurringInterval = body.recurringInterval ?? body.subscriptionPeriod;

  return removeUndefined({
    name: body.name,
    price,
    billingType: body.billingType,
    itemsPerPlan,
    maxInstallments: parseNumber(body.maxInstallments),
    maxNoInterest,
    discountByPayment: body.discountByPayment,
    recurringInterval,
    trialEnabled: body.trialEnabled,
    trialDays: parseNumber(body.trialDays),
    trialPrice: parseNumber(body.trialPrice),
    visibleToAffiliates,
    active,
    orderBumpPlanId: body.orderBumpPlanId,
    orderBumpText: body.orderBumpText,
    termsUrl: body.termsUrl,
    thankyouUrl: body.thankyouUrl,
    thankyouBoletoUrl: body.thankyouBoletoUrl,
    thankyouPixUrl: body.thankyouPixUrl,
    checkoutImages: buildPlanExtraConfig(body, currentExtra),
    packagingConfig: buildPackagingConfig(body, currentPackaging),
    shippingConfig: buildShippingConfig(body, currentShipping),
  });
}

function serializePlanIdentity(plan: LooseObject) {
  const planName = safeStr(plan.name);
  const planId = safeStr(plan.id);
  const upperRef = safeStr(plan.referenceCode).trim().toUpperCase();
  return {
    slug: slugifyPlan(planName, planId),
    referenceCode: upperRef || planId.slice(0, 8).toUpperCase(),
    priceInCents: Math.round(Number(plan.price || 0) * 100),
    quantity: plan.itemsPerPlan,
    items: plan.itemsPerPlan,
    isActive: plan.active,
    available: plan.active,
    hideAffiliates: !plan.visibleToAffiliates,
    interestFreeInstallments: plan.maxNoInterest,
    subscriptionPeriod: plan.recurringInterval,
  };
}

function isFreeShipping(shipping: LooseObject, freightType: string): boolean {
  return freightType.toLowerCase() === 'free' || shipping.freeShipping === true;
}

function serializePlanShipping(shipping: LooseObject, freightType: string) {
  const carriers = Array.isArray(shipping.carriers) ? shipping.carriers : [];
  return {
    freeShipping: isFreeShipping(shipping, freightType),
    shippingPrice: shipping.fixedFreight ?? shipping.shippingValue ?? null,
    whoShips: shipping.shipper || '',
    shipper: shipping.shipper || '',
    shipFrom: shipping.shipFrom || '',
    dispatchTime: shipping.dispatchTime || '',
    carriers,
    freightType,
    fixedFreight: shipping.fixedFreight ?? '',
    tracking: shipping.tracking || '',
    regionPrazos: shipping.regionPrazos || {},
    faqAnswers: shipping.faqAnswers || {},
  };
}

function serializePlanPackaging(packaging: LooseObject) {
  return {
    packageType: packaging.packageType || '',
    dimensions: packaging.dimensions || {},
    weight: packaging.weight ?? '',
  };
}

const PLAN_CHECKOUT_FLAG_DEFAULTS: LooseObject = {
  imageUrl: null,
  redirectUrl: '',
  freeSample: false,
  requireEmail: true,
  requireEmailConfirm: false,
  requireAddress: false,
  limitSales: false,
  salesLimit: '',
  limitPerApproved: false,
  approvedLimit: '',
  minStock: false,
  stockMin: '',
  notifyBoleto: true,
  limitedBilling: false,
  affiliateRecurring: true,
  boletoInstallment: false,
  boletoInstallments: '',
  boletoInterest: false,
};

const DEFAULT_PAYMENT_METHODS = Object.freeze({
  credit: true,
  boleto: true,
  pix: true,
});

const PLAN_CHECKOUT_FLAGS_USING_OR = new Set(['imageUrl', 'redirectUrl']);

function resolvePlanCheckoutFlag(extra: LooseObject, key: string, fallback: unknown): unknown {
  const value = extra[key];
  // `imageUrl` and `redirectUrl` treat empty string as "no value"; others only coalesce null/undefined.
  return PLAN_CHECKOUT_FLAGS_USING_OR.has(key) ? value || fallback : (value ?? fallback);
}

function serializePlanCheckoutFlags(extra: LooseObject) {
  const flags: LooseObject = {};
  for (const [key, fallback] of Object.entries(PLAN_CHECKOUT_FLAG_DEFAULTS)) {
    flags[key] = resolvePlanCheckoutFlag(extra, key, fallback);
  }
  flags.paymentMethods = extra.paymentMethods || DEFAULT_PAYMENT_METHODS;
  return flags;
}

export function serializePlan(plan: LooseObject) {
  const extra = parseObject(plan.checkoutImages);
  const packaging = parseObject(plan.packagingConfig);
  const shipping = parseObject(plan.shippingConfig);
  const freightType = typeof shipping.freightType === 'string' ? shipping.freightType : '';

  return {
    ...plan,
    ...serializePlanIdentity(plan),
    ...serializePlanShipping(shipping, freightType),
    ...serializePlanPackaging(packaging),
    ...serializePlanCheckoutFlags(extra),
  };
}

export function buildCheckoutData(body: LooseObject, current?: LooseObject) {
  const currentConfig = parseObject(current?.config);
  const configInput = body.config && typeof body.config === 'object' ? body.config : {};
  const flatConfig = removeUndefined({
    theme: body.theme,
    headerText: body.headerText,
    ctaText: body.ctaText,
    showTimer: body.showTimer,
    showTestimonials: body.showTestimonials,
    brandName: body.brandName,
    enableCreditCard: body.enableCreditCard,
    enablePix: body.enablePix,
    enableBoleto: body.enableBoleto,
    enableCoupon: body.enableCoupon,
    autoCouponCode: body.autoCouponCode,
    enableTimer: body.enableTimer,
    timerMinutes: parseNumber(body.timerMinutes),
    timerMessage: body.timerMessage,
    accentColor: body.accentColor,
    backgroundColor: body.backgroundColor,
    btnFinalizeText: body.btnFinalizeText,
    enableTestimonials: body.enableTestimonials,
    enableGuarantee: body.enableGuarantee,
    showCouponPopup: body.showCouponPopup,
  });

  return removeUndefined({
    name: body.name ?? body.brandName,
    active: body.active,
    config: {
      ...currentConfig,
      ...configInput,
      ...flatConfig,
    },
  });
}

export function serializeCheckout(checkout: LooseObject) {
  const config = parseObject(checkout.config);

  return {
    ...checkout,
    ...config,
    config,
  };
}

export function buildCouponData(body: LooseObject) {
  const rawType = typeof body.discountType === 'string' ? body.discountType.toUpperCase() : '';
  const discountType =
    rawType === 'FIXED' || rawType === 'PERCENT'
      ? rawType
      : parseNumber(body.discountFixed) !== undefined
        ? 'FIXED'
        : 'PERCENT';
  const discountValue =
    parseNumber(body.discountValue) ??
    parseNumber(body.discountFixed) ??
    parseNumber(body.discountPercent);

  if (!body.code || discountValue === undefined) {
    throw new BadRequestException('Código e valor do cupom são obrigatórios');
  }

  return removeUndefined({
    code: safeStr(body.code).trim().toUpperCase(),
    discountType,
    discountValue,
    maxUses: parseNumber(body.maxUses),
    expiresAt: body.expiresAt ? new Date(safeStr(body.expiresAt)) : undefined,
    active: body.active,
  });
}

export function serializeCoupon(coupon: LooseObject) {
  return {
    ...coupon,
    discountPercent: coupon.discountType === 'PERCENT' ? coupon.discountValue : 0,
    discountFixed: coupon.discountType === 'FIXED' ? coupon.discountValue : 0,
  };
}

export function serializeReview(review: LooseObject) {
  return {
    ...review,
    name: review.authorName || 'Anônimo',
    text: review.comment || '',
  };
}
