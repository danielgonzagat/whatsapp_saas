// Pure helpers extracted from products/new/page.tsx to reduce cyclomatic
// complexity on handleSave. Behaviour is byte-identical to the original
// inline implementation.

export interface ProductFormState {
  /** Name property. */
  name: string;
  /** Description property. */
  description: string;
  /** Category property. */
  category: string;
  /** Tags property. */
  tags: string[];
  /** Format property. */
  format: 'PHYSICAL' | 'DIGITAL' | 'HYBRID';
  /** Image url property. */
  imageUrl: string;
  /** Price property. */
  price: string;
  /** Payment type property. */
  paymentType: 'ONE_TIME' | 'SUBSCRIPTION' | 'INSTALLMENT';
  /** Affiliate commission property. */
  affiliateCommission: string;
  /** Sales page url property. */
  salesPageUrl: string;
  /** Guarantee days property. */
  guaranteeDays: string;
  /** Checkout type property. */
  checkoutType: 'standard' | 'conversational';
  /** Facebook pixel id property. */
  facebookPixelId: string;
  /** Google tag manager id property. */
  googleTagManagerId: string;
  /** Package type property. */
  packageType: string;
  /** Width property. */
  width: string;
  /** Height property. */
  height: string;
  /** Depth property. */
  depth: string;
  /** Weight property. */
  weight: string;
  /** Shipping responsible property. */
  shippingResponsible: 'producer' | 'supplier' | 'fulfillment' | 'dropshipping';
  /** Dispatch time property. */
  dispatchTime: string;
  /** Carriers property. */
  carriers: string[];
  /** Affiliates enabled property. */
  affiliatesEnabled: boolean;
  /** Affiliate commission percent property. */
  affiliateCommissionPercent: string;
  /** Affiliate approval mode property. */
  affiliateApprovalMode: 'auto' | 'manual';
  /** Billing type property. */
  billingType: 'one_time' | 'recurring' | 'free';
  /** Max installments property. */
  maxInstallments: string;
  /** Interest free installments property. */
  interestFreeInstallments: string;
}

function parseNumberOrFallback(input: string, fallback: number): number {
  const value = Number.parseFloat(input);
  return Number.isFinite(value) ? value : fallback;
}

function parseIntOrFallback(input: string, fallback: number): number {
  const value = Number.parseInt(input, 10);
  return Number.isFinite(value) ? value : fallback;
}

function parseOptionalFloat(input: string): number | undefined {
  const value = Number.parseFloat(input);
  return Number.isFinite(value) ? value : undefined;
}

/** Build product create payload. */
export function buildProductCreatePayload(
  form: ProductFormState,
  workspaceId: string,
  needsPhysical: boolean,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    workspaceId,
    name: form.name.trim(),
    description: form.description,
    category: form.category,
    tags: form.tags,
    format: form.format,
    imageUrl: form.imageUrl || undefined,
    price: parseNumberOrFallback(form.price, 0),
    paymentType: form.paymentType,
    affiliateCommission: parseNumberOrFallback(form.affiliateCommission, 0),
    salesPageUrl: form.salesPageUrl || undefined,
    guaranteeDays: parseIntOrFallback(form.guaranteeDays, 30),
    checkoutType: form.checkoutType,
    facebookPixelId: form.facebookPixelId || undefined,
    googleTagManagerId: form.googleTagManagerId || undefined,
    affiliatesEnabled: form.affiliatesEnabled,
    affiliateCommissionPercent: parseNumberOrFallback(form.affiliateCommissionPercent, 0),
    affiliateApprovalMode: form.affiliateApprovalMode,
    billingType: form.billingType,
    maxInstallments: parseIntOrFallback(form.maxInstallments, 12),
    interestFreeInstallments: parseIntOrFallback(form.interestFreeInstallments, 1),
    status: 'PENDING',
  };

  if (!needsPhysical) {
    return base;
  }

  return {
    ...base,
    packageType: form.packageType || undefined,
    width: parseOptionalFloat(form.width),
    height: parseOptionalFloat(form.height),
    depth: parseOptionalFloat(form.depth),
    weight: parseOptionalFloat(form.weight),
    shippingResponsible: form.shippingResponsible,
    dispatchTime: parseIntOrFallback(form.dispatchTime, 3),
    carriers: form.carriers,
  };
}

/** Extract created product id. */
export function extractCreatedProductId(
  response: Record<string, unknown> | null,
): string | undefined {
  if (!response) {
    return undefined;
  }
  const productField =
    typeof response === 'object' && 'product' in response
      ? (response.product as Record<string, unknown> | null)
      : null;
  const created = productField || response;
  if (!created || typeof created !== 'object') {
    return undefined;
  }
  return 'id' in created ? ((created as { id?: unknown }).id as string | undefined) : undefined;
}
