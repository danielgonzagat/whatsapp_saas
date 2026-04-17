import { buildPayUrl, isValidCheckoutCode } from '@/lib/subdomains';

const A_Z0_9_RE = /[^A-Z0-9]/g;

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
    .replace(A_Z0_9_RE, '')
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

interface RawCheckoutLink {
  id?: string;
  slug?: string;
  referenceCode?: string;
  isPrimary?: boolean;
  isActive?: boolean;
  name?: string;
  checkoutId?: string;
  checkout?: {
    id?: string;
    name?: string;
    checkoutConfig?: {
      enablePix?: boolean;
      enableCreditCard?: boolean;
      enableBoleto?: boolean;
    };
  };
}

export function normalizeCheckoutLinks(links: unknown): NormalizedCheckoutLink[] {
  return (Array.isArray(links) ? links : [])
    .map((rawLink: unknown) => {
      const link = (rawLink ?? {}) as RawCheckoutLink;
      return {
        id: String(link.id || ''),
        slug: link.slug || null,
        referenceCode: buildCheckoutDisplayCode(link.referenceCode) || null,
        isPrimary: link.isPrimary === true,
        isActive: link.isActive !== false,
        checkoutName: link.checkout?.name || link.name || 'Checkout',
        checkoutId: link.checkout?.id || link.checkoutId || null,
        paymentMethods: [
          link.checkout?.checkoutConfig?.enablePix !== false ? 'PIX' : null,
          link.checkout?.checkoutConfig?.enableCreditCard !== false ? 'CARTÃO' : null,
          link.checkout?.checkoutConfig?.enableBoleto ? 'BOLETO' : null,
        ].filter((entry): entry is string => Boolean(entry)),
      };
    })
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
