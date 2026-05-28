/**
 * Pure helpers extracted from CheckoutService.
 * Keeps the service file under the architecture line budget.
 */
import type { CreateCheckoutInput } from './checkout-product.types';

/** Input shape for buildDuplicateCheckoutInput. */
export interface DuplicateCheckoutSource {
  name: string;
  priceInCents: number;
  currency: string;
  maxInstallments: number | null;
  installmentsFee: boolean | null;
  quantity: number;
  freeShipping: boolean;
  compareAtPrice: number | null;
  shippingPrice: number | null;
  checkoutConfig?: { brandName?: string | null } | null;
}

/** Build the CreateCheckoutInput for duplicating a checkout record. */
export function buildDuplicateCheckoutInput(
  source: DuplicateCheckoutSource,
): CreateCheckoutInput {
  const input: CreateCheckoutInput = {
    name: `${source.name} (Copia)`,
    priceInCents: source.priceInCents,
    currency: source.currency,
    maxInstallments: source.maxInstallments,
    installmentsFee: source.installmentsFee,
    quantity: source.quantity,
    freeShipping: source.freeShipping,
    brandName: source.checkoutConfig?.brandName ?? source.name,
  };

  if (source.compareAtPrice != null) {
    input.compareAtPrice = source.compareAtPrice;
  }
  if (source.shippingPrice != null) {
    input.shippingPrice = source.shippingPrice;
  }

  return input;
}

/**
 * Map original checkout pixels into createMany input rows for the duplicated config.
 * Generic over the pixel row shape so Prisma enum types (e.g. PixelType) flow
 * through from the caller without requiring an explicit Prisma import.
 */
export function mapPixelsForDuplicate<
  TPixel extends {
    type: unknown;
    pixelId: unknown;
    accessToken?: string | null;
    trackPageView?: boolean;
    trackInitiateCheckout?: boolean;
    trackAddPaymentInfo?: boolean;
    trackPurchase?: boolean;
  },
>(
  pixels: ReadonlyArray<TPixel>,
  checkoutConfigId: string,
): Array<{
  checkoutConfigId: string;
  type: TPixel['type'];
  pixelId: TPixel['pixelId'];
  accessToken: string | null;
  trackPageView: boolean;
  trackInitiateCheckout: boolean;
  trackAddPaymentInfo: boolean;
  trackPurchase: boolean;
}> {
  return pixels.map((pixel) => ({
    checkoutConfigId,
    type: pixel.type,
    pixelId: pixel.pixelId,
    accessToken: pixel.accessToken ?? null,
    trackPageView: pixel.trackPageView ?? true,
    trackInitiateCheckout: pixel.trackInitiateCheckout ?? true,
    trackAddPaymentInfo: pixel.trackAddPaymentInfo ?? true,
    trackPurchase: pixel.trackPurchase ?? true,
  }));
}

/** Strip Prisma metadata fields from a config record, leaving only business payload. */
export function stripConfigMetadata(config: Record<string, unknown>): Record<string, unknown> {
  const { id, planId, pixels, createdAt, updatedAt, ...rest } = config;
  return rest;
}
