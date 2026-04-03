const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DEFAULT_CODE_LENGTH = 8;

export function generatePublicCheckoutCode(length = DEFAULT_CODE_LENGTH) {
  return Array.from({ length }, () => {
    const index = Math.floor(Math.random() * CODE_ALPHABET.length);
    return CODE_ALPHABET[index];
  }).join('');
}

export async function generateUniquePublicCheckoutCode(
  exists: (candidate: string) => Promise<boolean>,
  length = DEFAULT_CODE_LENGTH,
) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const candidate = generatePublicCheckoutCode(length);
    if (!(await exists(candidate))) {
      return candidate;
    }
  }

  throw new Error('Não foi possível gerar um código público único');
}
