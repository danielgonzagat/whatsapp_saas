/**
 * Pure helpers extracted from {@link ../auth/auth-modal.tsx} so the modal
 * keeps React state + JSX glue while the deterministic validation lives in a
 * unit-testable module. Behavior is preserved byte-for-byte — every function
 * below is a verbatim extraction of the original inline helper.
 */

/** Auth modal flow modes. */
export type AuthMode = 'signup' | 'login';

/** Two-step wizard state inside the modal. */
export type AuthStep = 'email' | 'details';

/** Shape returned by {@link getPasswordStrength}. Renders the strength meter. */
export interface PasswordStrength {
  level: number;
  label: string;
  color: string;
}

/**
 * Loose RFC-5322 email shape. Matches `local@domain.tld` with no whitespace.
 * Equivalent to the original inline `S_______S________S_RE` constant — name
 * normalized for readability while preserving the regex byte-for-byte.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Detects at least one uppercase ASCII letter. Pure data; mirrors `A_Z_RE`. */
export const UPPERCASE_PATTERN = /[A-Z]/;

/** Detects at least one ASCII digit. Pure data; mirrors `RX_0_9_RE`. */
export const DIGIT_PATTERN = /[0-9]/;

/**
 * True when `email` matches the loose RFC-5322 shape used by the modal.
 * Total function — empty string returns false.
 */
export function validateEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

/**
 * Score a password against the same five-band ladder rendered by the strength
 * meter. Levels:
 *   0 — empty
 *   1 — < 6 chars (Fraca)
 *   2 — 6–7 chars (Media)
 *   3 — ≥ 8 chars without both an uppercase AND a digit (Boa)
 *   4 — ≥ 8 chars with both an uppercase AND a digit (Forte)
 *
 * The returned `color` is a Tailwind utility class consumed verbatim by the
 * JSX renderer — do not translate to design tokens here; the modal owns that
 * decision.
 */
export function getPasswordStrength(pwd: string): PasswordStrength {
  if (pwd.length === 0) {
    return { level: 0, label: '', color: 'bg-gray-200' };
  }
  if (pwd.length < 6) {
    return { level: 1, label: 'Fraca', color: 'bg-red-500' };
  }
  if (pwd.length < 8) {
    return { level: 2, label: 'Media', color: 'bg-yellow-500' };
  }
  if (pwd.length >= 8 && UPPERCASE_PATTERN.test(pwd) && DIGIT_PATTERN.test(pwd)) {
    return { level: 4, label: 'Forte', color: 'bg-green-500' };
  }
  return { level: 3, label: 'Boa', color: 'bg-blue-500' };
}

/**
 * Compute the set of inline errors for the signup form. Returns an empty
 * object when the form is valid. Keys are field-scoped (`name`, `password`,
 * `confirmPassword`, `terms`) so the caller can place messages next to the
 * offending input.
 */
export function validateSignUpForm(input: {
  name: string;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.name.trim()) {
    errors.name = 'Nome e obrigatorio';
  }
  if (input.password.length < 8) {
    errors.password = 'Senha deve ter pelo menos 8 caracteres';
  }
  if (input.password !== input.confirmPassword) {
    errors.confirmPassword = 'As senhas nao coincidem';
  }
  if (!input.acceptedTerms) {
    errors.terms = 'Voce deve aceitar os termos';
  }
  return errors;
}

/**
 * Default copy used when a signup/Google auth call resolves with `success:false`
 * but no provider-supplied message. Centralized so the modal and any future
 * caller stay in lockstep on the user-facing fallback.
 */
export const SIGNUP_FALLBACK_ERROR = 'Erro ao criar conta. Tente novamente.';

/** Sign-in fallback used when no provider message is returned. */
export const SIGNIN_FALLBACK_ERROR = 'Email ou senha incorretos';

/** Google credential fallback used when no provider message is returned. */
export const GOOGLE_FALLBACK_ERROR = 'Falha ao autenticar com Google.';

/** Forgot-password missing-email guard message. */
export const FORGOT_MISSING_EMAIL_ERROR = 'Preencha o e-mail primeiro.';

/** Forgot-password provider failure fallback (when `res.error` is empty). */
export const FORGOT_REQUEST_ERROR = 'Erro ao enviar e-mail de recuperacao.';

/** Forgot-password network/thrown-exception fallback. */
export const FORGOT_NETWORK_ERROR = 'Erro ao enviar e-mail de recuperacao. Tente novamente.';

/** Signin guard when the user submits an empty password. */
export const SIGNIN_EMPTY_PASSWORD_ERROR = 'Digite sua senha';

/** Email-step guard when the input fails the {@link validateEmail} check. */
export const EMAIL_INVALID_ERROR = 'Digite um e-mail valido';

/**
 * Map an auth-provider result (signUp / signIn / signInWithGoogle) onto the
 * inline `errors` record used by the modal. The caller picks the field key
 * (`general` for signup/Google, `password` for sign-in) so the message lands
 * next to the appropriate input. Returns an empty record for `success:true`
 * results so the caller can `setErrors(mapAuthError(...))` without branching.
 */
export function mapAuthError(
  result: { success: boolean; error?: string | undefined },
  field: string,
  fallback: string,
): Record<string, string> {
  if (result.success) {
    return {};
  }
  return { [field]: result.error || fallback };
}

/**
 * State patch produced by {@link handleBack} and {@link switchMode}. Extracted
 * so the modal's reset logic stays declarative and unit-testable; the modal
 * keeps the React `setX` calls but the *shape* of the reset lives here.
 */
export interface FormResetPatch {
  password: string;
  confirmPassword: string;
  name: string;
  acceptedTerms: boolean;
  errors: Record<string, string>;
}

/**
 * Canonical empty-form patch shared by the modal's back-button and
 * switch-mode handlers. Behavior is preserved byte-for-byte vs. the original
 * inline reset block.
 */
export function buildFormResetPatch(): FormResetPatch {
  return {
    password: '',
    confirmPassword: '',
    name: '',
    acceptedTerms: false,
    errors: {},
  };
}
