export const LEGACY_PRODUCT_NAMES = ['GHK-Cu', 'PDRN'] as const;

function normalizeProductName(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '')
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
