const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH = 8;
const PUBLIC_CHECKOUT_CODE_REGEX = new RegExp(`^[A-Z0-9]{${DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH}}$`);

export function normalizePublicCheckoutCode(value: string | null | undefined) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

export function isValidPublicCheckoutCode(value: string | null | undefined) {
  return PUBLIC_CHECKOUT_CODE_REGEX.test(normalizePublicCheckoutCode(value));
}

export function generatePublicCheckoutCode(length = DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH) {
  return Array.from({ length }, () => {
    const index = Math.floor(Math.random() * CODE_ALPHABET.length);
    return CODE_ALPHABET[index];
  }).join('');
}

export async function generateUniquePublicCheckoutCode(
  exists: (candidate: string) => Promise<boolean>,
  length = DEFAULT_PUBLIC_CHECKOUT_CODE_LENGTH,
) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = generatePublicCheckoutCode(length);
    if (!(await exists(candidate))) {
      return candidate;
    }
  }

  throw new Error('Não foi possível gerar um código público único');
}
