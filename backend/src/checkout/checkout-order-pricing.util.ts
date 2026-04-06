export const MAX_PUBLIC_CHECKOUT_ORDER_QUANTITY = 99;

type CheckoutBumpInput = {
  id: string;
  priceInCents: number;
};

function normalizePositiveInteger(
  value: unknown,
  fallback = 1,
  max = MAX_PUBLIC_CHECKOUT_ORDER_QUANTITY,
) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  const rounded = Math.max(1, Math.round(numeric));
  return Math.min(rounded, max);
}

export function normalizeCheckoutOrderQuantity(value: unknown) {
  return normalizePositiveInteger(value, 1, MAX_PUBLIC_CHECKOUT_ORDER_QUANTITY);
}

export function calculatePhysicalOrderUnitCount(planUnitQuantity: unknown, orderQuantity: unknown) {
  const unitsPerPlan = normalizePositiveInteger(planUnitQuantity, 1, 9999);
  const normalizedOrderQuantity = normalizeCheckoutOrderQuantity(orderQuantity);
  return unitsPerPlan * normalizedOrderQuantity;
}

export function calculateCheckoutServerTotals(input: {
  planPriceInCents: number;
  orderQuantity: unknown;
  shippingInCents?: number;
  discountInCents?: number;
  orderBumps?: CheckoutBumpInput[];
  acceptedBumpIds?: string[];
}) {
  const normalizedOrderQuantity = normalizeCheckoutOrderQuantity(input.orderQuantity);
  const normalizedPlanPriceInCents = Math.max(0, Math.round(Number(input.planPriceInCents || 0)));
  const normalizedShippingInCents = Math.max(0, Math.round(Number(input.shippingInCents || 0)));
  const normalizedDiscountInCents = Math.max(0, Math.round(Number(input.discountInCents || 0)));
  const acceptedBumpIds = Array.from(
    new Set(
      (input.acceptedBumpIds || []).map((value) => String(value || '').trim()).filter(Boolean),
    ),
  );

  const selectedBumps = (input.orderBumps || []).filter((bump) =>
    acceptedBumpIds.includes(bump.id),
  );
  const bumpTotalInCents = selectedBumps.reduce(
    (total, bump) => total + Math.max(0, Math.round(Number(bump.priceInCents || 0))),
    0,
  );
  const subtotalInCents = normalizedPlanPriceInCents * normalizedOrderQuantity;
  const totalInCents = Math.max(
    0,
    subtotalInCents + normalizedShippingInCents + bumpTotalInCents - normalizedDiscountInCents,
  );

  return {
    orderQuantity: normalizedOrderQuantity,
    acceptedBumpIds,
    selectedBumps,
    subtotalInCents,
    shippingInCents: normalizedShippingInCents,
    discountInCents: normalizedDiscountInCents,
    bumpTotalInCents,
    totalInCents,
  };
}
