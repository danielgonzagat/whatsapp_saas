'use client';
import { kloelError } from '@/lib/i18n/t';
import { requestFacebookAccessTokenWithEmailScope } from '@/lib/facebook-sdk';
import { useCallback, useEffect, useRef, useState } from 'react';

/* ────────────────────────────────────────────────────────────
   GOOGLE SIGN-IN HOOK
   Loads the GIS SDK once and exposes a trigger function.
   ──────────────────────────────────────────────────────────── */
export function useGoogleSignIn(
  onCredential: (credential: string) => Promise<void>,
  buttonRef: React.RefObject<HTMLDivElement | null>,
  disabled = false,
) {
  const clientId =
    (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() : '') || '';
  const cbRef = useRef(onCredential);
  const initDone = useRef(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);

  useEffect(() => {
    cbRef.current = onCredential;
  });

  // ── Load Google Identity Services SDK ──
  useEffect(() => {
    if (disabled) {
      return;
    }
    if (!clientId) {
      return;
    }
    if (window.google?.accounts?.id) {
      setSdkLoaded(true);
      return;
    }

    const SCRIPT_ID = 'google-identity-services';
    const existing = document.getElementById(SCRIPT_ID);
    const onLoad = () => setSdkLoaded(true);

    if (existing) {
      existing.addEventListener('load', onLoad);
      if (window.google?.accounts?.id) {
        setSdkLoaded(true);
      }
      return () => existing.removeEventListener('load', onLoad);
    }

    const s = document.createElement('script');
    s.id = SCRIPT_ID;
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.addEventListener('load', onLoad);
    document.head.appendChild(s);
    return () => s.removeEventListener('load', onLoad);
  }, [clientId, disabled]);

  // ── Initialize SDK + render hidden Google button ──
  useEffect(() => {
    if (disabled) {
      return;
    }
    if (!sdkLoaded || !clientId || !buttonRef.current) {
      return;
    }
    const g = window.google;
    if (!g?.accounts?.id) {
      return;
    }
    if (initDone.current) {
      return;
    }

    g.accounts.id.initialize({
      client_id: clientId,
      ux_mode: 'popup',
      auto_select: false,
      cancel_on_tap_outside: true,
      callback: async (response: { credential?: string }) => {
        const cred = response.credential?.trim();
        if (cred) {
          await cbRef.current(cred);
        }
      },
    });

    // Clear the container (required by GIS SDK before renderButton)
    const container = buttonRef.current;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    g.accounts.id.renderButton(container, {
      type: 'standard',
      theme: 'filled_black',
      size: 'large',
      text: 'signin_with',
      shape: 'rectangular',
      width: 300,
    });
    initDone.current = true;
  }, [sdkLoaded, clientId, buttonRef, disabled]);

  return { available: !disabled && !!clientId };
}

/* ────────────────────────────────────────────────────────────
   FACEBOOK SIGN-IN HOOK
   ──────────────────────────────────────────────────────────── */
export function useFacebookSignIn(
  onAuthResponse: (payload: { accessToken: string; userId?: string }) => Promise<void>,
  disabled = false,
) {
  const appId =
    (typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_META_AUTH_APP_ID?.trim() ||
        process.env.NEXT_PUBLIC_META_APP_ID?.trim()
      : '') || '';
  const version =
    (typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION?.trim()
      : '') || 'v21.0';
  const cbRef = useRef(onAuthResponse);
  const [sdkReady, setSdkReady] = useState(false);

  useEffect(() => {
    cbRef.current = onAuthResponse;
  }, [onAuthResponse]);

  useEffect(() => {
    if (disabled || !appId || typeof window === 'undefined') {
      return;
    }

    const initialize = () => {
      if (!window.FB) {
        return;
      }
      window.FB.init({
        appId,
        cookie: true,
        xfbml: false,
        version,
      });
      window.FB.AppEvents?.logPageView?.();
      window.FB.getLoginStatus(() => undefined);
      setSdkReady(true);
    };

    if (window.FB) {
      initialize();
      return;
    }

    const scriptId = 'facebook-jssdk';
    const existing = document.getElementById(scriptId);
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
    script.id = scriptId;
    script.async = true;
    script.defer = true;
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    document.head.appendChild(script);

    return () => {
      window.fbAsyncInit = previousInit;
    };
  }, [appId, disabled, version]);

  const signIn = useCallback(async () => {
    if (disabled || !appId || !sdkReady || !window.FB) {
      throw kloelError('Login com Facebook indisponível no momento.');
    }

    await cbRef.current(await requestFacebookAccessTokenWithEmailScope());
  }, [appId, disabled, sdkReady]);

  return {
    available: !disabled && !!appId,
    sdkReady,
    signIn,
  };
}
