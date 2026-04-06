import { buildPayUrl, isValidCheckoutCode } from '@/lib/subdomains';

export interface NormalizedCheckoutLink {
  id: string;
  slug: string | null;
  referenceCode: string | null;
  isPrimary: boolean;
  isActive: boolean;
  checkoutName: string;
  checkoutId: string | null;
  paymentMethods: string[];
}

type CheckoutLinkContainer =
  | {
      checkoutLinks?: unknown;
    }
  | null
  | undefined;

function currentBrowserHost() {
  return typeof window !== 'undefined' ? window.location.host : undefined;
}

function normalizeCheckoutCode(candidate?: string | null) {
  return String(candidate || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export function buildPublicCheckoutUrl(slug?: string | null, host = currentBrowserHost()) {
  const normalizedSlug = String(slug || '').trim();
  return normalizedSlug ? buildPayUrl(`/${normalizedSlug}`, host) : buildPayUrl('/', host);
}

export function buildPublicCheckoutCodeUrl(code?: string | null, host = currentBrowserHost()) {
  const normalizedCode = normalizeCheckoutCode(code);
  return normalizedCode ? buildPayUrl(`/${normalizedCode}`, host) : buildPayUrl('/', host);
}

export function buildCheckoutDisplayCode(code?: string | null, fallbackId?: string | null) {
  const normalizedCode = normalizeCheckoutCode(code);
  if (normalizedCode) {
    return normalizedCode;
  }

  return String(fallbackId || '')
    .trim()
    .slice(0, 8)
    .toUpperCase();
}

export function buildPublicCheckoutEntryUrl(
  slug?: string | null,
  code?: string | null,
  host = currentBrowserHost(),
) {
  const normalizedCode = normalizeCheckoutCode(code);
  return isValidCheckoutCode(normalizedCode)
    ? buildPublicCheckoutCodeUrl(normalizedCode, host)
    : buildPublicCheckoutUrl(slug, host);
}

export function normalizeCheckoutLinks(links: unknown): NormalizedCheckoutLink[] {
  return (Array.isArray(links) ? links : [])
    .map((link) => ({
      id: String((link as any)?.id || ''),
      slug: (link as any)?.slug || null,
      referenceCode: buildCheckoutDisplayCode((link as any)?.referenceCode) || null,
      isPrimary: (link as any)?.isPrimary === true,
      isActive: (link as any)?.isActive !== false,
      checkoutName: (link as any)?.checkout?.name || (link as any)?.name || 'Checkout',
      checkoutId: (link as any)?.checkout?.id || (link as any)?.checkoutId || null,
      paymentMethods: [
        (link as any)?.checkout?.checkoutConfig?.enablePix !== false ? 'PIX' : null,
        (link as any)?.checkout?.checkoutConfig?.enableCreditCard !== false ? 'CARTÃO' : null,
        (link as any)?.checkout?.checkoutConfig?.enableBoleto ? 'BOLETO' : null,
      ].filter((entry): entry is string => Boolean(entry)),
    }))
    .filter((link) => Boolean(link.id));
}

export function getPrimaryCheckoutLinkForPlan(plan: CheckoutLinkContainer) {
  const links = normalizeCheckoutLinks(plan?.checkoutLinks);
  return links.find((link) => link.isPrimary) || links[0] || null;
}

export function buildCheckoutLinksForPlan(
  plan: CheckoutLinkContainer,
  host = currentBrowserHost(),
) {
  return normalizeCheckoutLinks(plan?.checkoutLinks).map((link) => ({
    ...link,
    url: buildPublicCheckoutEntryUrl(link.slug, link.referenceCode, host),
  }));
}
