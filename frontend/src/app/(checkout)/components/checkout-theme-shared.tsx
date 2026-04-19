'use client';

import type {
  PublicCheckoutMerchantInfo,
  PublicCheckoutTestimonial,
} from '@/lib/public-checkout-contract';
import type * as React from 'react';

const D_RE = /\D/g;
const RX_1_4_RE = /.{1,4}/g;

const S_RE = /\s+/;
const HTTPS_RE = /^https?:\/\//;

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

export const clampQty = (value: number) => Math.min(Math.max(1, Math.round(value || 1)), 99);

export interface CheckoutThemeStepTokens {
  activeBubbleBg: string;
  lockedBubbleBg: string;
  activeLabelColor: string;
  lockedLabelColor: string;
  activeShadow?: string;
  lineActive: string;
  lineInactive: string;
}

export interface CheckoutThemeInputTokens {
  background: string;
  border: string;
  text: string;
  radius: number;
  focusBorder: string;
  focusShadow: string;
  tagStroke: string;
  editStroke: string;
}

export const StepBubble = ({
  n,
  state,
  onClick,
  label,
  theme,
}: {
  n: number;
  state: 'active' | 'done' | 'locked';
  onClick?: () => void;
  label: string;
  theme: CheckoutThemeStepTokens;
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={state === 'locked' || !onClick}
    aria-disabled={state === 'locked' || !onClick}
    style={{
      background: 'none',
      border: 'none',
      padding: 0,
      cursor: state === 'locked' || !onClick ? 'default' : 'pointer',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6,
      opacity: state === 'locked' ? 0.35 : 1,
      transition: 'opacity 0.3s',
    }}
  >
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 16,
        background:
          state === 'done'
            ? theme.lineActive
            : state === 'active'
              ? theme.activeBubbleBg
              : theme.lockedBubbleBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.35s cubic-bezier(.4,0,.2,1)',
        boxShadow: state === 'active' ? theme.activeShadow || 'none' : 'none',
      }}
    >
      {state === 'done' ? (
        <Chk stroke="rgb(255, 255, 255)" />
      ) : (
        <span style={{ color: 'rgb(255, 255, 255)', fontSize: 14, fontWeight: 700 }}>{n}</span>
      )}
    </div>
    <span
      style={{
        fontSize: 11,
        fontWeight: state === 'active' ? 700 : 500,
        color: state === 'active' ? theme.activeLabelColor : theme.lockedLabelColor,
        textAlign: 'center',
        lineHeight: 1.3,
        maxWidth: 80,
      }}
    >
      {label}
    </span>
  </button>
);

export const StepLine = ({
  active,
  theme,
}: {
  active: boolean;
  theme: Pick<CheckoutThemeStepTokens, 'lineActive' | 'lineInactive'>;
}) => (
  <div
    style={{
      flex: 1,
      height: 2,
      background: active ? theme.lineActive : theme.lineInactive,
      transition: 'background 0.4s',
      marginTop: 17,
    }}
  />
);

export const Chk = ({ stroke = 'rgb(16, 185, 129)' }: { stroke?: string }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const Star = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="rgb(251, 191, 36)"
    stroke="none"
    aria-hidden="true"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

export const Ed = ({ stroke }: { stroke: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
);

export const ChDown = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

export const ChUp = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="18 15 12 9 6 15" />
  </svg>
);

export const Mn = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const Pl = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    aria-hidden="true"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

export const Px = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M6.5 6.5L12 12m0 0l5.5 5.5M12 12l5.5-5.5M12 12L6.5 17.5" />
  </svg>
);

export const Bc = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 8v8M10 8v8M14 8v8M17 8v8" />
  </svg>
);

export const Cc = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
    <line x1="1" y1="10" x2="23" y2="10" />
  </svg>
);

export const Tag = ({ stroke }: { stroke: string }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke={stroke}
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);

export function buildAvatar(name?: string) {
  const base = String(name || '').trim();
  if (!base) return 'KL';
  const parts = base.split(S_RE);
  return (parts[0]?.[0] || 'K') + (parts[1]?.[0] || parts[0]?.[1] || 'L');
}

export function normalizeTestimonials(
  brandName: string,
  fallbackTestimonials: Array<{ name: string; stars: number; text: string; avatar: string }>,
  testimonials?: PublicCheckoutTestimonial[],
  enabled?: boolean,
) {
  if (enabled === false) return [];
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

export function formatCnpj(value?: string | null) {
  const digits = String(value || '')
    .replace(D_RE, '')
    .slice(0, 14);
  if (digits.length !== 14) return value || '';
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
}

export function buildFooterPrimaryLine(brandName: string, merchant?: PublicCheckoutMerchantInfo) {
  const domain = String(merchant?.customDomain || '')
    .trim()
    .replace(HTTPS_RE, '');
  return `${brandName}: ${domain || 'pay.kloel.com'}`;
}

export function ValidationInput({
  id,
  name,
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled = false,
  autoComplete,
  inputMode,
  maxLength,
  style = {},
  theme,
}: {
  id?: string;
  name?: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  type?: string;
  disabled?: boolean;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  maxLength?: number;
  style?: React.CSSProperties;
  theme: CheckoutThemeInputTokens;
}) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        style={{
          width: '100%',
          padding: '13px 38px 13px 16px',
          background: theme.background,
          border: `1px solid ${theme.border}`,
          borderRadius: theme.radius,
          color: theme.text,
          fontSize: 15,
          fontFamily: "'DM Sans', sans-serif",
          transition: 'border-color 0.2s, box-shadow 0.2s',
          outline: 'none',
          cursor: disabled ? 'not-allowed' : 'text',
          ...style,
        }}
        onFocus={(event) => {
          if (disabled) return;
          event.target.style.borderColor = theme.focusBorder;
          event.target.style.boxShadow = theme.focusShadow;
        }}
        onBlur={(event) => {
          event.target.style.borderColor = theme.border;
          event.target.style.boxShadow = 'none';
        }}
      />
      {value.trim() ? (
        <span
          style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}
        >
          <Chk />
        </span>
      ) : null}
    </div>
  );
}
