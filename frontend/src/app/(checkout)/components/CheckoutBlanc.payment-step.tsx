'use client';

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import type * as React from 'react';
import type { BlancColors, BlancInputTheme } from './CheckoutBlanc.order-summary';
import {
  BLANC_DARK,
  BLANC_MUTED,
  BLANC_SOFT_LINE,
  BLANC_STROKE,
  BLANC_WHITE,
  BlancBoletoDetails,
  BlancCardPaymentFields,
  BlancPixDetails,
  Bc,
  Cc,
  Px,
} from './CheckoutBlanc.payment-step.parts';

interface PaymentStepProps {
  fid: string;
  step: number;
  checkoutUnavailableReason: string | null;
  supportsCard: boolean;
  supportsPix: boolean;
  supportsBoleto: boolean;
  payMethod: string;
  setPayMethod: (m: string) => void;
  form: {
    cardNumber: string;
    cardName: string;
    cardExp: string;
    cardCvv: string;
    cardCpf: string;
    installments: string;
  };
  updateField: (field: string) => React.ChangeEventHandler<HTMLSelectElement | HTMLInputElement>;
  installmentOptions: { value: string; label: string }[];
  pricing: { installmentInterestInCents: number };
  total: number;
  isSubmitting: boolean;
  submitError: string | null;
  finalizeOrder: () => Promise<void>;
  colors: BlancColors;
  inputTheme: BlancInputTheme;
  btnFinalizeText?: string;
  fmt: { brl: (v: number) => string };
}

/** Step 3 — Payment panel for CheckoutBlanc */
export function BlancPaymentStep({
  fid,
  step,
  checkoutUnavailableReason,
  supportsCard,
  supportsPix,
  supportsBoleto,
  payMethod,
  setPayMethod,
  form,
  updateField,
  installmentOptions,
  pricing,
  total,
  isSubmitting,
  submitError,
  finalizeOrder,
  colors,
  inputTheme,
  btnFinalizeText,
  fmt,
}: PaymentStepProps) {
  const L: React.CSSProperties = {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: UI.text,
    marginBottom: 6,
  };

  if (step < 3) {
    return (
      <div
        style={{
          background: BLANC_WHITE,
          border: `1px solid ${BLANC_SOFT_LINE}`,
          borderRadius: UI.radiusMd,
          padding: '24px 20px',
          opacity: 0.35,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: UI.radiusFull,
              background: BLANC_STROKE,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: BLANC_WHITE, fontSize: 13, fontWeight: 700 }}>3</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: BLANC_MUTED }}>
            {kloelT(`Pagamento`)}
          </h2>
        </div>
        <p style={{ fontSize: 13, color: BLANC_MUTED, marginTop: 4 }}>
          {kloelT(`Preencha suas informações de entrega para continuar`)}
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: BLANC_WHITE,
        border: `1px solid ${BLANC_SOFT_LINE}`,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
        borderRadius: UI.radiusMd,
        padding: '24px 20px',
        animation: 'fadeIn 0.3s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: UI.radiusFull,
            background: BLANC_DARK,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: BLANC_WHITE, fontSize: 13, fontWeight: 700 }}>3</span>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>{kloelT(`Pagamento`)}</h2>
      </div>
      <p style={{ fontSize: 13, color: UI.muted, marginBottom: 16 }}>
        {kloelT(`Escolha uma forma de pagamento`)}
      </p>

      {checkoutUnavailableReason ? (
        <div
          style={{
            marginBottom: 14,
            padding: '12px 14px',
            background: 'UI.bg5f5',
            border: '1px solid UI.borderSoft',
            borderRadius: UI.radiusMd,
            fontSize: 13,
            color: UI.error,
            lineHeight: 1.5,
          }}
        >
          {checkoutUnavailableReason}
        </div>
      ) : null}

      {supportsCard ? (
        <div
          onClick={() => setPayMethod('card')}
          style={{
            border: `1px solid ${payMethod === 'card' ? BLANC_DARK : BLANC_SOFT_LINE}`,
            borderRadius: UI.radiusMd,
            padding: '16px 18px',
            marginBottom: 12,
            cursor: 'pointer',
            transition: 'border-color 0.2s',
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              (e.currentTarget as HTMLElement).click();
            }
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: payMethod === 'card' ? 16 : 0,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: UI.radiusFull,
                border:
                  payMethod === 'card' ? `5px solid ${BLANC_DARK}` : `2px solid ${BLANC_STROKE}`,
                transition: 'border 0.2s',
              }}
            />
            <Cc />
            <span style={{ fontSize: 15, fontWeight: 600 }}>{kloelT(`Cartão de crédito`)}</span>
          </div>
          {payMethod === 'card' ? (
            <BlancCardPaymentFields
              fid={fid}
              form={form}
              updateField={updateField}
              installmentOptions={installmentOptions}
              pricing={pricing}
              inputTheme={inputTheme}
              L={L}
              fmt={fmt}
            />
          ) : null}
        </div>
      ) : null}

      {supportsPix ? (
        <button
          type="button"
          onClick={() => setPayMethod('pix')}
          aria-label="Pagar com PIX"
          aria-pressed={payMethod === 'pix'}
          style={{
            border: `1px solid ${payMethod === 'pix' ? BLANC_DARK : BLANC_SOFT_LINE}`,
            borderRadius: UI.radiusMd,
            padding: '16px 18px',
            cursor: 'pointer',
            transition: 'border-color 0.2s',
            width: '100%',
            textAlign: 'left',
            background: UI.bg,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: payMethod === 'pix' ? 14 : 0,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: UI.radiusFull,
                border:
                  payMethod === 'pix' ? `5px solid ${BLANC_DARK}` : `2px solid ${BLANC_STROKE}`,
                transition: 'border 0.2s',
              }}
            />
            <Px />
            <span style={{ fontSize: 15, fontWeight: 600 }}>{kloelT(`Pix`)}</span>
          </div>
          {payMethod === 'pix' ? <BlancPixDetails total={total} fmt={fmt} /> : null}
        </button>
      ) : null}

      {supportsBoleto ? (
        <button
          type="button"
          aria-pressed={payMethod === 'boleto'}
          onClick={() => setPayMethod('boleto')}
          style={{
            border: `1px solid ${payMethod === 'boleto' ? BLANC_DARK : BLANC_SOFT_LINE}`,
            borderRadius: UI.radiusMd,
            padding: '16px 18px',
            cursor: 'pointer',
            transition: 'border-color 0.2s',
            marginTop: 12,
            width: '100%',
            textAlign: 'left',
            background: UI.bg,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: payMethod === 'boleto' ? 14 : 0,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: UI.radiusFull,
                border:
                  payMethod === 'boleto' ? `5px solid ${BLANC_DARK}` : `2px solid ${BLANC_STROKE}`,
                transition: 'border 0.2s',
              }}
            />
            <Bc />
            <span style={{ fontSize: 15, fontWeight: 600 }}>{kloelT(`Boleto`)}</span>
          </div>
          {payMethod === 'boleto' ? <BlancBoletoDetails total={total} fmt={fmt} /> : null}
        </button>
      ) : null}

      {submitError ? (
        <div style={{ marginTop: 14, fontSize: 13, color: UI.error, lineHeight: 1.5 }}>
          {submitError}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => void finalizeOrder()}
        disabled={isSubmitting}
        style={{
          width: '100%',
          marginTop: 20,
          padding: 16,
          background: colors.accent,
          border: 'none',
          borderRadius: UI.radiusMd,
          color: BLANC_WHITE,
          fontSize: 18,
          fontWeight: 700,
          opacity: isSubmitting ? 0.7 : 1,
        }}
      >
        {isSubmitting ? 'Processando...' : (btnFinalizeText ?? 'Finalizar compra')}
      </button>
    </div>
  );
}
