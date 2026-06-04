import { formatBrlCents } from './product-nerve-center.shared';

// Pure helpers extracted from ProductNerveCenter.tsx to reduce the host
// component's cyclomatic complexity. Behaviour is preserved byte-for-byte.

const D_RE = /[^\d,.-]/g;
const D_3___D_RE = /\.(?=\d{3}(\D|$))/g;
const D_RE_2 = /\D/g;

/** _parse currency input. */
export const _parseCurrencyInput = (value: string) => {
  const normalized = String(value || '')
    .replace(D_RE, '')
    .replace(D_3___D_RE, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

/** _format currency mask. */
export const _formatCurrencyMask = (value: string) => {
  const digits = String(value || '').replace(D_RE_2, '');
  const cents = Number(digits || '0');
  return cents.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

/** _sanitize positive integer. */
export const _sanitizePositiveInteger = (value: string, fallback = 1) => {
  const parsed = Number.parseInt(String(value || '').replace(D_RE_2, ''), 10);
  return String(Number.isFinite(parsed) && parsed > 0 ? parsed : fallback);
};

/** Installment_options. */
export const INSTALLMENT_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1));

/** _shipping_labels. */
export const _SHIPPING_LABELS: Record<string, string> = {
  NONE: 'Sem frete',
  FREE: 'Frete grátis',
  FIXED: 'Frete fixo',
  VARIABLE: 'Frete variável',
};

/** Plan_shipping_options. */
export const PLAN_SHIPPING_OPTIONS = [
  { value: 'FREE', label: 'Frete grátis' },
  { value: 'FIXED', label: 'Frete fixo' },
  { value: 'VARIABLE', label: 'Frete variável' },
] as const;

/** Commission_type_options. */
export const COMMISSION_TYPE_OPTIONS = [
  { value: 'AMOUNT', label: 'Valor (R$)' },
  { value: 'PERCENT', label: 'Porcentagem (%)' },
] as const;

/** Normalize zip code input. */
export const normalizeZipCodeInput = (value: string) => {
  const digits = String(value || '')
    .replace(D_RE_2, '')
    .slice(0, 8);
  if (digits.length <= 5) {
    return digits;
  }
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

/** Parse percent value. */
export const parsePercentValue = (value: string, fallback = 1) => {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Format plan range label. */
export const formatPlanRangeLabel = (plans: Array<{ priceInCents?: number }>) => {
  const values = (plans || [])
    .map((plan) => Number(plan?.priceInCents || 0))
    .filter((value) => value > 0)
    .sort((left, right) => left - right);

  if (values.length === 0) {
    return 'Sem planos';
  }
  if (values[0] === values[values.length - 1]) {
    return formatBrlCents(values[0]);
  }
  return `${formatBrlCents(values[0])} ate ${formatBrlCents(values[values.length - 1])}`;
};

/** Build plan selection price label. */
export const buildPlanSelectionPriceLabel = (plan: { priceInCents?: number }) => {
  const cents = Math.max(0, Math.round(Number(plan?.priceInCents || 0)));
  return formatBrlCents(cents);
}


export type ProductCouponDiscountType = '%' | 'R$';

export interface ProductCouponFormState {
  code: string;
  type: ProductCouponDiscountType | string;
  value: string;
  maxUses: string;
  expiresAt: string;
}

export interface ProductCouponCreatePayload {
  code: string;
  discountType: 'FIXED' | 'PERCENT';
  discountValue: number;
  maxUses?: number;
  expiresAt?: string;
}

type ProductCouponValidationResult =
  | { ok: true; payload: ProductCouponCreatePayload }
  | { ok: false; field: keyof ProductCouponFormState; message: string };

function parseCouponNumber(value: string): number | null {
  const parsed = Number(String(value || '').trim().replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Build Product Nerve Center coupon payload from modal fields. */
export function buildProductCouponPayload(form: ProductCouponFormState): ProductCouponCreatePayload {
  const discountType = form.type === 'R$' ? 'FIXED' : 'PERCENT';
  const discountValue = parseCouponNumber(form.value) ?? 0;
  const maxUses = form.maxUses.trim() ? Number.parseInt(form.maxUses, 10) : undefined;

  return {
    code: form.code.trim().toUpperCase(),
    discountType,
    discountValue,
    ...(maxUses !== undefined ? { maxUses } : {}),
    ...(form.expiresAt.trim() ? { expiresAt: form.expiresAt.trim() } : {}),
  };
}

/** Validate Product Nerve Center coupon modal before POSTing to the backend. */
export function validateProductCouponForm(
  form: ProductCouponFormState,
): ProductCouponValidationResult {
  const code = form.code.trim();
  if (!code) {
    return { ok: false, field: 'code', message: 'Informe o codigo do cupom.' };
  }

  const discountValue = parseCouponNumber(form.value);
  if (discountValue === null || discountValue <= 0) {
    return { ok: false, field: 'value', message: 'Informe um valor de desconto maior que zero.' };
  }
  if (form.type !== 'R$' && discountValue > 100) {
    return { ok: false, field: 'value', message: 'O desconto percentual nao pode passar de 100%.' };
  }

  if (form.maxUses.trim()) {
    const maxUses = Number.parseInt(form.maxUses, 10);
    if (!Number.isFinite(maxUses) || maxUses <= 0 || String(maxUses) !== form.maxUses.trim()) {
      return { ok: false, field: 'maxUses', message: 'Informe um limite de usos inteiro maior que zero.' };
    }
  }

  if (form.expiresAt.trim() && Number.isNaN(Date.parse(form.expiresAt))) {
    return { ok: false, field: 'expiresAt', message: 'Informe uma data de expiracao valida.' };
  }

  return { ok: true, payload: buildProductCouponPayload(form) };
};
