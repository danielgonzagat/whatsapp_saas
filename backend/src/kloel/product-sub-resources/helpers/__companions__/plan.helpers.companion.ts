import { BadRequestException } from '@nestjs/common';
import { LooseObject, parseNumber, parseObject, removeUndefined, safeStr } from '../common.helpers';

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
