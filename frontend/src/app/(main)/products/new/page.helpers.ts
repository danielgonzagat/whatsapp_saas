// Pure helpers extracted from products/new/page.tsx to reduce cyclomatic
// complexity on handleSave. Behaviour is byte-identical to the original
// inline implementation.

export interface ProductFormState {
  name: string;
  description: string;
  category: string;
  tags: string[];
  format: 'PHYSICAL' | 'DIGITAL' | 'HYBRID';
  imageUrl: string;
  price: string;
  paymentType: 'ONE_TIME' | 'SUBSCRIPTION' | 'INSTALLMENT';
  affiliateCommission: string;
  salesPageUrl: string;
  guaranteeDays: string;
  checkoutType: 'standard' | 'conversational';
  facebookPixelId: string;
  googleTagManagerId: string;
  packageType: string;
  width: string;
  height: string;
  depth: string;
  weight: string;
  shippingResponsible: 'producer' | 'supplier' | 'fulfillment' | 'dropshipping';
  dispatchTime: string;
  carriers: string[];
  affiliatesEnabled: boolean;
  affiliateCommissionPercent: string;
  affiliateApprovalMode: 'auto' | 'manual';
  billingType: 'one_time' | 'recurring' | 'free';
  maxInstallments: string;
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

  if (!needsPhysical) return base;

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

export function extractCreatedProductId(response: Record<string, unknown> | null): string | undefined {
  if (!response) return undefined;
  const productField =
    typeof response === 'object' && 'product' in response
      ? (response.product as Record<string, unknown> | null)
      : null;
  const created = productField || response;
  if (!created || typeof created !== 'object') return undefined;
  return 'id' in created ? ((created as { id?: unknown }).id as string | undefined) : undefined;
}
