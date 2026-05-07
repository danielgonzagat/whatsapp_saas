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
  return {
    leadId: incoming.leadId || current?.leadId,
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
