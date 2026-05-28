import { kloelFormatNumber, kloelT } from '@/lib/i18n/t';

/** Coupon shape. */
export interface Coupon {
  /** Id property. */
  id: string;
  /** Code property. */
  code: string;
  /** Discount type property. */
  discountType: string;
  /** Discount value property. */
  discountValue: number;
  /** Max uses property. */
  maxUses: number | null;
  /** Used count property. */
  usedCount: number;
  /** Expires at property. */
  expiresAt: string | null;
  /** Active flag. */
  active: boolean;
}

/** Coupon form shape used by ProductCouponsTab. */
export interface CouponForm {
  /** Code value. */
  code: string;
  /** Discount type value. */
  discountType: string;
  /** Discount value (string from input). */
  discountValue: string;
  /** Max uses (string from input). */
  maxUses: string;
  /** Expires at (date input string). */
  expiresAt: string;
}

/** Coupon create request payload sent to the backend. */
export interface CouponCreatePayload {
  /** Normalized coupon code. */
  code: string;
  /** Discount type. */
  discountType: string;
  /** Discount value as number. */
  discountValue: number;
  /** Max uses or null when unlimited. */
  maxUses: number | null;
  /** Expiration date string or null. */
  expiresAt: string | null;
}

/** Empty initial coupon form. */
export const EMPTY_COUPON_FORM: CouponForm = {
  code: '',
  discountType: 'PERCENT',
  discountValue: '',
  maxUses: '',
  expiresAt: '',
};

/** Localized copy used by the ProductCouponsTab. */
export const PRODUCT_COUPONS_COPY = {
  loadError: kloelT(`Falha ao carregar cupons`),
  createError: kloelT(`Falha ao criar cupom`),
  deleteError: kloelT(`Falha ao excluir cupom`),
  deleteTitle: kloelT(`Excluir cupom`),
  deleteDescription: kloelT(`Tem certeza que deseja excluir este cupom?`),
  closeModalAria: kloelT(`Fechar modal`),
  closeErrorAria: kloelT(`Fechar erro`),
  deleteCouponAria: kloelT(`Excluir cupom`),
  codePlaceholder: kloelT(`DESCONTO10`),
  createCoupon: kloelT(`Criar cupom`),
  creating: kloelT(`Criando...`),
  deleting: kloelT(`Excluindo...`),
  close: kloelT(`Fechar`),
  cancel: kloelT(`Cancelar`),
  confirmDelete: kloelT(`Excluir`),
  unlimited: kloelT(`Ilimitado`),
  noExpiration: kloelT(`Sem expiracao`),
  active: kloelT(`ATIVO`),
  inactive: kloelT(`INATIVO`),
  currencyPrefix: kloelT(`R$`),
  percentSuffix: kloelT(`%`),
} as const;

/** Convert a thrown error into a user-facing string, falling back to a default message. */
export function toCouponErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Format a coupon discount value with the appropriate suffix/prefix. */
export function formatCouponDiscountValue(coupon: Coupon): string {
  if (coupon.discountType === 'PERCENT') {
    return `${coupon.discountValue}${PRODUCT_COUPONS_COPY.percentSuffix}`;
  }

  return [
    PRODUCT_COUPONS_COPY.currencyPrefix,
    kloelFormatNumber(coupon.discountValue, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
  ].join(' ');
}

/** Format a coupon expiration date or return the "no expiration" copy. */
export function formatCouponExpiry(expiresAt: string | null): string {
  return expiresAt
    ? new Date(expiresAt).toLocaleDateString('pt-BR')
    : PRODUCT_COUPONS_COPY.noExpiration;
}

/** Build the payload sent to POST /products/:id/coupons from form values. */
export function buildCouponCreatePayload(form: CouponForm): CouponCreatePayload {
  return {
    code: form.code.toUpperCase(),
    discountType: form.discountType,
    discountValue: Number.parseFloat(form.discountValue) || 0,
    maxUses: Number.parseInt(form.maxUses, 10) || null,
    expiresAt: form.expiresAt || null,
  };
}

/** Normalize an API response into a strictly typed Coupon array. */
export function normalizeCouponList(response: unknown): Coupon[] {
  return Array.isArray(response) ? (response as Coupon[]) : [];
}

/** Coerce a value into a numeric coupon discount value (used by table render). */
export function coerceCouponDiscountValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

/** Format the max-uses column for the table render. */
export function formatCouponMaxUses(value: unknown): string {
  return value ? String(value) : PRODUCT_COUPONS_COPY.unlimited;
}

/** SWR cache predicate that matches any /products key. */
export function isProductsSwrKey(key: unknown): boolean {
  return typeof key === 'string' && key.startsWith('/products');
}
