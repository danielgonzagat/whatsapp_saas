'use client';

import { kloelT } from '@/lib/i18n/t';
import { useEffect, useRef, useState } from 'react';
import {
  buildGoogleRenderConfig,
  createGoogleCredentialCallback,
  resolveGoogleButtonWidth,
} from './google-sign-in-button.helpers';

type GoogleSignInButtonProps = {
  mode: 'signup' | 'login';
  disabled?: boolean;
  onCredential: (credential: string) => Promise<{ success: boolean; error?: string }>;
  onError?: (message: string) => void;
};

const GOOGLE_IDENTITY_SCRIPT_ID = 'google-identity-services';
const GOOGLE_IDENTITY_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/** Google sign in button. */
export function GoogleSignInButton({
  mode,
  disabled = false,
  onCredential,
  onError,
}: GoogleSignInButtonProps) {
  const buttonContainerRef = useRef<HTMLDivElement | null>(null);
  const initializedRef = useRef<string>('');
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || '';

  const [sdkReady, setSdkReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (clientId) {
      return;
    }
    const message =
      'Login com Google não configurado no frontend. Defina NEXT_PUBLIC_GOOGLE_CLIENT_ID.';
    setLocalError(message);
    onError?.(message);
  }, [clientId, onError]);

  useEffect(() => {
    if (!clientId) {
      return;
    }

    if (window.google?.accounts?.id) {
      setSdkReady(true);
      return;
    }

    let cancelled = false;

    const handleReady = () => {
      if (cancelled) {
        return;
      }
      setSdkReady(true);
    };

    const handleFailure = () => {
      if (cancelled) {
        return;
      }
      const message = 'Não foi possível carregar o login com Google.';
      setLocalError(message);
      onError?.(message);
    };

    const existingScript = document.getElementById(
      GOOGLE_IDENTITY_SCRIPT_ID,
    ) as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener('load', handleReady);
      existingScript.addEventListener('error', handleFailure);

      if (window.google?.accounts?.id) {
        setSdkReady(true);
      }

      return () => {
        cancelled = true;
        existingScript.removeEventListener('load', handleReady);
        existingScript.removeEventListener('error', handleFailure);
      };
    }

    const script = document.createElement('script');
    script.id = GOOGLE_IDENTITY_SCRIPT_ID;
    script.src = GOOGLE_IDENTITY_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', handleReady);
    script.addEventListener('error', handleFailure);
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      script.removeEventListener('load', handleReady);
      script.removeEventListener('error', handleFailure);
    };
  }, [clientId, onError]);

  useEffect(() => {
    if (!clientId || !sdkReady || !buttonContainerRef.current) {
      return;
    }
    if (!window.google?.accounts?.id) {
      return;
    }

    const target = buttonContainerRef.current;
    target.innerHTML = '';
    setLocalError(null);

    if (initializedRef.current !== clientId) {
      window.google.accounts.id.initialize({
        client_id: clientId,
        ux_mode: 'popup',
        auto_select: false,
        cancel_on_tap_outside: true,
        callback: createGoogleCredentialCallback({
          onCredential,
          setLocalError,
          setIsSubmitting,
          onError,
        }),
      });
      initializedRef.current = clientId;
    }

    const width = resolveGoogleButtonWidth(target);
    window.google.accounts.id.renderButton(target, buildGoogleRenderConfig(mode, width));
  }, [clientId, mode, onCredential, onError, sdkReady]);

  if (!clientId) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
        
        {kloelT(`Login com Google indisponível. Configure`)} <code>NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <div
          ref={buttonContainerRef}
          className="flex min-h-[44px] w-full items-center justify-center overflow-hidden rounded-xl"
        />
        {disabled || isSubmitting ? (
          <div className="absolute inset-0 rounded-xl bg-white/65" />
        ) : null}
      </div>
      {localError ? <p className="text-xs text-red-500">{localError}</p> : null}
    </div>
  );
}
