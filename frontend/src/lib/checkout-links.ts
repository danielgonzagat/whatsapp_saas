import { buildPayUrl, isValidCheckoutCode } from '@/lib/subdomains';

const A_Z0_9_RE = /[^A-Z0-9]/g;

/** Normalized checkout link shape. */
export interface NormalizedCheckoutLink {
  /** Id property. */
  id: string;
  /** Slug property. */
  slug: string | null;
  /** Reference code property. */
  referenceCode: string | null;
  /** Is primary property. */
  isPrimary: boolean;
  /** Is active property. */
  isActive: boolean;
  /** Checkout name property. */
  checkoutName: string;
  /** Checkout id property. */
  checkoutId: string | null;
  /** Payment methods property. */
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

/** Build public checkout url. */
export function buildPublicCheckoutUrl(slug?: string | null, host = currentBrowserHost()) {
  const normalizedSlug = String(slug || '').trim();
  return normalizedSlug ? buildPayUrl(`/${normalizedSlug}`, host) : buildPayUrl('/', host);
}

/** Build public checkout code url. */
export function buildPublicCheckoutCodeUrl(code?: string | null, host = currentBrowserHost()) {
  const normalizedCode = normalizeCheckoutCode(code);
  return normalizedCode ? buildPayUrl(`/${normalizedCode}`, host) : buildPayUrl('/', host);
}

/** Build checkout display code. */
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

/** Build public checkout entry url. */
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

function extractPaymentMethods(link: RawCheckoutLink): string[] {
  const cfg = link.checkout?.checkoutConfig;
  const methods: Array<string | null> = [
    cfg?.enablePix !== false ? 'PIX' : null,
    cfg?.enableCreditCard !== false ? 'CARTÃO' : null,
    cfg?.enableBoleto ? 'BOLETO' : null,
  ];
  return methods.filter((entry): entry is string => Boolean(entry));
}

function mapRawCheckoutLink(rawLink: unknown): NormalizedCheckoutLink {
  const link = (rawLink ?? {}) as RawCheckoutLink;
  return {
    id: String(link.id || ''),
    slug: link.slug || null,
    referenceCode: buildCheckoutDisplayCode(link.referenceCode) || null,
    isPrimary: link.isPrimary === true,
    isActive: link.isActive !== false,
    checkoutName: link.checkout?.name || link.name || 'Checkout',
    checkoutId: link.checkout?.id || link.checkoutId || null,
    paymentMethods: extractPaymentMethods(link),
  };
}

/** Normalize checkout links. */
export function normalizeCheckoutLinks(links: unknown): NormalizedCheckoutLink[] {
  const source = Array.isArray(links) ? links : [];
  return source.map(mapRawCheckoutLink).filter((link) => Boolean(link.id));
}

/** Get primary checkout link for plan. */
export function getPrimaryCheckoutLinkForPlan(plan: CheckoutLinkContainer) {
  const links = normalizeCheckoutLinks(plan?.checkoutLinks);
  return links.find((link) => link.isPrimary) || links[0] || null;
}

/** Build checkout links for plan. */
export function buildCheckoutLinksForPlan(
  plan: CheckoutLinkContainer,
  host = currentBrowserHost(),
) {
  return normalizeCheckoutLinks(plan?.checkoutLinks).map((link) => ({
    ...link,
    url: buildPublicCheckoutEntryUrl(link.slug, link.referenceCode, host),
  }));
}
