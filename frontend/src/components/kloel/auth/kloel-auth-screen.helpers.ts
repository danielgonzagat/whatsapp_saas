/**
 * Pure helpers extracted from {@link ../auth/kloel-auth-screen.tsx} so the
 * component file stays focused on React state, hooks and JSX while the
 * deterministic logic (error-code messaging, URL-driven navigation, the
 * shared input style) is unit-testable in isolation.
 *
 * Behavior is preserved byte-for-byte — every function below is a verbatim
 * extraction of the original inline helper. Re-exporting via `kloel-auth-screen`
 * is intentional: callers that imported the helpers indirectly through the
 * component module keep working.
 */
import type { CSSProperties } from 'react';
import { colors } from '@/lib/design-tokens';

/** Sora font family declaration used by every auth-screen surface. */
export const KLOEL_AUTH_SCREEN_FONT = "var(--font-sora), 'Sora', sans-serif";

/**
 * Map an OAuth provider error code (and optional reason) to the seller-facing
 * message rendered above the login form. The function is total — every input
 * resolves to a non-empty Portuguese string so callers never need a fallback.
 *
 * Behavior:
 *  - `apple_auth_failed` + known reasons → specific Apple-flow message.
 *  - `tiktok_auth_failed` + known reasons → specific TikTok-flow message.
 *  - any other combination → generic "social auth failed" message.
 */
export function resolveOAuthErrorMessage(errorCode: string, reason: string): string {
  if (errorCode === 'apple_auth_failed') {
    if (reason === 'missing_identity_token') {
      return 'A Apple nao retornou o token de autenticacao. Tente novamente.';
    }
    if (reason === 'timeout') {
      return 'A autenticacao com Apple expirou. Tente novamente.';
    }
    return 'Falha ao autenticar com Apple.';
  }
  if (errorCode === 'tiktok_auth_failed') {
    if (reason === 'missing_code') {
      return 'O TikTok nao retornou o codigo de autorizacao. Tente novamente.';
    }
    if (reason === 'state_mismatch') {
      return 'A sessao de login com TikTok expirou ou ficou invalida. Tente novamente.';
    }
    if (reason === 'access_denied') {
      return 'O login com TikTok foi cancelado ou negado.';
    }
    if (reason === 'timeout') {
      return 'O TikTok demorou para responder. Tente novamente.';
    }
    if (
      reason === 'client_key_missing' ||
      reason === 'client_secret_missing' ||
      reason === 'backend_not_configured'
    ) {
      return 'Login com TikTok indisponivel no momento.';
    }
    if (reason === 'token_exchange_failed') {
      return 'Nao foi possivel validar o login com TikTok. Tente novamente.';
    }
    return 'Falha ao autenticar com TikTok.';
  }
  return 'Nao foi possivel concluir a autenticacao social.';
}

/**
 * Navigate the current window to `url` by synthesising a hidden anchor click.
 * Falls back to a no-op in non-browser contexts (SSR) so callers can invoke
 * the helper unconditionally.
 *
 * Why a synthetic anchor instead of `window.location.assign`: the anchor
 * carries `rel="noopener noreferrer"`, matching the security posture of every
 * link rendered by the auth surface — handy when destinations are cross-origin
 * (e.g. the buildAppUrl result).
 */
export function navigateCurrentWindow(url: string): void {
  if (typeof document === 'undefined') {
    return;
  }
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Shared CSS for every text input on the auth screen. Extracted so the
 * component does not allocate the same object on every render and so any UI
 * regression is caught by snapshot tests on the helper itself.
 */
export const KLOEL_AUTH_SCREEN_INPUT_BASE: CSSProperties = {
  width: '100%',
  height: 44,
  background: colors.background.surface,
  border: `1px solid ${colors.border.space}`,
  borderRadius: 6,
  padding: '0 14px',
  fontSize: 14,
  fontFamily: KLOEL_AUTH_SCREEN_FONT,
  color: colors.text.silver,
  outline: 'none',
  transition: 'border-color 150ms ease',
  boxSizing: 'border-box',
};
