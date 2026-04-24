'use client';

import { kloelT } from '@/lib/i18n/t';
import type * as React from 'react';
import type { NoirColors, NoirInputTheme } from './CheckoutNoir.order-summary';
import {
  Bc,
  Cc,
  NoirBoletoDetails,
  NoirCardFields,
  NoirPixDetails,
  Px,
} from './CheckoutNoir.payment-step.parts';

interface NoirPaymentStepProps {
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
  C: NoirColors;
  inputTheme: NoirInputTheme;
  btnFinalizeText?: string;
  fmt: { brl: (v: number) => string };
}

/** Step 3 — Payment panel for CheckoutNoir */
export function NoirPaymentStep({
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
  C,
  inputTheme,
  btnFinalizeText,
  fmt,
}: NoirPaymentStepProps) {
  const L: React.CSSProperties = {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: C.text2,
    marginBottom: 6,
  };

  const lockedCard: React.CSSProperties = {
    background: C.surface,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    padding: '24px 20px',
    opacity: 0.35,
  };

  const numLock: React.CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: C.surface2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const numActive: React.CSSProperties = {
    width: 26,
    height: 26,
    borderRadius: '50%',
    background: C.accent,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const activeCard: React.CSSProperties = {
    background: C.surface,
    border: `1px solid ${C.border2}`,
    boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
    borderRadius: 6,
    padding: '24px 20px',
    animation: 'fadeIn 0.3s',
  };

  if (step < 3) {
    return (
      <div style={lockedCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={numLock}>
            <span style={{ color: C.text3, fontSize: 13, fontWeight: 700 }}>3</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text3 }}>{kloelT(`Pagamento`)}</h2>
        </div>
        <p style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>
          {kloelT(`Preencha suas informações de entrega para continuar`)}
        </p>
      </div>
    );
  }

  return (
    <div style={activeCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={numActive}>
          <span style={{ color: C.void, fontSize: 13, fontWeight: 700 }}>3</span>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>{kloelT(`Pagamento`)}</h2>
      </div>
      <p style={{ fontSize: 13, color: C.text2, marginBottom: 16 }}>
        {kloelT(`Escolha uma forma de pagamento`)}
      </p>

      {checkoutUnavailableReason ? (
        <div
          style={{
            marginBottom: 14,
            padding: '12px 14px',
            background: 'rgba(127,29,29,0.12)',
            border: '1px solid rgba(248,113,113,0.25)',
            borderRadius: 6,
            fontSize: 13,
            color: '#fecaca',
            lineHeight: 1.5,
          }}
        >
          {checkoutUnavailableReason}
        </div>
      ) : null}

      {supportsCard ? (
        <button
          type="button"
          aria-pressed={payMethod === 'card'}
          onClick={() => setPayMethod('card')}
          style={{
            border: `1px solid ${payMethod === 'card' ? C.accent : C.border2}`,
            borderRadius: 6,
            padding: '16px 18px',
            marginBottom: 12,
            cursor: 'pointer',
            transition: 'border-color 0.2s',
            width: '100%',
            textAlign: 'left',
            background: C.surface,
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
                borderRadius: '50%',
                border: payMethod === 'card' ? `5px solid ${C.accent}` : `2px solid ${C.border2}`,
                transition: 'border 0.2s',
              }}
            />
            <Cc />
            <span style={{ fontSize: 15, fontWeight: 600 }}>{kloelT(`Cartão de crédito`)}</span>
          </div>
          {payMethod === 'card' ? (
            <NoirCardFields
              fid={fid}
              form={form}
              updateField={updateField}
              installmentOptions={installmentOptions}
              pricing={pricing}
              inputTheme={inputTheme}
              C={C}
              L={L}
              fmt={fmt}
            />
          ) : null}
        </button>
      ) : null}

      {supportsPix ? (
        <button
          type="button"
          onClick={() => setPayMethod('pix')}
          aria-label="Pagar com PIX"
          aria-pressed={payMethod === 'pix'}
          style={{
            border: `1px solid ${payMethod === 'pix' ? C.accent : C.border2}`,
            borderRadius: 6,
            padding: '16px 18px',
            cursor: 'pointer',
            transition: 'border-color 0.2s',
            width: '100%',
            textAlign: 'left',
            background: C.surface,
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
                borderRadius: '50%',
                border: payMethod === 'pix' ? `5px solid ${C.accent}` : `2px solid ${C.border2}`,
                transition: 'border 0.2s',
              }}
            />
            <Px />
            <span style={{ fontSize: 15, fontWeight: 600 }}>{kloelT(`Pix`)}</span>
          </div>
          {payMethod === 'pix' ? <NoirPixDetails total={total} C={C} fmt={fmt} /> : null}
        </button>
      ) : null}

      {supportsBoleto ? (
        <div
          onClick={() => setPayMethod('boleto')}
          style={{
            border: `1px solid ${payMethod === 'boleto' ? C.accent : C.border2}`,
            borderRadius: 6,
            padding: '16px 18px',
            cursor: 'pointer',
            transition: 'border-color 0.2s',
            marginTop: 12,
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
              marginBottom: payMethod === 'boleto' ? 14 : 0,
            }}
          >
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: payMethod === 'boleto' ? `5px solid ${C.accent}` : `2px solid ${C.border2}`,
                transition: 'border 0.2s',
              }}
            />
            <Bc />
            <span style={{ fontSize: 15, fontWeight: 600 }}>{kloelT(`Boleto`)}</span>
          </div>
          {payMethod === 'boleto' ? <NoirBoletoDetails total={total} C={C} fmt={fmt} /> : null}
        </div>
      ) : null}

      {submitError ? (
        <div style={{ marginTop: 14, fontSize: 13, color: '#d14343', lineHeight: 1.5 }}>
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
          background: C.accent,
          border: 'none',
          borderRadius: 6,
          color: C.void,
          fontSize: 18,
          fontWeight: 700,
          opacity: isSubmitting ? 0.7 : 1,
          boxShadow: '0 4px 16px rgba(212,165,116,0.2)',
        }}
      >
        {isSubmitting ? 'Processando...' : (btnFinalizeText ?? 'Finalizar compra')}
      </button>
    </div>
  );
}
