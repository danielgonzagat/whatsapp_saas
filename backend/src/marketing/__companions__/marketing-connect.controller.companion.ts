export const EMAIL_VALIDATION_HTML_BODY =
  '<h1>Conexao validada</h1><p>Seu canal de email esta ativo dentro do Marketing do KLOEL.</p>';

export function extractSetupConfigField(
  setup: Record<string, unknown>,
  field: string,
  fallback: unknown,
) {
  const cfg =
    setup?.config && typeof setup.config === 'object'
      ? (setup.config as Record<string, unknown>)
      : null;
  return cfg ? (cfg[field] ?? fallback) : fallback;
}

export function serializeWhatsAppSelectedProduct(product: Record<string, unknown>) {
  const pickString = (v: unknown, fb: string) =>
    typeof v === 'string' && v.trim() ? v.trim() : fb;
  const pickOptional = (v: unknown, v2?: unknown): string | null => {
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v2 === 'string' && v2.trim()) return v2.trim();
    return null;
  };
  const id = pickString(
    product.id ?? (typeof product.productId === 'string' ? product.productId : ''),
    '',
  );
  return {
    id,
    name: pickString(product.name, 'Produto'),
    price: Number(product.price || 0) || 0,
    type: product.type === 'affiliate' ? 'affiliate' : 'own',
    affiliateComm: product.affiliateComm == null ? null : Number(product.affiliateComm || 0) || 0,
    imageUrl: pickOptional(product.imageUrl, product.image),
    producer: pickOptional(product.producer),
  };
}

export function normalizeWhatsAppSelectedProducts(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
    .map((item) => serializeWhatsAppSelectedProduct(item))
    .filter((product) => product.id);
}
