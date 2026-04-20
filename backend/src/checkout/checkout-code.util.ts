import { randomInt } from 'node:crypto';

const A_Z0_9_RE = /[^A-Z0-9]/g;
const BASE36_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
/** Default_public_checkout_code_length. */
export const DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH = 8;
// SECURITY: regex built from numeric constant, not user input — no ReDoS risk.
const PUBLIC_CHECKOUT_CODE_REGEX = new RegExp(`^[A-Z0-9]{${DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH}}$`);

/** Normalize public checkout code. */
export function normalizePublicCheckoutCode(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(A_Z0_9_RE, '');
}

/** Is valid public checkout code. */
export function isValidPublicCheckoutCode(value: string | null | undefined) {
  return PUBLIC_CHECKOUT_CODE_REGEX.test(normalizePublicCheckoutCode(value));
}

/** Generate public checkout code. */
export function generatePublicCheckoutCode(length = DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH) {
  return Array.from({ length }, () => {
    const index = randomInt(CODE_ALPHABET.length);
    return CODE_ALPHABET[index];
  }).join('');
}

/** Generate secure base36 suffix. */
export function generateSecureBase36Suffix(length = 6) {
  return Array.from({ length }, () => {
    const index = randomInt(BASE36_ALPHABET.length);
    return BASE36_ALPHABET[index];
  }).join('');
}

/** Generate checkout order number. */
export function generateCheckoutOrderNumber(prefix = 'KL') {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}${generateSecureBase36Suffix(6)}`;
}

/** Generate unique public checkout code. */
export async function generateUniquePublicCheckoutCode(
  exists: (candidate: string) => Promise<boolean>,
  length = DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH,
) {
  const run = async (attempt: number): Promise<string> => {
    if (attempt >= 24) {
      throw new Error('Não foi possível gerar um código público único');
    }
    const candidate = generatePublicCheckoutCode(length);
    if (!(await exists(candidate))) {
      return candidate;
    }
    return run(attempt + 1);
  };

  return run(0);
}
