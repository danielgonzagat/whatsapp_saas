'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type FacebookAuthResult = { success: boolean; error?: string };

type UseFacebookSignInOptions = {
  disabled?: boolean;
  onAccessToken: (accessToken: string) => Promise<FacebookAuthResult>;
  onError?: (message: string) => void;
};

const FACEBOOK_SDK_SCRIPT_ID = 'facebook-jssdk';
const FACEBOOK_SDK_SRC = 'https://connect.facebook.net/en_US/sdk.js';

export function useFacebookSignIn({
  disabled = false,
  onAccessToken,
  onError,
}: UseFacebookSignInOptions) {
  const appId = process.env.NEXT_PUBLIC_META_APP_ID?.trim() || '';
  const graphVersion = process.env.NEXT_PUBLIC_META_GRAPH_API_VERSION?.trim() || 'v21.0';
  const onAccessTokenRef = useRef(onAccessToken);
  const onErrorRef = useRef(onError);
  const cachedAccessTokenRef = useRef('');

  const [sdkReady, setSdkReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    onAccessTokenRef.current = onAccessToken;
  }, [onAccessToken]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  const buildErrorResult = useCallback((message: string): FacebookAuthResult => {
    setLocalError(message);
    onErrorRef.current?.(message);
    return { success: false, error: message };
  }, []);

  const submitAccessToken = useCallback(
    async (accessToken: string): Promise<FacebookAuthResult> => {
      setIsSubmitting(true);
      setLocalError(null);
      try {
        const result = await onAccessTokenRef.current(accessToken);
        if (!result.success) {
          const message = result.error || 'Falha ao autenticar com Facebook.';
          setLocalError(message);
          onErrorRef.current?.(message);
        }
        return result;
      } finally {
        setIsSubmitting(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (disabled || !appId) return;

    let cancelled = false;
    const previousAsyncInit = window.fbAsyncInit;

    const initSdk = () => {
      if (cancelled || !window.FB) return;

      window.FB.init({
        appId,
        cookie: true,
        xfbml: true,
        version: graphVersion,
      });

      window.FB.getLoginStatus((response) => {
        if (cancelled) return;
        if (response.status === 'connected' && response.authResponse?.accessToken) {
          cachedAccessTokenRef.current = response.authResponse.accessToken;
        }
        setSdkReady(true);
      });
    };

    if (window.FB) {
      initSdk();
      return () => {
        cancelled = true;
      };
    }

    const handleFailure = () => {
      if (cancelled) return;
      const message = 'Não foi possível carregar o login com Facebook.';
      setLocalError(message);
      onErrorRef.current?.(message);
    };

    window.fbAsyncInit = () => {
      previousAsyncInit?.();
      initSdk();
    };

    const existingScript = document.getElementById(FACEBOOK_SDK_SCRIPT_ID) as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('error', handleFailure);
      return () => {
        cancelled = true;
        existingScript.removeEventListener('error', handleFailure);
        window.fbAsyncInit = previousAsyncInit;
      };
    }

    const script = document.createElement('script');
    script.id = FACEBOOK_SDK_SCRIPT_ID;
    script.src = FACEBOOK_SDK_SRC;
    script.async = true;
    script.defer = true;
    script.crossOrigin = 'anonymous';
    script.addEventListener('error', handleFailure);
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      script.removeEventListener('error', handleFailure);
      window.fbAsyncInit = previousAsyncInit;
    };
  }, [appId, disabled, graphVersion]);

  const signInWithFacebook = useCallback(async (): Promise<FacebookAuthResult> => {
    if (disabled) {
      return buildErrorResult('Login com Facebook indisponível no momento.');
    }

    if (!appId) {
      return buildErrorResult(
        'Login com Facebook não configurado no frontend. Defina NEXT_PUBLIC_META_APP_ID.',
      );
    }

    if (!window.FB) {
      return buildErrorResult('Não foi possível carregar o login com Facebook.');
    }

    const cachedAccessToken = cachedAccessTokenRef.current.trim();
    if (cachedAccessToken) {
      return submitAccessToken(cachedAccessToken);
    }

    return await new Promise<FacebookAuthResult>((resolve) => {
      window.FB?.login(
        async (response) => {
          const accessToken = response.authResponse?.accessToken?.trim() || '';
          if (response.status !== 'connected' || !accessToken) {
            resolve(buildErrorResult('Login com Facebook cancelado ou não autorizado.'));
            return;
          }

          cachedAccessTokenRef.current = accessToken;
          resolve(await submitAccessToken(accessToken));
        },
        {
          scope: 'public_profile,email',
          return_scopes: true,
        },
      );
    });
  }, [appId, buildErrorResult, disabled, submitAccessToken]);

  return {
    available: Boolean(appId),
    sdkReady,
    isSubmitting,
    error: localError,
    signInWithFacebook,
  };
}
