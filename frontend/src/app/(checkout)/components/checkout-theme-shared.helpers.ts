import type {
  PublicCheckoutMerchantInfo,
  PublicCheckoutTestimonial,
} from '@/lib/public-checkout-contract';

const D_RE = /\D/g;
const RX_1_4_RE = /.{1,4}/g;
const S_RE = /\s+/;
const HTTPS_RE = /^https?:\/\//;

/** Payment_badges. */
export const PAYMENT_BADGES = [
  'AMEX',
  'VISA',
  'Diners',
  'Master',
  'Discover',
  'Aura',
  'Elo',
  'Pix',
  'Boleto',
];

/** Fmt. */
export const fmt = {
  cpf: (value: string) => {
    const digits = value.replace(D_RE, '').slice(0, 11);
    return digits.length <= 3
      ? digits
      : digits.length <= 6
        ? `${digits.slice(0, 3)}.${digits.slice(3)}`
        : digits.length <= 9
          ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
          : `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  },
  phone: (value: string) => {
    const digits = value.replace(D_RE, '').slice(0, 11);
    return digits.length <= 2
      ? digits
      : digits.length <= 7
        ? `(${digits.slice(0, 2)}) ${digits.slice(2)}`
        : `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  },
  cep: (value: string) => {
    const digits = value.replace(D_RE, '').slice(0, 8);
    return digits.length <= 5 ? digits : `${digits.slice(0, 5)}-${digits.slice(5)}`;
  },
  card: (value: string) => {
    const digits = value.replace(D_RE, '').slice(0, 16);
    return digits.match(RX_1_4_RE)?.join(' ') || digits;
  },
  exp: (value: string) => {
    const digits = value.replace(D_RE, '').slice(0, 4);
    return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
  },
  brl: (cents: number) =>
    (Number(cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
};

/** Clamp qty. */
export const clampQty = (value: number) => Math.min(Math.max(1, Math.round(value || 1)), 99);

/** Checkout theme step tokens shape. */
export interface CheckoutThemeStepTokens {
  /** Active bubble bg property. */
  activeBubbleBg: string;
  /** Locked bubble bg property. */
  lockedBubbleBg: string;
  /** Active label color property. */
  activeLabelColor: string;
  /** Locked label color property. */
  lockedLabelColor: string;
  /** Active shadow property. */
  activeShadow?: string;
  /** Line active property. */
  lineActive: string;
  /** Line inactive property. */
  lineInactive: string;
}

/** Checkout theme input tokens shape. */
export interface CheckoutThemeInputTokens {
  /** Background property. */
  background: string;
  /** Border property. */
  border: string;
  /** Text property. */
  text: string;
  /** Radius property. */
  radius: number;
  /** Focus border property. */
  focusBorder: string;
  /** Focus shadow property. */
  focusShadow: string;
  /** Tag stroke property. */
  tagStroke: string;
  /** Edit stroke property. */
  editStroke: string;
}

/** Build avatar. */
export function buildAvatar(name?: string) {
  const base = String(name || '').trim();
  if (!base) {
    return 'KL';
  }
  const parts = base.split(S_RE);
  return (parts[0]?.[0] || 'K') + (parts[1]?.[0] || parts[0]?.[1] || 'L');
}

/** Normalize testimonials. */
export function normalizeTestimonials(
  brandName: string,
  fallbackTestimonials: Array<{ name: string; stars: number; text: string; avatar: string }>,
  testimonials?: PublicCheckoutTestimonial[],
  enabled?: boolean,
) {
  if (enabled === false) {
    return [];
  }
  if (Array.isArray(testimonials) && testimonials.length > 0) {
    return testimonials.slice(0, 3).map((item) => ({
      name: item.name || 'Cliente',
      stars: Number(item.rating || item.stars || 5),
      text: item.text || `Comprei ${brandName} e a experiência foi excelente.`,
      avatar: item.avatar || buildAvatar(item.name),
    }));
  }
  return fallbackTestimonials;
}

/** Format cnpj. */
export function formatCnpj(value?: string | null) {
  const digits = String(value || '')
    .replace(D_RE, '')
    .slice(0, 14);
  if (digits.length !== 14) {
    return value || '';
  }
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

/** Build footer primary line. */
export function buildFooterPrimaryLine(brandName: string, merchant?: PublicCheckoutMerchantInfo) {
  const domain = String(merchant?.customDomain || '')
    .trim()
    .replace(HTTPS_RE, '');
  return `${brandName}: ${domain || 'pay.kloel.com'}`;
}
