const U0300__U036F_RE = /[\u0300-\u036f]/g;
const A_Z_A_Z0_9_RE = /[^a-zA-Z0-9]+/g;
export const LEGACY_PRODUCT_NAMES = ['GHK-Cu', 'PDRN'] as const;

function normalizeProductName(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(U0300__U036F_RE, '')
    .replace(A_Z_A_Z0_9_RE, '')
    .toLowerCase();
}

const LEGACY_PRODUCT_NAME_KEYS = new Set(
  LEGACY_PRODUCT_NAMES.map((name) => normalizeProductName(name)),
);

export function isLegacyProductName(value: string | null | undefined) {
  const normalized = normalizeProductName(value);
  if (!normalized) return false;
  return LEGACY_PRODUCT_NAME_KEYS.has(normalized);
}

export function filterLegacyProducts<T extends { name?: string | null }>(products: T[]) {
  return products.filter((product) => !isLegacyProductName(product?.name));
}
