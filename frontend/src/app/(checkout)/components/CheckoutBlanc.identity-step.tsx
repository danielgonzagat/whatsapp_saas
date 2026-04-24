'use client';

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import type * as React from 'react';
import { Ed as SharedEd, ValidationInput as SharedValidationInput } from './checkout-theme-shared';
import type { BlancColors, BlancInputTheme } from './CheckoutBlanc.order-summary';

const BLANC_WHITE = UI.bg;
const BLANC_MUTED = UI.muted;
const BLANC_SOFT_LINE = UI.borderSoft;
const BLANC_DARK = UI.text;
const BLANC_STROKE = UI.borderSoft;

const L: React.CSSProperties = {
  display: 'block',
  fontSize: 14,
  fontWeight: 500,
  color: UI.text,
  marginBottom: 6,
};

export interface BlancIdentityForm {
  name: string;
  email: string;
  cpf: string;
  phone: string;
}

interface BlancIdentityStepProps {
  fid: string;
  step: number;
  form: BlancIdentityForm;
  colors: BlancColors;
  inputTheme: BlancInputTheme;
  submitError: string | null;
  loadingStep: boolean;
  phoneLabel?: string;
  btnStep1Text?: string;
  setStep: (n: number) => void;
  updateField: (field: string) => React.ChangeEventHandler<HTMLSelectElement | HTMLInputElement>;
  goStep: (n: number) => void;
}

export function BlancIdentityStep({
  fid,
  step,
  form,
  colors,
  inputTheme,
  submitError,
  loadingStep,
  phoneLabel,
  btnStep1Text,
  setStep,
  updateField,
  goStep,
}: BlancIdentityStepProps) {
  if (step > 1) {
    return (
      <div
        style={{
          background: UI.successBg,
          borderRadius: UI.radiusMd,
          padding: 20,
          animation: 'fadeIn 0.3s',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div
            style={{
              width: 26,
              height: 26,
              borderRadius: UI.radiusFull,
              background: colors.accent,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: BLANC_WHITE, fontSize: 13, fontWeight: 700 }}>1</span>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: colors.accent }}>
            {kloelT(`Identificação`)}
          </span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={colors.accent}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <button
            type="button"
            onClick={() => setStep(1)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              color: BLANC_MUTED,
              padding: 4,
            }}
          >
            <SharedEd stroke={inputTheme.editStroke} />
          </button>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700 }}>{form.name || 'Nome'}</div>
        <div style={{ fontSize: 13, color: UI.muted, lineHeight: 1.6 }}>
          {form.email}
          <br />
          CPF {form.cpf}
        </div>
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
          <span style={{ color: BLANC_WHITE, fontSize: 13, fontWeight: 700 }}>1</span>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>{kloelT(`Identificação`)}</h2>
      </div>
      <p style={{ fontSize: 13, color: UI.muted, marginBottom: 20, lineHeight: 1.5 }}>
        {kloelT(
          `Utilizaremos seu e-mail para identificar seu pedido, confirmar a compra e enviar atualizações.`,
        )}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label htmlFor={`${fid}-name`} style={L}>
            {kloelT(`Nome completo`)}
          </label>
          <SharedValidationInput
            theme={inputTheme}
            id={`${fid}-name`}
            value={form.name}
            onChange={updateField('name')}
            placeholder={kloelT(`ex.: Maria de Almeida Cruz`)}
          />
        </div>
        <div>
          <label htmlFor={`${fid}-email`} style={L}>
            {kloelT(`E-mail`)}
          </label>
          <SharedValidationInput
            theme={inputTheme}
            id={`${fid}-email`}
            value={form.email}
            onChange={updateField('email')}
            placeholder={kloelT(`ex.: maria@gmail.com`)}
            type="email"
          />
        </div>
        <div style={{ width: 'fit-content', minWidth: 220 }}>
          <label htmlFor={`${fid}-cpf`} style={L}>
            CPF
          </label>
          <SharedValidationInput
            theme={inputTheme}
            id={`${fid}-cpf`}
            value={form.cpf}
            onChange={updateField('cpf')}
            placeholder="000.000.000-00"
          />
        </div>
        <div>
          <label htmlFor={`${fid}-phone`} style={L}>
            {phoneLabel || 'Celular / WhatsApp'}
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 14px',
                background: UI.card,
                border: `1px solid ${BLANC_STROKE}`,
                borderRadius: UI.radiusMd,
                fontSize: 14,
                fontWeight: 600,
                color: UI.muted,
                flexShrink: 0,
              }}
            >
              +55
            </div>
            <div style={{ flex: 1 }}>
              <SharedValidationInput
                theme={inputTheme}
                id={`${fid}-phone`}
                value={form.phone}
                onChange={updateField('phone')}
                placeholder={kloelT(`(00) 00000-0000`)}
              />
            </div>
          </div>
        </div>
      </div>
      {submitError && step === 1 ? (
        <div style={{ marginTop: 14, fontSize: 13, color: UI.error }}>{submitError}</div>
      ) : null}
      <button
        type="button"
        onClick={() => goStep(2)}
        style={{
          width: '100%',
          marginTop: 20,
          padding: 15,
          background: colors.accent,
          border: 'none',
          borderRadius: UI.radiusMd,
          color: BLANC_WHITE,
          fontSize: 17,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {loadingStep ? (
          <div
            style={{
              width: 20,
              height: 20,
              border: '2px solid rgba(255,255,255,0.3)',
              borderTopColor: BLANC_WHITE,
              borderRadius: UI.radiusFull,
              animation: 'spin 0.6s linear infinite',
            }}
          />
        ) : (
          btnStep1Text || 'Ir para Entrega'
        )}
      </button>
    </div>
  );
}
