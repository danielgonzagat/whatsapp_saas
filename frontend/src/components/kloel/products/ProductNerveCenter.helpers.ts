import { formatBrlCents } from './product-nerve-center.shared';

// Pure helpers extracted from ProductNerveCenter.tsx to reduce the host
// component's cyclomatic complexity. Behaviour is preserved byte-for-byte.

const D_RE = /[^\d,.-]/g;
const D_3___D_RE = /\.(?=\d{3}(\D|$))/g;
const D_RE_2 = /\D/g;

export const _parseCurrencyInput = (value: string) => {
  const normalized = String(value || '')
    .replace(D_RE, '')
    .replace(D_3___D_RE, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const _formatCurrencyMask = (value: string) => {
  const digits = String(value || '').replace(D_RE_2, '');
  const cents = Number(digits || '0');
  return cents.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const _sanitizePositiveInteger = (value: string, fallback = 1) => {
  const parsed = Number.parseInt(String(value || '').replace(D_RE_2, ''), 10);
  return String(Number.isFinite(parsed) && parsed > 0 ? parsed : fallback);
};

export const INSTALLMENT_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1));

export const _SHIPPING_LABELS: Record<string, string> = {
  NONE: 'Sem frete',
  FREE: 'Frete grátis',
  FIXED: 'Frete fixo',
  VARIABLE: 'Frete variável',
};

export const PLAN_SHIPPING_OPTIONS = [
  { value: 'FREE', label: 'Frete grátis' },
  { value: 'FIXED', label: 'Frete fixo' },
  { value: 'VARIABLE', label: 'Frete variável' },
] as const;

export const COMMISSION_TYPE_OPTIONS = [
  { value: 'AMOUNT', label: 'Valor (R$)' },
  { value: 'PERCENT', label: 'Porcentagem (%)' },
] as const;

export const normalizeZipCodeInput = (value: string) => {
  const digits = String(value || '')
    .replace(D_RE_2, '')
    .slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
};

export const parsePercentValue = (value: string, fallback = 1) => {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const formatPlanRangeLabel = (plans: Array<{ priceInCents?: number }>) => {
  const values = (plans || [])
    .map((plan) => Number(plan?.priceInCents || 0))
    .filter((value) => value > 0)
    .sort((left, right) => left - right);

  if (values.length === 0) return 'Sem planos';
  if (values[0] === values[values.length - 1]) return formatBrlCents(values[0]);
  return `${formatBrlCents(values[0])} ate ${formatBrlCents(values[values.length - 1])}`;
};

export const buildPlanSelectionPriceLabel = (plan: { priceInCents?: number }) => {
  const cents = Math.max(0, Math.round(Number(plan?.priceInCents || 0)));
  return formatBrlCents(cents);
};
