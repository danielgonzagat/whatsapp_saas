import { adminAuthApi } from '@/lib/api/admin-auth-api';
import { AdminApiClientError } from '@/lib/api/admin-errors';
import type { MfaSetupPayload } from '@/lib/auth/admin-session-types';

const MISSING_TOKEN_ERROR = 'Token de configuração ausente. Faça login novamente.';
const SETUP_FETCH_ERROR = 'Erro inesperado ao gerar o segredo.';
const VERIFY_GENERIC_ERROR = 'Erro inesperado.';
const SIX_DIGIT_CODE_PATTERN = /^\d{6}$/;
const SIX_DIGIT_CODE_ERROR = 'Digite o código de 6 dígitos.';
const NON_DIGIT_PATTERN = /\D/g;

export const MFA_SETUP_COPY = {
  missingToken: MISSING_TOKEN_ERROR,
  setupFetchError: SETUP_FETCH_ERROR,
  verifyGenericError: VERIFY_GENERIC_ERROR,
  sixDigitCodeError: SIX_DIGIT_CODE_ERROR,
} as const;

/** Sanitize a code input so only digits remain. */
export function sanitizeMfaCode(value: string): string {
  return value.replace(NON_DIGIT_PATTERN, '');
}

/** True when the value is exactly six digits. */
export function isValidMfaCode(value: string): boolean {
  return SIX_DIGIT_CODE_PATTERN.test(value);
}

/** Resolve a user-facing error message from a failed API call. */
export function resolveAdminAuthError(error: unknown, fallback: string): string {
  if (error instanceof AdminApiClientError) {
    return error.message;
  }
  return fallback;
}

interface MfaSetupLoadHandlers {
  onSuccess(payload: MfaSetupPayload): void;
  onError(message: string): void;
  onSettled(): void;
  isCancelled(): boolean;
}

/** Begin the MFA setup fetch and wire the lifecycle handlers. */
export function loadMfaSetupPayload(setupToken: string, handlers: MfaSetupLoadHandlers): void {
  adminAuthApi
    .setupMfa(setupToken)
    .then((payload) => {
      if (handlers.isCancelled()) {
        return;
      }
      handlers.onSuccess(payload);
      handlers.onSettled();
    })
    .catch((err: unknown) => {
      if (handlers.isCancelled()) {
        return;
      }
      handlers.onError(resolveAdminAuthError(err, SETUP_FETCH_ERROR));
      handlers.onSettled();
    });
}
