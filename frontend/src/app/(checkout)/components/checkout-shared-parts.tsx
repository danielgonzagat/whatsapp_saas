'use client';

/**
 * checkout-shared-parts.tsx
 *
 * Canonical implementations of all checkout sub-components that are
 * structurally identical between CheckoutNoir and CheckoutBlanc.
 * Each component accepts a `CheckoutVisualTheme` (from checkout-theme-tokens.ts)
 * so there is exactly ONE copy of each primitive.
 *
 * CheckoutNoir.order-summary.parts and CheckoutBlanc.order-summary.parts
 * re-export from here, preserving backward-compatible surface APIs.
 */

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import Image from 'next/image';
import type * as React from 'react';
import {
  Bc,
  Cc,
  Mn,
  PAYMENT_BADGES,
  Pl,
  Px,
  Star,
  Tag as SharedTag,
  ValidationInput as SharedValidationInput,
  clampQty,
  fmt,
} from './checkout-theme-shared';
import type { CheckoutThemeInputTokens } from './checkout-theme-shared';
import type { CheckoutVisualTheme } from './checkout-theme-tokens';

// ---------------------------------------------------------------------------
// Re-export SVG icons so callers that previously imported from the parts files
// can keep doing so without changes.
// ---------------------------------------------------------------------------
export { Bc, Cc, Px };

// ---------------------------------------------------------------------------
// Testimonial type shared across both themes
// ---------------------------------------------------------------------------
export interface CheckoutTestimonial {
  name: string;
  stars: number;
  text: string;
  avatar: string;
}

const STAR_SLOTS = ['one', 'two', 'three', 'four', 'five'] as const;

// ---------------------------------------------------------------------------
// ProductThumb
// ---------------------------------------------------------------------------
export function ProductThumb({
  productImage,
  productName,
  size,
  theme,
}: {
  productImage: string | null;
  productName: string;
  size: number;
  theme: Pick<CheckoutVisualTheme, 'mutedCardBackground' | 'mutedText'>;
}) {
  if (productImage) {
    return (
      <Image
        src={productImage}
        alt={productName}
        unoptimized
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: UI.radiusMd,
          objectFit: 'cover',
          display: 'block',
          flexShrink: 0,
          background: theme.mutedCardBackground,
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: UI.radiusMd,
        background: theme.mutedCardBackground,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        color: theme.mutedText,
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {kloelT(`Produto`)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CouponRow
// ---------------------------------------------------------------------------
export function CouponRow({
  couponCode,
  setCouponCode,
  couponError,
  applyCoupon,
  theme,
}: {
  couponCode: string;
  setCouponCode: (v: string) => void;
  couponError: string | null;
  applyCoupon: () => Promise<void>;
  theme: Pick<CheckoutVisualTheme, 'text' | 'accent' | 'input'> & {
    input: Pick<CheckoutThemeInputTokens, 'background' | 'border' | 'tagStroke'>;
  };
}) {
  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 10 }}>
        {kloelT(`Tem um cupom?`)}
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'center' }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '0 14px',
            border: `1px solid ${theme.input.border}`,
            borderRadius: UI.radiusMd,
            background: theme.input.background,
            minWidth: 0,
          }}
        >
          <SharedTag stroke={theme.input.tagStroke} />
          <input
            value={couponCode}
            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
            placeholder={kloelT(`Código do cupom`)}
            style={{
              flex: 1,
              padding: '12px 0',
              border: 'none',
              fontSize: 14,
              outline: 'none',
              background: 'transparent',
              color: theme.text,
              fontFamily: "'DM Sans',sans-serif",
              minWidth: 0,
            }}
          />
        </div>
        <button
          type="button"
          onClick={() => void applyCoupon()}
          style={{
            background: 'none',
            border: 'none',
            color: theme.accent,
            fontSize: 15,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {kloelT(`Aplicar`)}
        </button>
      </div>
      {couponError ? (
        <div style={{ fontSize: 12, color: UI.error, marginBottom: 10 }}>{couponError}</div>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// PricingBreakdown
// ---------------------------------------------------------------------------
export function PricingBreakdown({
  subtotal,
  shippingInCents,
  couponApplied,
  discount,
  payMethod,
  pricing,
  totalWithInterest,
  theme,
}: {
  subtotal: number;
  shippingInCents: number;
  couponApplied: boolean;
  discount: number;
  payMethod: string;
  pricing: { installmentInterestInCents: number };
  totalWithInterest: number;
  theme: Pick<
    CheckoutVisualTheme,
    'text' | 'mutedText' | 'accent' | 'successText' | 'totalAccent' | 'cardBorder'
  >;
}) {
  return (
    <div
      style={{
        background: 'rgba(128,128,128,0.06)',
        borderRadius: UI.radiusMd,
        padding: '16px 18px',
        borderLeft: `3px solid ${theme.accent}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 15,
          fontWeight: 700,
          color: theme.text,
          marginBottom: 8,
        }}
      >
        <span>{kloelT(`Produtos`)}</span>
        <span>{fmt.brl(subtotal)}</span>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 15,
          fontWeight: 700,
          color: theme.text,
          marginBottom: 8,
        }}
      >
        <span>{kloelT(`Frete`)}</span>
        <span>{shippingInCents === 0 ? 'Grátis' : fmt.brl(shippingInCents)}</span>
      </div>
      {couponApplied ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 15,
            color: theme.successText,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          <span>{kloelT(`Desconto`)}</span>
          <span>-{fmt.brl(discount)}</span>
        </div>
      ) : null}
      {payMethod === 'card' && pricing.installmentInterestInCents > 0 ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 15,
            color: theme.accent,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          <span>{kloelT(`Juros do parcelamento`)}</span>
          <span>{fmt.brl(pricing.installmentInterestInCents)}</span>
        </div>
      ) : null}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 4,
        }}
      >
        <span style={{ fontSize: 15, color: theme.totalAccent, fontWeight: 400 }}>
          {kloelT(`Total`)}
        </span>
        <span style={{ fontSize: 20, fontWeight: 700, color: theme.totalAccent }}>
          {fmt.brl(totalWithInterest)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// QtyControl
// ---------------------------------------------------------------------------
export function QtyControl({
  qty,
  setQty,
  theme,
  size,
}: {
  qty: number;
  setQty: (fn: (prev: number) => number) => void;
  theme: Pick<CheckoutVisualTheme, 'text' | 'mutedText' | 'mutedCardBackground'>;
  size: 'sm' | 'lg';
}) {
  const padding = size === 'lg' ? '10px 22px' : '8px 18px';
  const spanPadding = size === 'lg' ? '10px 24px' : '8px 20px';
  const spanFontSize = size === 'lg' ? 17 : 16;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        background: theme.mutedCardBackground,
        borderRadius: UI.radiusMd,
        overflow: 'hidden',
        width: size === 'sm' ? 'fit-content' : undefined,
      }}
    >
      <button
        type="button"
        onClick={() => setQty((v) => clampQty(v - 1))}
        style={{
          padding,
          background: 'transparent',
          border: 'none',
          color: theme.mutedText,
          fontSize: size === 'lg' ? 18 : undefined,
          display: size === 'sm' ? 'flex' : undefined,
          alignItems: size === 'sm' ? 'center' : undefined,
        }}
      >
        <Mn />
      </button>
      <span
        style={{ padding: spanPadding, fontSize: spanFontSize, fontWeight: 700, color: theme.text }}
      >
        {qty}
      </span>
      <button
        type="button"
        onClick={() => setQty((v) => clampQty(v + 1))}
        style={{
          padding,
          background: 'transparent',
          border: 'none',
          color: theme.mutedText,
          fontSize: size === 'lg' ? 18 : undefined,
          display: size === 'sm' ? 'flex' : undefined,
          alignItems: size === 'sm' ? 'center' : undefined,
        }}
      >
        <Pl />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TestimonialCard
// ---------------------------------------------------------------------------
export function TestimonialCard({
  testimonial,
  theme,
}: {
  testimonial: CheckoutTestimonial;
  theme: Pick<
    CheckoutVisualTheme,
    'cardBackground' | 'cardBorder' | 'mutedCardBackground' | 'mutedText' | 'softMutedText' | 'text'
  >;
}) {
  const { name, stars, text, avatar } = testimonial;
  return (
    <div
      style={{
        background: theme.cardBackground,
        border: `1px solid ${theme.cardBorder}`,
        borderRadius: UI.radiusMd,
        padding: '16px 18px',
        marginTop: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: UI.radiusFull,
            background: theme.mutedCardBackground,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 14,
            fontWeight: 700,
            color: theme.mutedText,
            flexShrink: 0,
          }}
        >
          {avatar}
        </div>
        <div>
          <div style={{ display: 'flex', gap: 2, marginBottom: 2 }}>
            {STAR_SLOTS.slice(0, stars).map((slot) => (
              <Star key={`${name}-${slot}`} />
            ))}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>{name}</div>
        </div>
      </div>
      <p style={{ fontSize: 13, color: theme.softMutedText, lineHeight: 1.5 }}>{text}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CardPaymentFields
// ---------------------------------------------------------------------------
export type SharedCardForm = {
  cardNumber: string;
  cardName: string;
  cardExp: string;
  cardCvv: string;
  cardCpf: string;
  installments: string;
};

export function CardPaymentFields({
  fid,
  form,
  updateField,
  installmentOptions,
  pricing,
  inputTheme,
  theme,
  L,
  fmtFn,
}: {
  fid: string;
  form: SharedCardForm;
  updateField: (field: string) => React.ChangeEventHandler<HTMLSelectElement | HTMLInputElement>;
  installmentOptions: { value: string; label: string }[];
  pricing: { installmentInterestInCents: number };
  inputTheme: CheckoutThemeInputTokens;
  theme: Pick<
    CheckoutVisualTheme,
    | 'mutedCardBackground'
    | 'paymentBadgeBackground'
    | 'paymentBadgeBorder'
    | 'paymentBadgeText'
    | 'mutedText'
    | 'text'
    | 'input'
  >;
  L: React.CSSProperties;
  fmtFn: { brl: (v: number) => string };
}) {
  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {PAYMENT_BADGES.filter((item) => item !== 'Pix' && item !== 'Boleto').map((brand) => (
          <span
            key={brand}
            style={{
              padding: '3px 8px',
              background: theme.paymentBadgeBackground,
              border: `1px solid ${theme.paymentBadgeBorder}`,
              borderRadius: UI.radiusSm,
              fontSize: 9,
              fontWeight: 700,
              color: theme.paymentBadgeText,
            }}
          >
            {brand}
          </span>
        ))}
      </div>
      <div
        style={{
          background: UI.surface,
          borderRadius: UI.radiusMd,
          padding: 18,
          color: UI.bg,
          fontFamily: 'monospace',
          marginBottom: 16,
          minHeight: 150,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            width: 36,
            height: 24,
            borderRadius: UI.radiusSm,
            background: 'rgba(255,255,255,0.2)',
          }}
        />
        <div
          style={{
            display: 'flex',
            gap: 14,
            fontSize: 16,
            letterSpacing: '0.12em',
            margin: '14px 0',
          }}
        >
          {[0, 1, 2, 3].map((group) => (
            <span key={group}>{form.cardNumber.split(' ')[group] || '••••'}</span>
          ))}
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          <span>{form.cardName || 'NOME E SOBRENOME'}</span>
          <span>
            <span style={{ fontSize: 8 }}>validade</span> {form.cardExp || '••/••'}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label htmlFor={`${fid}-card-number`} style={L}>
            {kloelT(`Número do cartão`)}
          </label>
          <SharedValidationInput
            theme={inputTheme}
            id={`${fid}-card-number`}
            value={form.cardNumber}
            onChange={updateField('cardNumber')}
            placeholder={kloelT(`1234 1234 1234 1234`)}
          />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor={`${fid}-card-exp`} style={L}>
              {kloelT(`Validade`)} <span style={{ opacity: 0.5 }}>{kloelT(`(mês/ano)`)}</span>
            </label>
            <SharedValidationInput
              theme={inputTheme}
              id={`${fid}-card-exp`}
              value={form.cardExp}
              onChange={updateField('cardExp')}
              placeholder={kloelT(`MM/AA`)}
            />
          </div>
          <div style={{ flex: '0 0 38%' }}>
            <label htmlFor={`${fid}-card-cvv`} style={L}>
              {kloelT(`Cód. de segurança`)}
            </label>
            <SharedValidationInput
              theme={inputTheme}
              id={`${fid}-card-cvv`}
              value={form.cardCvv}
              onChange={updateField('cardCvv')}
              placeholder={kloelT(`•••`)}
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${fid}-card-name`} style={L}>
            {kloelT(`Nome e sobrenome do titular`)}
          </label>
          <SharedValidationInput
            theme={inputTheme}
            id={`${fid}-card-name`}
            value={form.cardName}
            onChange={updateField('cardName')}
            placeholder={kloelT(`ex.: Maria de Almeida Cruz`)}
          />
        </div>
        <div>
          <label htmlFor={`${fid}-card-cpf`} style={L}>
            {kloelT(`CPF do titular`)}
          </label>
          <SharedValidationInput
            theme={inputTheme}
            id={`${fid}-card-cpf`}
            value={form.cardCpf}
            onChange={updateField('cardCpf')}
            placeholder="000.000.000-00"
          />
        </div>
        <div>
          <label htmlFor={`${fid}-installments`} style={L}>
            {kloelT(`Nº de Parcelas`)}
          </label>
          <select
            id={`${fid}-installments`}
            value={form.installments}
            onChange={updateField('installments')}
            style={{
              width: '100%',
              padding: '13px 16px',
              background: inputTheme.background,
              border: `1px solid ${inputTheme.border}`,
              borderRadius: UI.radiusMd,
              fontSize: 15,
              color: inputTheme.text,
              fontFamily: "'DM Sans',sans-serif",
              outline: 'none',
            }}
          >
            {installmentOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <div style={{ fontSize: 11, color: theme.mutedText, marginTop: 4 }}>
            {pricing.installmentInterestInCents > 0
              ? `Juros total do parcelamento: ${fmtFn.brl(pricing.installmentInterestInCents)}`
              : 'Parcelamento sem juros na opção selecionada.'}
          </div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// PixDetails
// ---------------------------------------------------------------------------
export function PixDetails({
  total,
  theme,
  fmtFn,
}: {
  total: number;
  theme: Pick<CheckoutVisualTheme, 'mutedText' | 'text'>;
  fmtFn: { brl: (v: number) => string };
}) {
  return (
    <>
      <p style={{ fontSize: 14, color: theme.text, lineHeight: 1.6, marginBottom: 8 }}>
        {kloelT(
          `A confirmação de pagamento é realizada em poucos minutos. Utilize o aplicativo do seu banco para pagar.`,
        )}
      </p>
      <div style={{ fontSize: 15, color: theme.mutedText, marginBottom: 14 }}>
        {kloelT(`Valor no Pix:`)} {fmtFn.brl(total)}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// BoletoDetails
// ---------------------------------------------------------------------------
export function BoletoDetails({
  total,
  theme,
  fmtFn,
}: {
  total: number;
  theme: Pick<CheckoutVisualTheme, 'mutedText' | 'softMutedText' | 'text'>;
  fmtFn: { brl: (v: number) => string };
}) {
  return (
    <>
      <p style={{ fontSize: 14, color: theme.text, lineHeight: 1.6, marginBottom: 8 }}>
        {kloelT(
          `O boleto é gerado com código de barras e PDF prontos para pagamento logo após a confirmação.`,
        )}
      </p>
      <div style={{ fontSize: 15, color: theme.mutedText, marginBottom: 4 }}>
        {kloelT(`Valor no boleto:`)} {fmtFn.brl(total)}
      </div>
      <div style={{ fontSize: 12, color: theme.softMutedText }}>
        {kloelT(`Compensação bancária em até 3 dias úteis.`)}
      </div>
    </>
  );
}
