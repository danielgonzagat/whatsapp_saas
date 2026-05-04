'use client';

import { requestFacebookAccessTokenWithEmailScope } from '@/lib/facebook-sdk';
import { API_BASE } from '@/lib/http';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ensureDeviceFingerprint,
  mergeSnapshot,
  persistIdentity,
  readAttribution,
  readResponseMessage,
  readStoredIdentity,
} from './useCheckoutSocialIdentity.helpers';
import {
  type CheckoutSocialIdentitySnapshot,
  type CheckoutSocialProvider,
  type PrefillResponse,
} from './useCheckoutSocialIdentity.types';

export type {
  CheckoutSocialIdentitySnapshot,
  CheckoutSocialProvider,
} from './useCheckoutSocialIdentity.types';

const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services';
const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const FACEBOOK_SDK_SCRIPT_ID = 'facebook-jssdk';
const FACEBOOK_SDK_SCRIPT_SRC = 'https://connect.facebook.net/en_US/sdk.js';
const GOOGLE_PEOPLE_SCOPES = [
  'https://www.googleapis.com/auth/user.phonenumbers.read',
  'https://www.googleapis.com/auth/user.addresses.read',
].join(' ');
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

/** Use checkout social identity. */
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
  const metaAppId =
    process.env.NEXT_PUBLIC_META_AUTH_APP_ID?.trim() ||
    process.env.NEXT_PUBLIC_META_APP_ID?.trim() ||
    '';
  const metaGraphVersion = process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION?.trim() || 'v21.0';
  const appleClientId = process.env.NEXT_PUBLIC_APPLE_CLIENT_ID?.trim() || '';
  const googlePeopleScopesEnabled =
    (
      process.env.NEXT_PUBLIC_KLOEL_FEATURE_GOOGLE_PEOPLE_PREFILL ||
      process.env.NEXT_PUBLIC_GOOGLE_PEOPLE_SCOPES_ENABLED ||
      ''
    )
      .trim()
      .toLowerCase() === 'true';

  const [sdkReady, setSdkReady] = useState(false);
  const [facebookSdkReady, setFacebookSdkReady] = useState(false);
  const [loadingProvider, setLoadingProvider] = useState<CheckoutSocialProvider | null>(null);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState<CheckoutSocialIdentitySnapshot | null>(null);
  const [deviceFingerprint, setDeviceFingerprint] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const nextFingerprint = ensureDeviceFingerprint();
    setDeviceFingerprint(nextFingerprint);
    setSnapshot(readStoredIdentity());
  }, []);

  useEffect(() => {
    if (!enabled || !clientId) {
      return;
    }
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
    if (!enabled || !metaAppId || typeof window === 'undefined') {
      return;
    }

    const initialize = () => {
      if (!window.FB) {
        return;
      }
      window.FB.init({
        appId: metaAppId,
        cookie: true,
        xfbml: false,
        version: metaGraphVersion,
      });
      window.FB.AppEvents?.logPageView?.();
      window.FB.getLoginStatus(() => undefined);
      setFacebookSdkReady(true);
    };

    if (window.FB) {
      initialize();
      return;
    }

    const existing = document.getElementById(FACEBOOK_SDK_SCRIPT_ID);
    const previousInit = window.fbAsyncInit;
    window.fbAsyncInit = () => {
      previousInit?.();
      initialize();
    };

    if (existing) {
      return () => {
        window.fbAsyncInit = previousInit;
      };
    }

    const script = document.createElement('script');
    script.id = FACEBOOK_SDK_SCRIPT_ID;
    script.src = FACEBOOK_SDK_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);

    return () => {
      window.fbAsyncInit = previousInit;
    };
  }, [enabled, metaAppId, metaGraphVersion]);

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
      if (!googlePeopleScopesEnabled || !baseSnapshot.leadId) {
        return;
      }
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
    async (accessToken: string, userId?: string) => {
      if (!slug) {
        setError('Checkout sem slug para capturar o lead social.');
        return;
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
            userId,
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
      } catch (captureError: unknown) {
        setError(
          captureError instanceof Error ? captureError.message : 'Falha ao capturar a identidade.',
        );
      } finally {
        setLoadingProvider(null);
      }
    },
    [checkoutCode, deviceFingerprint, slug, snapshot],
  );

  useEffect(() => {
    if (!enabled || !clientId || !sdkReady || !googleButtonRef.current || initializedRef.current) {
      return;
    }

    const accounts = window.google?.accounts?.id;
    const oauth2 = window.google?.accounts?.oauth2;
    if (!accounts) {
      return;
    }

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
      if (!snapshot?.leadId) {
        return;
      }

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
    facebookAvailable: enabled && Boolean(metaAppId),
    appleAvailable: enabled && Boolean(appleClientId),
    googleButtonRef,
    triggerAppleSignIn: () => {
      if (!enabled || !appleClientId || !slug) {
        setError('Apple indisponível no momento.');
        return;
      }

      setError('');
      setLoadingProvider('apple');
      const currentFingerprint = deviceFingerprint || ensureDeviceFingerprint();
      const destination = new URL('/api/checkout/social/apple/start', window.location.origin);
      destination.searchParams.set('slug', slug);
      destination.searchParams.set('deviceFingerprint', currentFingerprint);
      destination.searchParams.set(
        'returnTo',
        `${window.location.pathname}${window.location.search}`,
      );
      if (checkoutCode?.trim()) {
        destination.searchParams.set('checkoutCode', checkoutCode.trim());
      }
      window.location.assign(destination.toString());
    },
    triggerFacebookSignIn: async () => {
      if (!enabled || !metaAppId || !facebookSdkReady || !window.FB) {
        setError('Facebook indisponível no momento.');
        return;
      }

      setError('');
      try {
        const auth = await requestFacebookAccessTokenWithEmailScope();
        await handleFacebookAccessToken(auth.accessToken, auth.userId);
      } catch (error) {
        setError(error instanceof Error ? error.message : 'Falha ao autenticar com Facebook.');
      }
    },
    loadingProvider,
    socialIdentity: snapshot,
    socialError: error,
    facebookSdkReady,
    googleAvailable: enabled && Boolean(clientId),
    updateLeadProgress,
  };
}

async function requestGoogleAccessToken(tokenClient: GoogleTokenClient, hint?: string) {
  return await new Promise<string | null>((resolve) => {
    let settled = false;
    const previousCallback = tokenClient.callback;

    const finish = (value: string | null) => {
      if (settled) {
        return;
      }
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
