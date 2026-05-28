import {
  type CheckoutSocialIdentitySnapshot,
  type CheckoutSocialProvider,
  type PrefillResponse,
} from './useCheckoutSocialIdentity.types';

const DEVICE_STORAGE_SLOT = 'kloel.checkout.device-id.v1';
const IDENTITY_STORAGE_SLOT = 'kloel.checkout.identity.v1';

function fallbackDeviceFingerprint(): string {
  const bytes = new Uint8Array(16);
  const webCrypto = globalThis.crypto;
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = (Date.now() + i) & 0xff;
    }
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function ensureDeviceFingerprint() {
  const existing = readFromStorage(DEVICE_STORAGE_SLOT);
  if (existing) {
    return existing;
  }

  const generated = globalThis.crypto?.randomUUID?.() || fallbackDeviceFingerprint();
  writeToStorage(DEVICE_STORAGE_SLOT, generated);
  return generated;
}

export function readStoredIdentity() {
  const raw = readFromStorage(IDENTITY_STORAGE_SLOT);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as CheckoutSocialIdentitySnapshot;
    if (parsed?.name && parsed?.email && parsed?.provider) {
      return parsed;
    }
  } catch {
    return null;
  }

  return null;
}

export function persistIdentity(value: CheckoutSocialIdentitySnapshot) {
  writeToStorage(IDENTITY_STORAGE_SLOT, JSON.stringify(value));
}

function resolveIdentityProvider(
  current: CheckoutSocialIdentitySnapshot | null,
  incoming: PrefillResponse,
): CheckoutSocialProvider {
  return incoming.provider || current?.provider || 'google';
}

function resolveIdentityDisplayFields(
  current: CheckoutSocialIdentitySnapshot | null,
  incoming: PrefillResponse,
): { name: string; email: string; avatarUrl: string | null } {
  return {
    name: incoming.name || current?.name || '',
    email: incoming.email || current?.email || '',
    avatarUrl: incoming.avatarUrl ?? current?.avatarUrl ?? null,
  };
}

function mergeIdentityCore(
  current: CheckoutSocialIdentitySnapshot | null,
  incoming: PrefillResponse,
  fallbackFingerprint: string,
): Pick<
  CheckoutSocialIdentitySnapshot,
  'leadId' | 'provider' | 'name' | 'email' | 'avatarUrl' | 'deviceFingerprint'
> {
  const leadId = incoming.leadId || current?.leadId;
  return {
    ...(leadId !== undefined ? { leadId } : {}),
    provider: resolveIdentityProvider(current, incoming),
    ...resolveIdentityDisplayFields(current, incoming),
    deviceFingerprint:
      incoming.deviceFingerprint || current?.deviceFingerprint || fallbackFingerprint,
  };
}

function mergeContactFields(
  current: CheckoutSocialIdentitySnapshot | null,
  incoming: PrefillResponse,
): Pick<CheckoutSocialIdentitySnapshot, 'phone' | 'cpf'> {
  return {
    phone: incoming.phone ?? current?.phone ?? null,
    cpf: incoming.cpf ?? current?.cpf ?? null,
  };
}

function mergeAddressFields(
  current: CheckoutSocialIdentitySnapshot | null,
  incoming: PrefillResponse,
): Pick<
  CheckoutSocialIdentitySnapshot,
  'cep' | 'street' | 'number' | 'neighborhood' | 'city' | 'state' | 'complement'
> {
  return {
    cep: incoming.cep ?? current?.cep ?? null,
    street: incoming.street ?? current?.street ?? null,
    number: incoming.number ?? current?.number ?? null,
    neighborhood: incoming.neighborhood ?? current?.neighborhood ?? null,
    city: incoming.city ?? current?.city ?? null,
    state: incoming.state ?? current?.state ?? null,
    complement: incoming.complement ?? current?.complement ?? null,
  };
}

export function mergeSnapshot(
  current: CheckoutSocialIdentitySnapshot | null,
  incoming: PrefillResponse,
  fallbackFingerprint: string,
): CheckoutSocialIdentitySnapshot {
  return {
    ...mergeIdentityCore(current, incoming, fallbackFingerprint),
    ...mergeContactFields(current, incoming),
    ...mergeAddressFields(current, incoming),
  };
}

export async function readResponseMessage(response: Response, fallback: string) {
  const raw = await response.text().catch(() => '');
  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(trimmed) as { message?: string };
    if (parsed?.message?.trim()) {
      return parsed.message.trim();
    }
  } catch {
    if (!trimmed.startsWith('<')) {
      return trimmed;
    }
  }

  if (response.status === 404) {
    return 'Checkout social não encontrado para este link.';
  }

  return fallback;
}

export function readAttribution(url: string) {
  const parsed = new URL(url);
  return {
    utmSource: normalizeQueryValue(parsed.searchParams.get('utm_source')),
    utmMedium: normalizeQueryValue(parsed.searchParams.get('utm_medium')),
    utmCampaign: normalizeQueryValue(parsed.searchParams.get('utm_campaign')),
    utmContent: normalizeQueryValue(parsed.searchParams.get('utm_content')),
    utmTerm: normalizeQueryValue(parsed.searchParams.get('utm_term')),
    fbclid: normalizeQueryValue(parsed.searchParams.get('fbclid')),
    gclid: normalizeQueryValue(parsed.searchParams.get('gclid')),
  };
}

function normalizeQueryValue(value: string | null) {
  const normalized = String(value || '').trim();
  return normalized || undefined;
}

function readFromStorage(key: string) {
  if (typeof window === 'undefined') {
    return '';
  }
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeToStorage(key: string, value: string) {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in public checkout mode.
  }
}

/**
 * Build a stable cache key used to dedupe the prefill GET request so it only
 * fires once per (slug, checkoutCode, deviceFingerprint) tuple.
 */
export function buildPrefillRequestKey(
  slug: string,
  checkoutCode: string | undefined,
  deviceFingerprint: string,
): string {
  return `${slug}:${checkoutCode || ''}:${deviceFingerprint}`;
}

/**
 * Build the query string for the social-capture prefill endpoint. Trims an
 * optional `checkoutCode` and omits it when empty so URLs stay clean.
 */
export function buildSocialCapturePrefillQuery(input: {
  slug: string;
  deviceFingerprint: string;
  checkoutCode?: string | null | undefined;
}): URLSearchParams {
  const params = new URLSearchParams({
    slug: input.slug,
    deviceFingerprint: input.deviceFingerprint,
  });
  const trimmed = (input.checkoutCode ?? '').trim();
  if (trimmed) {
    params.set('checkoutCode', trimmed);
  }
  return params;
}

/**
 * Build the absolute URL the browser is redirected to when starting the
 * Apple Sign-In handshake. Keeps the redirect logic pure so the hook only
 * has to call `window.location.assign(...)` once it has the URL.
 */
export function buildAppleSignInDestination(input: {
  origin: string;
  slug: string;
  deviceFingerprint: string;
  returnPath: string;
  returnSearch: string;
  checkoutCode?: string | null | undefined;
}): string {
  const destination = new URL('/api/checkout/social/apple/start', input.origin);
  destination.searchParams.set('slug', input.slug);
  destination.searchParams.set('deviceFingerprint', input.deviceFingerprint);
  destination.searchParams.set('returnTo', `${input.returnPath}${input.returnSearch}`);
  const trimmed = (input.checkoutCode ?? '').trim();
  if (trimmed) {
    destination.searchParams.set('checkoutCode', trimmed);
  }
  return destination.toString();
}

/**
 * Pure predicate that decides whether a snapshot returned by the prefill
 * endpoint is usable. The hook ignores partial payloads (those missing
 * provider/name/email) so the empty checkout state stays honest.
 */
export function hasUsablePrefillIdentity(
  data: PrefillResponse | null | undefined,
): data is PrefillResponse & { provider: CheckoutSocialProvider; name: string; email: string } {
  return Boolean(data?.provider && data?.name && data?.email);
}

/**
 * Pure predicate guarding the Apple Sign-In trigger. The DOM-touching parts
 * (`window.location.assign`) stay in the hook; this function decides whether
 * the attempt is even allowed.
 */
export function canTriggerAppleSignIn(input: {
  enabled: boolean;
  appleClientId: string;
  slug: string | undefined;
}): boolean {
  return Boolean(input.enabled && input.appleClientId && input.slug);
}

/**
 * Pure predicate guarding the Facebook Sign-In trigger. Mirrors
 * {@link canTriggerAppleSignIn} but checks the Meta SDK readiness flag.
 */
export function canTriggerFacebookSignIn(input: {
  enabled: boolean;
  metaAppId: string;
  facebookSdkReady: boolean;
  hasFacebookSdk: boolean;
}): boolean {
  return Boolean(
    input.enabled && input.metaAppId && input.facebookSdkReady && input.hasFacebookSdk,
  );
}
