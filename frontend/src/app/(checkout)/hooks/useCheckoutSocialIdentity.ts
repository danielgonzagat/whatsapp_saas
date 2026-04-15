'use client';

import { API_BASE } from '@/lib/http';
import { useCallback, useEffect, useRef, useState } from 'react';

const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services';
const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
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
}

type CaptureResponse = {
  leadId: string;
  provider: CheckoutSocialProvider;
  name: string;
  email: string;
  avatarUrl?: string | null;
  deviceFingerprint?: string | null;
};

type UseCheckoutSocialIdentityOptions = {
  slug?: string;
  checkoutCode?: string;
  enabled?: boolean;
};

export function useCheckoutSocialIdentity({
  slug,
  checkoutCode,
  enabled = true,
}: UseCheckoutSocialIdentityOptions) {
  const googleButtonRef = useRef<HTMLDivElement | null>(null);
  const callbackRef = useRef<(credential: string) => Promise<void>>(async () => undefined);
  const initializedRef = useRef(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || '';

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
          const body = (await response.json().catch(() => ({}))) as { message?: string };
          throw new Error(body.message || 'Falha ao capturar a identidade com Google.');
        }

        const data = (await response.json()) as CaptureResponse;
        const nextSnapshot: CheckoutSocialIdentitySnapshot = {
          leadId: data.leadId,
          provider: data.provider,
          name: data.name,
          email: data.email,
          avatarUrl: data.avatarUrl || null,
          deviceFingerprint:
            data.deviceFingerprint || deviceFingerprint || ensureDeviceFingerprint(),
        };
        persistIdentity(nextSnapshot);
        setSnapshot(nextSnapshot);
      } catch (captureError: unknown) {
        setError(
          captureError instanceof Error ? captureError.message : 'Falha ao capturar a identidade.',
        );
      } finally {
        setLoadingProvider(null);
      }
    },
    [checkoutCode, deviceFingerprint, slug],
  );

  callbackRef.current = handleGoogleCredential;

  useEffect(() => {
    if (!enabled || !clientId || !sdkReady || !googleButtonRef.current || initializedRef.current) {
      return;
    }

    const accounts = window.google?.accounts?.id;
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
  }, [clientId, enabled, sdkReady]);

  const updateLeadProgress = useCallback(
    async (payload: { phone?: string; cpf?: string; stepReached?: number }) => {
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
    updateLeadProgress,
  };
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
