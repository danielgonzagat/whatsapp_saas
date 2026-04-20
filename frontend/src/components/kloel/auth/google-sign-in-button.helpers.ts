// Pure helpers extracted from google-sign-in-button.tsx to reduce cyclomatic
// complexity on the init/render useEffect. Behaviour is byte-identical to the
// original inline implementation.

export interface GoogleCredentialResult {
  success: boolean;
  error?: string;
}

export interface GoogleButtonCallbackDeps {
  onCredential: (credential: string) => Promise<GoogleCredentialResult>;
  setLocalError: (value: string | null) => void;
  setIsSubmitting: (value: boolean) => void;
  onError?: (message: string) => void;
}

export function createGoogleCredentialCallback(deps: GoogleButtonCallbackDeps) {
  return async (response: { credential?: string }) => {
    const credential = response.credential?.trim();
    if (!credential) {
      const message = 'Google não retornou uma credencial válida.';
      deps.setLocalError(message);
      deps.onError?.(message);
      return;
    }

    deps.setIsSubmitting(true);
    deps.setLocalError(null);

    try {
      const result = await deps.onCredential(credential);
      if (!result.success) {
        const message = result.error || 'Falha ao autenticar com Google.';
        deps.setLocalError(message);
        deps.onError?.(message);
      }
    } finally {
      deps.setIsSubmitting(false);
    }
  };
}

export function resolveGoogleButtonWidth(target: HTMLElement): number {
  return Math.max(280, Math.min(360, target.clientWidth || 320));
}

export function buildGoogleRenderConfig(mode: 'signup' | 'login', width: number) {
  return {
    type: 'standard' as const,
    theme: 'outline' as const,
    size: 'large' as const,
    text: (mode === 'signup' ? 'signup_with' : 'signin_with') as 'signup_with' | 'signin_with',
    shape: 'rectangular' as const,
    logo_alignment: 'left' as const,
    width,
  };
}
