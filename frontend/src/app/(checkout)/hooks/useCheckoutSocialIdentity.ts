'use client';

import { API_BASE } from '@/lib/http';
import { hasAuthenticatedKloelToken } from '@/lib/auth-identity';
import { encodeAppleCheckoutState } from '@/lib/apple-auth-state';
import { authApi } from '@/lib/api/auth';
import { tokenStorage } from '@/lib/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useFacebookSignIn } from '@/components/kloel/auth/use-facebook-sign-in';

const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services';
const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const GOOGLE_PEOPLE_SCOPES = [
  'https://www.googleapis.com/auth/user.phonenumbers.read',
  'https://www.googleapis.com/auth/user.addresses.read',
  'https://www.googleapis.com/auth/user.birthday.read',
].join(' ');
const DEVICE_STORAGE_KEY = 'kloel.checkout.device-id.v1';
const IDENTITY_STORAGE_KEY = 'kloel.checkout.identity.v1';

export type CheckoutSocialProvider = 'google' | 'facebook' | 'apple';

export interface CheckoutSocialIdentitySnapshot {
  leadId?: string;
  provider: CheckoutSocialProvider;
  name: string;
  email: string;
  avatarUrl?: string | null;
  deviceFingerprint: string;
  phone?: string | null;
  birthday?: string | null;
  cpf?: string | null;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  complement?: string | null;
}

type CaptureResponse = {
  leadId: string;
  provider: CheckoutSocialProvider;
  name: string;
  email: string;
  avatarUrl?: string | null;
  deviceFingerprint?: string | null;
};

type PrefillResponse = {
  leadId: string;
  provider: CheckoutSocialProvider;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  deviceFingerprint?: string | null;
  phone?: string | null;
  birthday?: string | null;
  cpf?: string | null;
  cep?: string | null;
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  complement?: string | null;
};

type AuthenticatedGoogleExtendedProfile = {
  provider: 'google';
  email: string | null;
  phone: string | null;
  birthday: string | null;
  address: {
    street: string | null;
    city: string | null;
    state: string | null;
    postalCode: string | null;
    countryCode: string | null;
    formattedValue: string | null;
  } | null;
};

type UseCheckoutSocialIdentityOptions = {
  slug?: string;
  checkoutCode?: string;
  enabled?: boolean;
};

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
  scope?: string;
};

type GoogleTokenClient = {
  callback: (response: GoogleTokenResponse) => void;
  requestAccessToken: (options?: {
    prompt?: '' | 'consent' | 'select_account' | 'none';
    hint?: string;
    scope?: string;
  }) => void;
};

export function useCheckoutSocialIdentity({
  slug,
  checkoutCode,
  enabled = true,
}: UseCheckoutSocialIdentityOptions) {
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const tokenClientRef = useRef<GoogleTokenClient | null>(null);
  const callbackRef = useRef<(credential: string) => Promise<void>>(async () => undefined);
  const profileHydrationLeadRef = useRef('');
  const initializedRef = useRef(false);
  const prefillRequestKeyRef = useRef('');
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || '';
  const appleClientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID?.trim() || '';
  const googlePeopleScopesEnabled =
    process.env.NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL?.trim().toLowerCase() ===
      'true' ||
    process.env.NEXT_PUBLIC_GOOGLE_PEOPLE_SCOPES_ENABLED?.trim().toLowerCase() === 'true';

  const [sdkReady, setSdkReady] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<CheckoutSocialProvider | null>(null);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<CheckoutSocialIdentitySnapshot | null>(null);
  const [deviceFingerprint, setDeviceFingerprint] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const nextFingerprint = ensureDeviceFingerprint();
    setDeviceFingerprint(nextFingerprint);
    setSnapshot(readStoredIdentity());
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const url = new URL(window.location.href);
    const socialAuthError = url.searchParams.get('socialAuthError')?.trim();
    if (!socialAuthError) {
      return;
    }

    setError(readAppleCheckoutErrorMessage(socialAuthError));
    url.searchParams.delete('socialAuthError');
    url.searchParams.delete('socialAuthProvider');
    window.history.replaceState({}, '', url.toString());
  }, []);

  useEffect(() => {
    if (!enabled || !clientId) return;
    if (window.google?.accounts?.id) {
      setSdkReady(true);
      return;
    }

    const existing = document.getElementById(GOOGLE_IDENTITY_SCRIPT_ID) as HTMLScriptElement | null;
    const onLoad = () => setSdkReady(true);
    const onError = () => setError('Não foi possível carregar o login com Google.');

    if (existing) {
      existing.addEventListener('load', onLoad);
      existing.addEventListener('error', onError);
      return () => {
        existing.removeEventListener('load', onLoad);
        existing.removeEventListener('error', onError);
      };
    }

    const script = document.createElement('script');
    script.id = GOOGLE_IDENTITY_SCRIPT_ID;
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    document.head.appendChild(script);

    return () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
  }, [clientId, enabled]);

  useEffect(() => {
    if (!enabled || !slug || !deviceFingerprint) {
      return;
    }

    const requestKey = `${slug}:${checkoutCode || ''}:${deviceFingerprint}`;
    if (prefillRequestKeyRef.current === requestKey) {
      return;
    }
    prefillRequestKeyRef.current = requestKey;

    let cancelled = false;
    const params = new URLSearchParams({
      slug,
      deviceFingerprint,
    });
    if (checkoutCode?.trim()) {
      params.set('checkoutCode', checkoutCode.trim());
    }

    fetch(`${API_BASE}/checkout/public/social-capture/prefill?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readResponseMessage(response, 'Falha ao recuperar o lead social.'));
        }

        return (await response.json()) as PrefillResponse | null;
      })
      .then((data) => {
        if (cancelled || !data?.provider || !data?.name || !data?.email) {
          return;
        }

        const nextSnapshot = mergeSnapshot(snapshot, data, deviceFingerprint);
        persistIdentity(nextSnapshot);
        setSnapshot(nextSnapshot);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [checkoutCode, deviceFingerprint, enabled, slug, snapshot]);

  const hydrateGooglePeopleProfile = useCallback(
    async (baseSnapshot: CheckoutSocialIdentitySnapshot) => {
      if (!googlePeopleScopesEnabled || !baseSnapshot.leadId) return;
      if (profileHydrationLeadRef.current === baseSnapshot.leadId) {
        return;
      }

      const tokenClient = tokenClientRef.current;
      if (!tokenClient) {
        return;
      }

      profileHydrationLeadRef.current = baseSnapshot.leadId;

      const accessToken = await requestGoogleAccessToken(tokenClient, baseSnapshot.email);
      if (!accessToken) {
        return;
      }

      try {
        const authenticatedProfile = await loadAuthenticatedGoogleExtendedProfile(accessToken);
        if (authenticatedProfile) {
          const authenticatedPrefill = prefillFromAuthenticatedGoogleProfile(
            baseSnapshot,
            authenticatedProfile,
          );
          const nextSnapshot = mergeSnapshot(
            baseSnapshot,
            authenticatedPrefill,
            deviceFingerprint || baseSnapshot.deviceFingerprint,
          );
          persistIdentity(nextSnapshot);
          setSnapshot(nextSnapshot);
          await patchCapturedLead(baseSnapshot.leadId, authenticatedPrefill);
          return;
        }

        const response = await fetch(
          `${API_BASE}/checkout/public/social-capture/${baseSnapshot.leadId}/google-profile`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken }),
          },
        );

        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as PrefillResponse;
        const nextSnapshot = mergeSnapshot(
          baseSnapshot,
          data,
          deviceFingerprint || baseSnapshot.deviceFingerprint,
        );
        persistIdentity(nextSnapshot);
        setSnapshot(nextSnapshot);
      } catch {
        // Escopos adicionais são best-effort.
      }
    },
    [deviceFingerprint, googlePeopleScopesEnabled],
  );

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      if (!slug) {
        setError('Checkout sem slug para capturar o lead social.');
        return;
      }

      setLoadingProvider('google');
      setError('');

      try {
        const response = await fetch(`${API_BASE}/checkout/public/social-capture`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug,
            provider: 'google',
            credential,
            checkoutCode,
            deviceFingerprint: deviceFingerprint || ensureDeviceFingerprint(),
            sourceUrl: window.location.href,
            refererUrl: document.referrer || undefined,
            ...readAttribution(window.location.href),
          }),
        });

        if (!response.ok) {
          throw new Error(
            await readResponseMessage(response, 'Falha ao capturar a identidade com Google.'),
          );
        }

        const data = (await response.json()) as CaptureResponse;
        const nextSnapshot = mergeSnapshot(snapshot, data, deviceFingerprint);
        persistIdentity(nextSnapshot);
        setSnapshot(nextSnapshot);
        void hydrateGooglePeopleProfile(nextSnapshot);
      } catch (captureError: unknown) {
        setError(
          captureError instanceof Error ? captureError.message : 'Falha ao capturar a identidade.',
        );
      } finally {
        setLoadingProvider(null);
      }
    },
    [checkoutCode, deviceFingerprint, hydrateGooglePeopleProfile, slug, snapshot],
  );

  callbackRef.current = handleGoogleCredential;

  const handleFacebookAccessToken = useCallback(
    async (accessToken: string) => {
      if (!slug) {
        const message = 'Checkout sem slug para capturar o lead social.';
        setError(message);
        return { success: false, error: message };
      }

      setLoadingProvider('facebook');
      setError('');

      try {
        const response = await fetch(`${API_BASE}/checkout/public/social-capture`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug,
            provider: 'facebook',
            accessToken,
            checkoutCode,
            deviceFingerprint: deviceFingerprint || ensureDeviceFingerprint(),
            sourceUrl: window.location.href,
            refererUrl: document.referrer || undefined,
            ...readAttribution(window.location.href),
          }),
        });

        if (!response.ok) {
          throw new Error(
            await readResponseMessage(response, 'Falha ao capturar a identidade com Facebook.'),
          );
        }

        const data = (await response.json()) as CaptureResponse;
        const nextSnapshot = mergeSnapshot(snapshot, data, deviceFingerprint);
        persistIdentity(nextSnapshot);
        setSnapshot(nextSnapshot);
        return { success: true };
      } catch (captureError: unknown) {
        const message =
          captureError instanceof Error ? captureError.message : 'Falha ao capturar a identidade.';
        setError(message);
        return { success: false, error: message };
      } finally {
        setLoadingProvider(null);
      }
    },
    [checkoutCode, deviceFingerprint, slug, snapshot],
  );

  const facebookAuth = useFacebookSignIn({
    disabled: !enabled,
    onAccessToken: handleFacebookAccessToken,
    onError: (message) => setError(message),
  });

  const startFacebookSignIn = useCallback(async () => {
    await facebookAuth.signInWithFacebook();
  }, [facebookAuth]);

  const startAppleSignIn = useCallback(async () => {
    if (!slug) {
      setError('Checkout sem slug para capturar o lead social.');
      return;
    }

    if (!appleClientId) {
      setError('Login com Apple não configurado no checkout.');
      return;
    }

    if (typeof window === 'undefined') {
      setError('Login com Apple indisponível neste ambiente.');
      return;
    }

    setLoadingProvider('apple');
    setError('');

    try {
      const state = encodeAppleCheckoutState({
        flow: 'checkout',
        slug,
        checkoutCode: checkoutCode?.trim() || undefined,
        deviceFingerprint: deviceFingerprint || ensureDeviceFingerprint(),
        returnPath: `${window.location.pathname}${window.location.search}`,
        sourceUrl: window.location.href,
        refererUrl: document.referrer || undefined,
      });
      const appleAuthUrl = new URL('https://appleid.apple.com/auth/authorize');
      appleAuthUrl.searchParams.set('client_id', appleClientId);
      appleAuthUrl.searchParams.set(
        'redirect_uri',
        `${window.location.origin}/api/auth/callback/apple`,
      );
      appleAuthUrl.searchParams.set('response_type', 'code id_token');
      appleAuthUrl.searchParams.set('scope', 'name email');
      appleAuthUrl.searchParams.set('response_mode', 'form_post');
      appleAuthUrl.searchParams.set('state', state);
      window.location.assign(appleAuthUrl.toString());
    } catch (captureError: unknown) {
      setLoadingProvider(null);
      setError(
        captureError instanceof Error ? captureError.message : 'Falha ao iniciar o login com Apple.',
      );
    }
  }, [appleClientId, checkoutCode, deviceFingerprint, slug]);

  useEffect(() => {
    if (!enabled || !clientId || !sdkReady || !googleButtonRef.current || initializedRef.current) {
      return;
    }

    const accounts = window.google?.accounts?.id;
    const oauth2 = window.google?.accounts?.oauth2;
    if (!accounts) return;

    accounts.initialize({
      client_id: clientId,
      ux_mode: 'popup',
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: async (response: { credential?: string }) => {
        const credential = response.credential?.trim();
        if (credential) {
          await callbackRef.current(credential);
        }
      },
    });

    if (googlePeopleScopesEnabled && oauth2 && !tokenClientRef.current) {
      tokenClientRef.current = oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_PEOPLE_SCOPES,
        callback: () => undefined,
      });
    }

    googleButtonRef.current.innerHTML = '';
    accounts.renderButton(googleButtonRef.current, {
      type: 'standard',
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      width: 240,
    });

    initializedRef.current = true;
  }, [clientId, enabled, googlePeopleScopesEnabled, sdkReady]);

  const updateLeadProgress = useCallback(
    async (payload: {
      name?: string;
      email?: string;
      phone?: string;
      cpf?: string;
      cep?: string;
      street?: string;
      number?: string;
      neighborhood?: string;
      city?: string;
      state?: string;
      complement?: string;
      stepReached?: number;
    }) => {
      if (!snapshot?.leadId) return;

      await fetch(`${API_BASE}/checkout/public/social-capture/${snapshot.leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch(() => undefined);
    },
    [snapshot?.leadId],
  );

  return {
    deviceFingerprint,
    googleButtonRef,
    loadingProvider,
    socialIdentity: snapshot,
    socialError: error,
    googleAvailable: enabled && Boolean(clientId),
    facebookAvailable: enabled && facebookAuth.available,
    appleAvailable: enabled && Boolean(appleClientId),
    startFacebookSignIn,
    startAppleSignIn,
    updateLeadProgress,
  };
}

function readAppleCheckoutErrorMessage(code: string) {
  switch (code.trim().toLowerCase()) {
    case 'apple_user_cancelled':
      return 'Login com Apple cancelado.';
    case 'apple_invalid_response':
      return 'A Apple não retornou uma credencial válida.';
    case 'apple_oauth_failed':
      return 'Falha ao capturar a identidade com Apple.';
    case 'apple_not_configured':
      return 'Login com Apple não configurado no checkout.';
    default:
      return 'Falha ao capturar a identidade com Apple.';
  }
}

async function requestGoogleAccessToken(tokenClient: GoogleTokenClient, hint?: string) {
  return await new Promise<string | null>((resolve) => {
    let settled = false;
    const previousCallback = tokenClient.callback;

    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      tokenClient.callback = previousCallback;
      window.clearTimeout(timeout);
      resolve(value);
    };

    const timeout = window.setTimeout(() => finish(null), 8000);

    tokenClient.callback = (response: GoogleTokenResponse) => {
      if (response.access_token?.trim()) {
        finish(response.access_token.trim());
        return;
      }

      finish(null);
    };

    try {
      tokenClient.requestAccessToken({
        prompt: 'consent',
        hint: hint?.trim() || undefined,
        scope: GOOGLE_PEOPLE_SCOPES,
      });
    } catch {
      finish(null);
    }
  });
}

function ensureDeviceFingerprint() {
  const existing = readFromStorage(DEVICE_STORAGE_KEY);
  if (existing) return existing;

  const generated =
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeToStorage(DEVICE_STORAGE_KEY, generated);
  return generated;
}

function readStoredIdentity() {
  const raw = readFromStorage(IDENTITY_STORAGE_KEY);
  if (!raw) return null;

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

function persistIdentity(value: CheckoutSocialIdentitySnapshot) {
  writeToStorage(IDENTITY_STORAGE_KEY, JSON.stringify(value));
}

async function loadAuthenticatedGoogleExtendedProfile(accessToken: string) {
  const token = tokenStorage.getToken();
  if (!token || !hasAuthenticatedKloelToken(token)) {
    return null;
  }

  const response = await authApi.getGoogleExtendedProfile(accessToken);
  if (response.error) {
    return null;
  }

  const candidate = response.data;
  if (!candidate || candidate.provider !== 'google') {
    return null;
  }

  return candidate as AuthenticatedGoogleExtendedProfile;
}

async function patchCapturedLead(leadId: string, payload: PrefillResponse) {
  try {
    await fetch(`${API_BASE}/checkout/public/social-capture/${leadId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: payload.phone,
        cep: payload.cep,
        street: payload.street,
        neighborhood: payload.neighborhood,
        city: payload.city,
        state: payload.state,
        complement: payload.complement,
      }),
    });
  } catch {
    // Persistência do lead continua best-effort.
  }
}

function prefillFromAuthenticatedGoogleProfile(
  baseSnapshot: CheckoutSocialIdentitySnapshot,
  profile: AuthenticatedGoogleExtendedProfile,
): PrefillResponse {
  return {
    leadId: baseSnapshot.leadId || '',
    provider: 'google',
    name: baseSnapshot.name,
    email: profile.email || baseSnapshot.email,
    avatarUrl: baseSnapshot.avatarUrl,
    deviceFingerprint: baseSnapshot.deviceFingerprint,
    phone: profile.phone,
    birthday: profile.birthday,
    cep: profile.address?.postalCode || null,
    street: profile.address?.street || null,
    city: profile.address?.city || null,
    state: profile.address?.state || null,
    number: null,
    neighborhood: null,
    complement: null,
  };
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
): Pick<CheckoutSocialIdentitySnapshot, 'phone' | 'birthday' | 'cpf'> {
  return {
    phone: incoming.phone ?? current?.phone ?? null,
    birthday: incoming.birthday ?? current?.birthday ?? null,
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

function mergeSnapshot(
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

async function readResponseMessage(response: Response, fallback: string) {
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

function readAttribution(url: string) {
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
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeToStorage(key: string, value: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in public checkout mode.
  }
}
