/**
 * Pure helpers extracted from `auth-provider.tsx` so the component file stays
 * focused on React state wiring while shape-mapping, status→message mapping,
 * and the various `AuthState`/`Subscription` literals live in one
 * unit-testable place.
 *
 * Everything in this file is pure: no React, no DOM, no network, no module
 * side-effects. Importing it from a test or a non-React module is safe.
 */

export type SubscriptionStatus = 'none' | 'trial' | 'active' | 'expired' | 'suspended';

export interface Subscription {
  status: SubscriptionStatus;
  trialDaysLeft: number;
  creditsBalance: number;
  plan?: string | undefined;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Workspace {
  id: string;
  name: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  justSignedUp: boolean;
  hasCompletedOnboarding: boolean;
  user: User | null;
  workspace: Workspace | null;
  subscription: Subscription;
}

/** HTTP statuses the auth UI treats as "logged-out" (token rejected by API). */
export function isUnauthorizedStatus(status?: number): boolean {
  return status === 401 || status === 403;
}

/** Build the canonical empty subscription shape (no plan, no credits). */
export function buildEmptySubscription(): Subscription {
  return { status: 'none', trialDaysLeft: 0, creditsBalance: 0 };
}

/**
 * Build the canonical "no session" `AuthState` literal. Used at boot when no
 * token is present, on signOut, and after a 401/403 from `getMe`.
 *
 * `isLoading` is parameterised because the bootstrap path emits this shape
 * with `isLoading: true` (still resolving), while signOut/401 emit it with
 * `isLoading: false` (resolved as logged-out).
 */
export function buildEmptyAuthState(overrides?: Partial<Pick<AuthState, 'isLoading'>>): AuthState {
  return {
    isAuthenticated: false,
    isLoading: overrides?.isLoading ?? false,
    justSignedUp: false,
    hasCompletedOnboarding: false,
    user: null,
    workspace: null,
    subscription: buildEmptySubscription(),
  };
}

/**
 * Map the backend subscription DTO to the in-context `Subscription` shape.
 * Tolerant of partial payloads — every field has a defined zero.
 *
 * Returns `null` when the payload is missing so callers can keep the default
 * subscription untouched (the call-site contract pre-extraction).
 */
export function mapSubscriptionResponse(
  payload:
    | {
        status?: string | null | undefined;
        trialDaysLeft?: number | null | undefined;
        creditsBalance?: number | null | undefined;
        plan?: string | null | undefined;
      }
    | null
    | undefined,
): Subscription | null {
  if (!payload) {
    return null;
  }
  const status = (payload.status || 'none') as SubscriptionStatus;
  const out: Subscription = {
    status,
    trialDaysLeft: payload.trialDaysLeft || 0,
    creditsBalance: payload.creditsBalance || 0,
  };
  if (payload.plan != null) {
    out.plan = payload.plan;
  }
  return out;
}

/**
 * Map an `authApi` error response (status + error string) to a user-facing
 * PT-BR message. Used by every sign-in/sign-up path that calls the auth API
 * — collapses the repeated `if (res.status === 429) ...` ladders.
 *
 * `channel` selects the channel-specific phrasing for 503 (Google/Facebook
 * get a tailored message). For `magic-link`, the caller also wants the
 * server-supplied `error` echoed into `message`; the helper returns it
 * alongside so the call-site can attach it without duplicating the ladder.
 *
 * Returns `null` when the status is not one this helper handles — the caller
 * should fall back to the raw `res.error`. This is intentional: we don't
 * swallow novel errors behind a generic message.
 */
export type AuthErrorChannel = 'signup' | 'signin' | 'google' | 'facebook' | 'magic-link';

export function mapAuthErrorStatusToMessage(
  status: number | undefined,
  channel: AuthErrorChannel,
  rawError?: string,
): string | null {
  if (status === 409 && channel === 'signup') {
    return 'E-mail já cadastrado. Faça login.';
  }
  if (status === 429) {
    return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
  }
  if (status === 503) {
    if (channel === 'google') {
      return rawError || 'Login com Google indisponível no momento. Tente novamente em instantes.';
    }
    if (channel === 'facebook') {
      return rawError || 'Login com Facebook indisponível no momento. Tente novamente em instantes.';
    }
    return 'Serviço indisponível no momento. Tente novamente em instantes.';
  }
  return null;
}

/**
 * Pick the user's display name through the documented fallback chain:
 * 1. server-provided `user.name` (already trimmed by the backend)
 * 2. `fallbackName` passed by the call-site (the form input on signup)
 * 3. local-part of `fallbackEmail` (the form input on signin)
 * 4. local-part of `user.email` (always present on a successful auth)
 *
 * Returns the email local-part for both 3 and 4 — empty fallback collapses
 * to the next step automatically because `String.split('@')[0]` of a non-
 * empty email is non-empty.
 */
export function pickUserDisplayName(args: {
  userName?: string | null | undefined;
  userEmail: string;
  fallbackName?: string | undefined;
  fallbackEmail?: string | undefined;
}): string {
  if (args.userName && args.userName.length > 0) {
    return args.userName;
  }
  if (args.fallbackName && args.fallbackName.length > 0) {
    return args.fallbackName;
  }
  const fallbackLocal = args.fallbackEmail?.split('@')[0];
  if (fallbackLocal && fallbackLocal.length > 0) {
    return fallbackLocal;
  }
  return args.userEmail.split('@')[0] || '';
}

/**
 * Project a partial workspace into the strict `Workspace` shape used by
 * `AuthState`. Returns `null` when the input has no id — matches the
 * pre-extraction contract that an id-less workspace is no workspace.
 */
export function projectWorkspace(
  raw:
    | { id?: string | null | undefined; name?: string | null | undefined }
    | null
    | undefined,
): Workspace | null {
  if (!raw?.id) {
    return null;
  }
  return { id: raw.id, name: raw.name || 'Workspace' };
}
