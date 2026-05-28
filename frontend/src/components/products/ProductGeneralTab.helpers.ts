import { kloelT } from '@/lib/i18n/t';

/** Product data shape consumed by ProductGeneralTab. */
export interface ProductData {
  /** Product id (uuid). */
  id: string;
  /** Product name. */
  name: string;
  /** Long-form description. */
  description: string;
  /** Base price (decimal). */
  price: number;
  /** Category label. */
  category: string;
  /** Free-form tags (max 5 enforced in UI). */
  tags: string[];
  /** Format enum: PHYSICAL | DIGITAL | HYBRID. */
  format: string;
  /** Image asset URL. */
  imageUrl: string;
  /** Whether the product is available for purchase. */
  active: boolean;
  /** Product approval status (e.g. APPROVED). */
  status: string;
  /** Public sales page URL. */
  salesPageUrl: string;
  /** Default thank-you page URL. */
  thankyouUrl: string;
  /** Thank-you page URL for boleto orders. */
  thankyouBoletoUrl: string;
  /** Thank-you page URL for PIX orders. */
  thankyouPixUrl: string;
  /** Reclame Aqui complaint board URL. */
  reclameAquiUrl: string;
  /** Customer support email. */
  supportEmail: string;
  /** Warranty period in days (nullable). */
  warrantyDays: number | null;
  /** Whether the product is a free sample. */
  isSample: boolean;
  /** Shipping mode: VARIABLE | FIXED | FREE. */
  shippingType: string;
  /** Fixed shipping value (only used when shippingType === 'FIXED'). */
  shippingValue: number | null;
  /** Origin CEP for physical shipments. */
  originCep: string;
}

/** Option used to render the shipping-type select. */
export interface ShippingTypeOption {
  /** Backend enum value. */
  value: string;
  /** UI label. */
  label: string;
}

/** Option used to render the product-format radio group. */
export interface FormatOption {
  /** Backend enum value (PHYSICAL/DIGITAL/HYBRID). */
  value: string;
  /** UI label. */
  label: string;
}

/** URL field definition rendered in the URLs section. */
export interface UrlFieldDescriptor {
  /** Property name on ProductData. */
  key: keyof ProductData;
  /** UI label. */
  label: string;
}

/** Available shipping modes for physical/hybrid products. */
export const SHIPPING_TYPES: readonly ShippingTypeOption[] = [
  { value: 'VARIABLE', label: 'Variavel/Gratis' },
  { value: 'FIXED', label: 'Fixo' },
  { value: 'FREE', label: 'Sem frete' },
] as const;

/** Product format options rendered in the format radio group. */
export const FORMAT_OPTIONS: readonly FormatOption[] = [
  { value: 'PHYSICAL', label: 'Fisico' },
  { value: 'DIGITAL', label: 'Digital' },
  { value: 'HYBRID', label: 'Hibrido' },
] as const;

/** URL fields rendered as the "URLs" grid. */
export const URL_FIELDS: readonly UrlFieldDescriptor[] = [
  { key: 'salesPageUrl', label: 'Pagina de vendas' },
  { key: 'thankyouUrl', label: 'Pagina de obrigado' },
  { key: 'thankyouPixUrl', label: 'Obrigado (PIX)' },
  { key: 'reclameAquiUrl', label: 'Reclame Aqui' },
  { key: 'supportEmail', label: 'E-mail de suporte' },
] as const;

/** Localized copy used by the ProductGeneralTab UI. */
export const PRODUCT_GENERAL_COPY = {
  notFound: kloelT(`Produto nao encontrado.`),
  available: kloelT(`Disponivel para venda`),
  nameLabel: kloelT(`Nome *`),
  descriptionLabel: kloelT(`Descricao`),
  categoryLabel: kloelT(`Categoria`),
  selectPlaceholder: kloelT(`Selecione`),
  loadingPlaceholder: kloelT(`Carregando...`),
  loadCategoriesError: kloelT(`Erro ao carregar categorias`),
  emptyCategoriesHint: kloelT(`Nenhuma categoria — crie um produto primeiro`),
  tagsLabel: kloelT(`Tags (max. 5)`),
  formatLabel: kloelT(`Formato`),
  originCepLabel: kloelT(`CEP de origem`),
  urlsHeading: kloelT(`URLs`),
  shippingHeading: kloelT(`Configuracao de envio`),
  warrantyLabel: kloelT(`Tempo de garantia (dias)`),
  shippingTypeLabel: kloelT(`Tipo de frete`),
  shippingValueLabel: kloelT(`Valor do frete`),
  isSampleLabel: kloelT(`E amostra gratis?`),
  codeLabel: kloelT(`Codigo:`),
  imageLabel: kloelT(`Foto do produto`),
  imageHint: kloelT(`JPG, PNG ou WebP - 500x400px ideal - Max 10MB`),
} as const;

/** Format label fallback map (kept in sync with FORMAT_OPTIONS). */
const FORMAT_LABEL_MAP: Readonly<Record<string, string>> = {
  PHYSICAL: 'Fisico',
  DIGITAL: 'Digital',
  HYBRID: 'Hibrido',
};

/** Resolve the human label for a product format. Unknown values fall back to 'Hibrido' (legacy UI default). */
export function resolveFormatLabel(format: string | null | undefined): string {
  if (!format) {
    return FORMAT_LABEL_MAP.HYBRID;
  }
  return FORMAT_LABEL_MAP[format] ?? FORMAT_LABEL_MAP.HYBRID;
}

/** Whether the supplied product format requires shipping fields. */
export function needsShipping(format: string | null | undefined): boolean {
  return format === 'PHYSICAL' || format === 'HYBRID';
}

/** Whether the supplied shipping type requires a numeric value. */
export function shippingRequiresValue(shippingType: string | null | undefined): boolean {
  return shippingType === 'FIXED';
}

/** Parse a free-form warranty input into a non-negative integer day count, or null. */
export function parseWarrantyDays(input: string | null | undefined): number | null {
  if (input == null) {
    return null;
  }
  const trimmed = String(input).trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

/** Parse a free-form currency input into a non-negative decimal value, or null. */
export function parseShippingValue(input: string | null | undefined): number | null {
  if (input == null) {
    return null;
  }
  const trimmed = String(input).trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseFloat(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

/** Short product code rendered in the info-box (first 8 chars of the id). */
export function shortProductCode(id: string | null | undefined): string {
  if (!id) {
    return '';
  }
  return String(id).slice(0, 8);
}

/** Whether a status string corresponds to the "approved" emphasis state. */
export function isApprovedStatus(status: string | null | undefined): boolean {
  return status === 'APPROVED';
}

/** SWR cache predicate that matches any /products key (used after save). */
export function isProductsSwrKey(key: unknown): boolean {
  return typeof key === 'string' && key.startsWith('/products');
}

/** Tags should be coerced into an array even when the backend returns null/undefined. */
export function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) {
    return tags.filter((tag): tag is string => typeof tag === 'string');
  }
  return [];
}

/** Whether to attach the email placeholder to a URL/Email input field. */
export function isEmailFieldKey(key: string): boolean {
  return key.includes('Email');
}

/** Placeholder rendered for URL/email fields. */
export function urlOrEmailPlaceholder(key: string): string {
  return isEmailFieldKey(key) ? 'suporte@...' : 'https://...';
}

/** Storage key for the per-product image preview snapshot. */
export function productPreviewStorageKey(productId: string): string {
  return `kloel_product_general_preview_${productId}`;
}

/** Save-button label state machine (kept side-effect free for testing). */
export function saveButtonLabel(state: {
  saving: boolean;
  saved: boolean;
}): string {
  if (state.saved) {
    return 'Salvo!';
  }
  if (state.saving) {
    return 'Salvando...';
  }
  return 'Salvar';
}

/** Immutable patch helper — returns a new product object with `field` set to `value`. */
export function applyProductPatch<K extends keyof ProductData>(
  data: ProductData,
  field: K,
  value: ProductData[K],
): ProductData {
  return { ...data, [field]: value };
}
