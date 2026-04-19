import { sanitizeNextPath } from './subdomains';

const CHECKOUT_APPLE_STATE_PREFIX = 'checkout:';

export type AppleCheckoutState = {
  flow: 'checkout';
  slug: string;
  checkoutCode?: string;
  deviceFingerprint: string;
  returnPath: string;
  sourceUrl?: string;
  refererUrl?: string;
};

type ParsedAppleAuthState = {
  nextPath: string;
  checkout: AppleCheckoutState | null;
};

function normalizeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function encodeAppleCheckoutState(state: AppleCheckoutState) {
  return `${CHECKOUT_APPLE_STATE_PREFIX}${encodeURIComponent(JSON.stringify(state))}`;
}

export function parseAppleAuthState(rawState?: string | null, rawNext?: string | null): ParsedAppleAuthState {
  const state = normalizeString(rawState);
  if (state.startsWith(CHECKOUT_APPLE_STATE_PREFIX)) {
    try {
      const parsed = JSON.parse(
        decodeURIComponent(state.slice(CHECKOUT_APPLE_STATE_PREFIX.length)),
      ) as Partial<AppleCheckoutState> | null;

      if (
        parsed?.flow === 'checkout' &&
        normalizeString(parsed.slug) &&
        normalizeString(parsed.deviceFingerprint)
      ) {
        const returnPath = sanitizeNextPath(parsed.returnPath, '/');
        return {
          nextPath: returnPath,
          checkout: {
            flow: 'checkout',
            slug: normalizeString(parsed.slug),
            checkoutCode: normalizeString(parsed.checkoutCode) || undefined,
            deviceFingerprint: normalizeString(parsed.deviceFingerprint),
            returnPath,
            sourceUrl: normalizeString(parsed.sourceUrl) || undefined,
            refererUrl: normalizeString(parsed.refererUrl) || undefined,
          },
        };
      }
    } catch {
      return { nextPath: sanitizeNextPath(rawNext || '/', '/'), checkout: null };
    }
  }

  return {
    nextPath: sanitizeNextPath(state || rawNext || '/', '/'),
    checkout: null,
  };
}
