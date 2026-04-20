const MAX_PUBLIC_CHECKOUT_ORDER_QUANTITY = 99;

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
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const rounded = Math.max(1, Math.round(numeric));
  return Math.min(rounded, max);
}

/** Normalize checkout order quantity. */
export function normalizeCheckoutOrderQuantity(value: unknown) {
  return normalizePositiveInteger(value, 1, MAX_PUBLIC_CHECKOUT_ORDER_QUANTITY);
}

/** Calculate physical order unit count. */
export function calculatePhysicalOrderUnitCount(planUnitQuantity: unknown, orderQuantity: unknown) {
  const unitsPerPlan = normalizePositiveInteger(planUnitQuantity, 1, 9999);
  const normalizedOrderQuantity = normalizeCheckoutOrderQuantity(orderQuantity);
  return unitsPerPlan * normalizedOrderQuantity;
}

function normalizeNonNegativeCents(value: number | undefined): number {
  return Math.max(0, Math.round(Number(value || 0)));
}

function dedupeAcceptedBumpIds(acceptedBumpIds: string[] | undefined): string[] {
  return Array.from(
    new Set((acceptedBumpIds || []).map((value) => String(value || '').trim()).filter(Boolean)),
  );
}

function selectAcceptedBumps(
  orderBumps: CheckoutBumpInput[] | undefined,
  acceptedBumpIds: string[],
): CheckoutBumpInput[] {
  return (orderBumps || []).filter((bump) => acceptedBumpIds.includes(bump.id));
}

function sumBumpPriceInCents(selectedBumps: CheckoutBumpInput[]): number {
  return selectedBumps.reduce(
    (total, bump) => total + normalizeNonNegativeCents(bump.priceInCents),
    0,
  );
}

/** Calculate checkout server totals. */
export function calculateCheckoutServerTotals(input: {
  planPriceInCents: number;
  orderQuantity: unknown;
  shippingInCents?: number;
  discountInCents?: number;
  orderBumps?: CheckoutBumpInput[];
  acceptedBumpIds?: string[];
}) {
  const normalizedOrderQuantity = normalizeCheckoutOrderQuantity(input.orderQuantity);
  const normalizedPlanPriceInCents = normalizeNonNegativeCents(input.planPriceInCents);
  const normalizedShippingInCents = normalizeNonNegativeCents(input.shippingInCents);
  const normalizedDiscountInCents = normalizeNonNegativeCents(input.discountInCents);
  const acceptedBumpIds = dedupeAcceptedBumpIds(input.acceptedBumpIds);
  const selectedBumps = selectAcceptedBumps(input.orderBumps, acceptedBumpIds);
  const bumpTotalInCents = sumBumpPriceInCents(selectedBumps);
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
