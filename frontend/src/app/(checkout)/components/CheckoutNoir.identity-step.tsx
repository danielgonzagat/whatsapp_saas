'use client';

import { kloelT } from '@/lib/i18n/t';
import type * as React from 'react';
import { Ed as SharedEd, ValidationInput as SharedValidationInput } from './checkout-theme-shared';
import type { NoirColors, NoirInputTheme } from './CheckoutNoir.order-summary';

export interface NoirIdentityForm {
  name: string;
  email: string;
  cpf: string;
  phone: string;
}

interface NoirIdentityStepProps {
  fid: string;
  step: number;
  form: NoirIdentityForm;
  C: NoirColors;
  inputTheme: NoirInputTheme;
  submitError: string | null;
  loadingStep: boolean;
  phoneLabel?: string;
  btnStep1Text?: string;
  doneCard: React.CSSProperties;
  activeCard: React.CSSProperties;
  numDone: React.CSSProperties;
  numActive: React.CSSProperties;
  setStep: (n: number) => void;
  updateField: (field: string) => React.ChangeEventHandler<HTMLSelectElement | HTMLInputElement>;
  goStep: (n: number) => void;
}

export function NoirIdentityStep({
  fid,
  step,
  form,
  C,
  inputTheme,
  submitError,
  loadingStep,
  phoneLabel,
  btnStep1Text,
  doneCard,
  activeCard,
  numDone,
  numActive,
  setStep,
  updateField,
  goStep,
}: NoirIdentityStepProps) {
  const L: React.CSSProperties = {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: C.text2,
    marginBottom: 6,
  };

  if (step > 1) {
    return (
      <div style={doneCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={numDone}>
            <span style={{ color: '#fff', fontSize: 13, fontWeight: 700 }}>1</span>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.green }}>
            {kloelT(`Identificação`)}
          </span>
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={C.green}
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
            style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 4 }}
          >
            <SharedEd stroke={inputTheme.editStroke} />
          </button>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{form.name || 'Nome'}</div>
        <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6 }}>
          {form.email}
          <br />
          CPF {form.cpf}
        </div>
      </div>
    );
  }

  return (
    <div style={activeCard}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={numActive}>
          <span style={{ color: C.void, fontSize: 13, fontWeight: 700 }}>1</span>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>{kloelT(`Identificação`)}</h2>
      </div>
      <p style={{ fontSize: 13, color: C.text2, marginBottom: 20, lineHeight: 1.5 }}>
        {kloelT(
          `Utilizaremos seu e-mail para: Identificar seu perfil, histórico de compra, notificação de pedidos e carrinho de compras.`,
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
                background: C.surface2,
                border: `1px solid ${C.border2}`,
                borderRadius: 6,
                fontSize: 14,
                fontWeight: 600,
                color: C.text2,
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
        <div style={{ marginTop: 14, fontSize: 13, color: '#d14343' }}>{submitError}</div>
      ) : null}
      <button
        type="button"
        onClick={() => goStep(2)}
        style={{
          width: '100%',
          marginTop: 20,
          padding: 15,
          background: C.accent,
          border: 'none',
          borderRadius: 6,
          color: C.void,
          fontSize: 17,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(212,165,116,0.2)',
        }}
      >
        {loadingStep ? (
          <div
            style={{
              width: 20,
              height: 20,
              border: '2px solid rgba(0,0,0,0.2)',
              borderTopColor: C.void,
              borderRadius: '50%',
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
