import { DEFAULT_CONFIG, type CheckoutConfig } from './useCheckoutEditor.helpers.types';

/**
 * Pure normalizers extracted from `useCheckoutEditor.helpers.ts` to keep both
 * sibling files under the 400-LOC gate.
 *
 * Every export here is deterministic, side-effect-free, and byte-equivalent
 * to the inlined implementations the hook used historically.
 */

/* ── Pure normalizers (byte-identical to the original inline implementations) ── */

export function normalizeTimerTypeForEditor(value: unknown): string {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

  if (normalized === 'COUNTDOWN' || normalized === 'EVERGREEN') {
    return 'countdown';
  }

  if (normalized === 'EXPIRATION' || normalized === 'FIXED') {
    return 'fixed';
  }

  if (normalized === 'countdown' || normalized === 'fixed') {
    return normalized;
  }

  return DEFAULT_CONFIG.timerType;
}

export function normalizePixelTypeForEditor(value: unknown): string {
  const normalized = String(value || '')
    .trim()
    .toUpperCase();

  switch (normalized) {
    case 'FACEBOOK':
      return 'facebook';
    case 'GOOGLE_ANALYTICS':
      return 'google_analytics';
    case 'GOOGLE_ADS':
      return 'google_ads';
    case 'TIKTOK':
      return 'tiktok';
    case 'CUSTOM':
      return 'custom';
    default:
      return 'custom';
  }
}

export function resolveBumpPrice(item: Record<string, unknown>): number {
  return typeof item.price === 'number' ? item.price : Number(item.priceInCents || 0) / 100;
}

export function normalizeOrderBumpEntry(entry: unknown) {
  const item = entry as Record<string, unknown>;
  return {
    id: typeof item.id === 'string' ? item.id : undefined,
    title: String(item.title || ''),
    description: String(item.description || ''),
    productName: String(item.productName || ''),
    price: resolveBumpPrice(item),
    image: typeof item.image === 'string' ? item.image : undefined,
    compareAtPrice: typeof item.compareAtPrice === 'number' ? item.compareAtPrice / 100 : undefined,
    highlightColor: typeof item.highlightColor === 'string' ? item.highlightColor : undefined,
    checkboxLabel: typeof item.checkboxLabel === 'string' ? item.checkboxLabel : undefined,
    position: typeof item.position === 'string' ? item.position : undefined,
    sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : undefined,
    isActive: typeof item.isActive === 'boolean' ? item.isActive : undefined,
  };
}

export function normalizeTestimonialEntry(entry: unknown) {
  const item = entry as Record<string, unknown>;
  return {
    name: String(item.name || ''),
    text: String(item.text || ''),
    stars: Number(item.stars ?? item.rating ?? 5) || 5,
  };
}

export function normalizeTrustBadgeEntry(entry: unknown) {
  if (typeof entry === 'string') {
    return { label: entry };
  }

  const item = entry as Record<string, unknown>;
  return {
    label: String(item.label || ''),
    icon: typeof item.icon === 'string' ? item.icon : undefined,
  };
}

export function normalizeUpsellEntry(entry: unknown) {
  const item = entry as Record<string, unknown>;
  return {
    id: typeof item.id === 'string' ? item.id : undefined,
    title: String(item.title || ''),
    description: String(item.description || ''),
    productName: String(item.productName || ''),
    price: typeof item.price === 'number' ? item.price : Number(item.priceInCents || 0) / 100,
    headline: typeof item.headline === 'string' ? item.headline : undefined,
    image: typeof item.image === 'string' ? item.image : undefined,
    compareAtPrice:
      typeof item.compareAtPrice === 'number' ? item.compareAtPrice / 100 : undefined,
    acceptBtnText: typeof item.acceptBtnText === 'string' ? item.acceptBtnText : undefined,
    declineBtnText: typeof item.declineBtnText === 'string' ? item.declineBtnText : undefined,
    timerSeconds: typeof item.timerSeconds === 'number' ? item.timerSeconds : undefined,
    chargeType: typeof item.chargeType === 'string' ? item.chargeType : undefined,
    sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : undefined,
    isActive: typeof item.isActive === 'boolean' ? item.isActive : undefined,
  };
}

export function normalizePixelEntry(entry: unknown) {
  const item = entry as Record<string, unknown>;
  return {
    id: typeof item.id === 'string' ? item.id : undefined,
    type: normalizePixelTypeForEditor(item.type),
    pixelId: String(item.pixelId || ''),
    accessToken: typeof item.accessToken === 'string' ? item.accessToken : undefined,
    trackPageView: typeof item.trackPageView === 'boolean' ? item.trackPageView : true,
    trackInitiateCheckout:
      typeof item.trackInitiateCheckout === 'boolean' ? item.trackInitiateCheckout : true,
    trackAddPaymentInfo:
      typeof item.trackAddPaymentInfo === 'boolean' ? item.trackAddPaymentInfo : true,
    trackPurchase: typeof item.trackPurchase === 'boolean' ? item.trackPurchase : true,
    isActive: typeof item.isActive === 'boolean' ? item.isActive : true,
  };
}

export function normalizeConfigForEditor(data: Record<string, unknown>): CheckoutConfig {
  const raw = data as Record<string, unknown> & {
    plan?: { slug?: string; referenceCode?: string };
  };
  const { plan, ...rest } = raw;

  const testimonials = Array.isArray(rest.testimonials)
    ? rest.testimonials.map(normalizeTestimonialEntry)
    : DEFAULT_CONFIG.testimonials;

  const trustBadges = Array.isArray(rest.trustBadges)
    ? rest.trustBadges.map(normalizeTrustBadgeEntry)
    : DEFAULT_CONFIG.trustBadges;

  const orderBumps = Array.isArray(rest.orderBumps)
    ? rest.orderBumps.map(normalizeOrderBumpEntry)
    : DEFAULT_CONFIG.orderBumps;

  const upsells = Array.isArray(rest.upsells)
    ? rest.upsells.map(normalizeUpsellEntry)
    : DEFAULT_CONFIG.upsells;

  const pixels = Array.isArray(rest.pixels)
    ? rest.pixels.map(normalizePixelEntry)
    : DEFAULT_CONFIG.pixels;

  return {
    ...DEFAULT_CONFIG,
    ...rest,
    slug:
      typeof rest.slug === 'string'
        ? rest.slug
        : typeof plan?.slug === 'string'
          ? plan.slug
          : undefined,
    referenceCode:
      typeof rest.referenceCode === 'string'
        ? rest.referenceCode
        : typeof plan?.referenceCode === 'string'
          ? plan.referenceCode
          : undefined,
    timerType: normalizeTimerTypeForEditor(rest.timerType),
    testimonials,
    trustBadges,
    orderBumps,
    upsells,
    pixels,
  } as CheckoutConfig;
}
