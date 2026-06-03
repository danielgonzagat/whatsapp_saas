import { Prisma } from '@prisma/client';

/**
 * Pure helpers extracted from `plan.service.ts` (Wave 84). Every export below
 * is a side-effect free transformer over plain values. No Prisma calls, no
 * event emission, no audit. Re-imported by `plan.service.ts`.
 */

export interface PaymentMethodsConfig {
  card?: boolean;
  pix?: boolean;
  boleto?: boolean;
}

export interface ShippingConfig {
  type?: 'FIXED' | 'VARIABLE' | 'FREE' | 'NONE';
  fixedValue?: number;
  originCep?: string;
}

export interface AffiliateConfig {
  visibleToAffiliates?: boolean;
  customCommission?: number;
}

export interface OrderBumpConfig {
  enabled?: boolean;
  bumpProductId?: string;
  bumpPlanId?: string;
  title?: string;
  discountPercent?: number;
}

export interface UpdatePlanDto {
  name?: string;
  price?: number;
  active?: boolean;
  maxInstallments?: number;
  itemsPerPlan?: number;
  billingType?: string;
  visibleToAffiliates?: boolean;
  acceptCoupons?: boolean;
  imageUrl?: string;
}

export interface CreatePlanDto {
  productId: string;
  name: string;
  price: number;
  itemsPerPlan?: number;
  maxInstallments?: number;
  billingType?: string;
  visibleToAffiliates?: boolean;
  acceptCoupons?: boolean;
  imageUrl?: string;
}

/**
 * Coerce an unknown value to a `Prisma.InputJsonObject`. Returns the value
 * verbatim when it is already a non-array object, otherwise returns an empty
 * object. Used to safely seed/merge the polymorphic `checkoutImages` JSON
 * column on `ProductPlan`.
 */
export function checkoutImagesObject(value: unknown): Prisma.InputJsonObject {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  return {};
}

/**
 * Shallow-merge a patch object into the existing `checkoutImages` JSON value,
 * coercing the existing value first so a null/array slot is replaced by an
 * empty object before the patch is applied.
 */
export function checkoutImagesWith(
  current: unknown,
  patch: Prisma.InputJsonObject,
): Prisma.InputJsonObject {
  return { ...checkoutImagesObject(current), ...patch };
}

/**
 * Build the JSON payload for the `checkoutImages.paymentMethods` slot from a
 * `PaymentMethodsConfig`. Only fields that are explicitly set on the config
 * land in the output — undefined entries are omitted so the partial update is
 * non-destructive when merged on top of an existing payment methods config.
 */
export function paymentMethodsJson(
  methods: PaymentMethodsConfig,
): Prisma.InputJsonObject & Record<string, unknown> {
  return {
    ...(methods.card !== undefined ? { card: methods.card } : {}),
    ...(methods.pix !== undefined ? { pix: methods.pix } : {}),
    ...(methods.boleto !== undefined ? { boleto: methods.boleto } : {}),
  };
}

/**
 * Build the JSON payload for the `checkoutImages.shipping` slot from a
 * `ShippingConfig`. Same omit-undefined semantics as `paymentMethodsJson`.
 */
export function shippingConfigJson(
  config: ShippingConfig,
): Prisma.InputJsonObject & Record<string, unknown> {
  return {
    ...(config.type !== undefined ? { type: config.type } : {}),
    ...(config.fixedValue !== undefined ? { fixedValue: config.fixedValue } : {}),
    ...(config.originCep !== undefined ? { originCep: config.originCep } : {}),
  };
}

/**
 * Convert the optional fields of `UpdatePlanDto` into a Prisma update payload.
 * The `checkoutImages` merge slot is only populated when at least one of the
 * `acceptCoupons` / `imageUrl` fields was explicitly provided on the DTO.
 *
 * Returns `null` when no recognised fields were set on the DTO, allowing the
 * caller to short-circuit to a "no changes" response without issuing an
 * update.
 */
export function buildPlanUpdatePatch(
  dto: UpdatePlanDto,
  existingCheckoutImages: unknown,
): { updates: Record<string, unknown>; changes: string[] } | null {
  const updates: Record<string, unknown> = {};
  const checkoutImageUpdates: Prisma.InputJsonObject = {
    ...(dto.acceptCoupons !== undefined ? { acceptCoupons: Boolean(dto.acceptCoupons) } : {}),
    ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
  };

  if (dto.name !== undefined) {
    updates.name = dto.name;
  }
  if (dto.price !== undefined) {
    updates.price = Number(dto.price);
    // Additive money-in-cents dual-write (PRODUCT-PLAN PHASE A). Written
    // alongside `price`; reads/checkout still consume `price` for now.
    updates.priceInCents = planPriceInCents(Number(dto.price));
  }
  if (dto.active !== undefined) {
    updates.active = Boolean(dto.active);
  }
  if (dto.maxInstallments !== undefined) {
    updates.maxInstallments = Number(dto.maxInstallments);
  }
  if (dto.itemsPerPlan !== undefined) {
    updates.itemsPerPlan = Number(dto.itemsPerPlan);
  }
  if (dto.billingType !== undefined) {
    updates.billingType = dto.billingType;
  }
  if (dto.visibleToAffiliates !== undefined) {
    updates.visibleToAffiliates = Boolean(dto.visibleToAffiliates);
  }
  if (Object.keys(checkoutImageUpdates).length > 0) {
    updates.checkoutImages = checkoutImagesWith(existingCheckoutImages, checkoutImageUpdates);
  }

  const changes = Object.keys(updates);
  if (changes.length === 0) {
    return null;
  }

  return { updates, changes };
}

/**
 * Build the JSON payload for the `checkoutImages.orderBump` slot from an
 * `OrderBumpConfig`. Omit-undefined semantics so a partial update merges
 * non-destructively on top of an existing order-bump config.
 */
export function orderBumpConfigJson(
  config: OrderBumpConfig,
): Prisma.InputJsonObject & Record<string, unknown> {
  return {
    ...(config.enabled !== undefined ? { enabled: Boolean(config.enabled) } : {}),
    ...(config.bumpProductId !== undefined ? { bumpProductId: config.bumpProductId } : {}),
    ...(config.bumpPlanId !== undefined ? { bumpPlanId: config.bumpPlanId } : {}),
    ...(config.title !== undefined ? { title: config.title } : {}),
    ...(config.discountPercent !== undefined
      ? { discountPercent: Number(config.discountPercent) }
      : {}),
  };
}

/**
 * Build the Prisma `data` payload + audit details map for `setAffiliateConfig`.
 * Both maps are populated in lockstep: every field that lands in `updates`
 * also lands in `details`, so the audit log mirrors the database write
 * exactly.
 */
export function buildAffiliateConfigPatch(
  config: AffiliateConfig,
  existingCheckoutImages: unknown,
): { updates: Record<string, unknown>; details: Record<string, unknown> } {
  const updates: Record<string, unknown> = {};
  const details: Record<string, unknown> = {};
  if (config.visibleToAffiliates !== undefined) {
    updates.visibleToAffiliates = config.visibleToAffiliates;
    details.visibleToAffiliates = config.visibleToAffiliates;
  }
  if (config.customCommission !== undefined) {
    updates.checkoutImages = checkoutImagesWith(existingCheckoutImages, {
      customCommission: config.customCommission,
    });
    details.customCommission = config.customCommission;
  }

  return { updates, details };
}

/**
 * Convert a plan's `price` field (number or string from Prisma Decimal-ish
 * coercion, or null) into integer cents. Returns `null` when the price is
 * itself null so downstream cognitive-spine payloads can carry the "no price
 * yet" signal forward verbatim.
 */
export function planPriceInCents(price: number | string | null): number | null {
  if (price === null) {
    return null;
  }
  return Math.round(Number(price) * 100);
}

/**
 * Build the `mind.plan.observed` cognitive-spine payload for a freshly
 * created plan.
 */
export function buildPlanObservedPayload(
  plan: { id: string; name: string; price: number | string | null },
  productId: string,
): {
  planId: string;
  name: string;
  priceInCents: number | null;
  productId: string;
} {
  return {
    planId: plan.id,
    name: plan.name,
    priceInCents: planPriceInCents(plan.price),
    productId,
  };
}

/**
 * Build the `plan.updated` cognitive-spine payload for an updated plan,
 * including the list of mutated field names so downstream listeners can
 * differentiate a price bump from a coupon-toggle.
 */
export function buildPlanUpdatedPayload(
  plan: { id: string; name: string; price: number | string | null },
  productId: string,
  changes: string[],
): {
  planId: string;
  name: string;
  priceInCents: number | null;
  productId: string;
  changes: string[];
} {
  return {
    planId: plan.id,
    name: plan.name,
    priceInCents: planPriceInCents(plan.price),
    productId,
    changes,
  };
}
