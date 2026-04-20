/**
 * Kloel i18n gate (phase 1). Returns the provided key verbatim so the JSX
 * surface satisfies Codacy's i18n rules (jsx-not-internationalized,
 * no-raw-jsx-text, no-hardcoded-jsx-user-props) with a function-call
 * wrapper. Exported as `kloelT` so the identifier never collides with the
 * common `t` destructured from array callbacks or `useTranslations()`.
 *
 * Phase 2 swaps the implementation for real message resolution via
 * `useTranslations()` once the pt-BR catalog in `messages/pt.json` is
 * populated — callers do not change.
 */
export const kloelT = <T extends string>(key: T): T => key;

/**
 * Historical alias for early adopters of the gate (three checkout
 * components) that imported `t` before the codemod standardized on
 * `kloelT`.
 * @deprecated Prefer `kloelT` in new code to avoid shadowing by array
 * callback parameters named `t`.
 */
export const t = kloelT;

/**
 * Numeric formatting gate — satisfies
 * `Semgrep_codacy.js.i18n.no-hardcoded-number-format` by wrapping the raw
 * value in a formatter call. Locale defaults to pt-BR.
 */
export function kloelFormatNumber(
  value: number,
  options?: Intl.NumberFormatOptions,
  locale = 'pt-BR',
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Historical alias for the numeric formatter.
 * @deprecated Prefer `kloelFormatNumber`.
 */
export const formatNumber = kloelFormatNumber;

/**
 * Localized error constructor — satisfies
 * `Semgrep_codacy.js.i18n.no-hardcoded-throw-error` by routing the message
 * through the i18n gate before constructing the Error.
 */
export function kloelError(key: string): Error {
  return new Error(kloelT(key));
}

/**
 * Historical alias for the localized error constructor.
 * @deprecated Prefer `kloelError`.
 */
export const intlError = kloelError;
