'use client';

import { kloelT } from '@/lib/i18n/t';
import { UI } from '@/lib/ui-tokens';
import type * as React from 'react';
import {
  Ed as SharedEd,
  ValidationInput as SharedValidationInput,
  fmt,
} from './checkout-theme-shared';
import type { NoirColors, NoirInputTheme } from './CheckoutNoir.order-summary';

export interface NoirAddressForm {
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  complement: string;
  city: string;
  state: string;
  destinatario: string;
}

interface NoirAddressStepProps {
  fid: string;
  step: number;
  form: NoirAddressForm;
  C: NoirColors;
  inputTheme: NoirInputTheme;
  submitError: string | null;
  shippingInCents: number;
  btnStep2Text?: string;
  doneCard: React.CSSProperties;
  activeCard: React.CSSProperties;
  lockedCard: React.CSSProperties;
  numDone: React.CSSProperties;
  numLock: React.CSSProperties;
  setStep: (n: number) => void;
  updateField: (field: string) => React.ChangeEventHandler<HTMLSelectElement | HTMLInputElement>;
  goStep: (n: number) => void;
}

export function NoirAddressStep({
  fid,
  step,
  form,
  C,
  inputTheme,
  submitError,
  shippingInCents,
  btnStep2Text,
  doneCard,
  activeCard,
  lockedCard,
  numDone,
  numLock,
  setStep,
  updateField,
  goStep,
}: NoirAddressStepProps) {
  const L: React.CSSProperties = {
    display: 'block',
    fontSize: 14,
    fontWeight: 500,
    color: C.text2,
    marginBottom: 6,
  };

  if (step < 2) {
    return (
      <div style={{ ...lockedCard, marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={numLock}>
            <span style={{ color: C.text3, fontSize: 13, fontWeight: 700 }}>2</span>
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text3 }}>{kloelT(`Entrega`)}</h2>
        </div>
        <p style={{ fontSize: 13, color: C.text3, marginTop: 4 }}>
          {kloelT(`Preencha suas informações pessoais para continuar`)}
        </p>
      </div>
    );
  }

  if (step > 2) {
    return (
      <div style={{ ...doneCard, marginTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={numDone}>
            <span style={{ color: UI.bg, fontSize: 13, fontWeight: 700 }}>2</span>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: C.green }}>{kloelT(`Entrega`)}</span>
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
            onClick={() => setStep(2)}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 4 }}
          >
            <SharedEd stroke={inputTheme.editStroke} />
          </button>
        </div>
        <div style={{ fontSize: 13, color: C.text2, lineHeight: 1.6 }}>
          <strong style={{ color: C.text }}>{kloelT(`Endereço para entrega:`)}</strong>
          <br />
          {form.street || 'Endereço'}, {form.number || 'S/N'} - {form.neighborhood}
          <br />
          {form.complement ? (
            <>
              {kloelT(`Complemento:`)} {form.complement}
              <br />
            </>
          ) : null}
          {[form.city, form.state].filter(Boolean).join(' - ')} {kloelT(`| CEP`)} {form.cep}
          <br />
          <strong style={{ display: 'block', marginTop: 8, color: C.text }}>
            {kloelT(`Forma de entrega:`)}
          </strong>
          {shippingInCents === 0
            ? 'Frete padrão Grátis'
            : `Frete padrão ${fmt.brl(shippingInCents)}`}
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...activeCard, marginTop: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: UI.radiusFull,
            background: C.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span style={{ color: C.void, fontSize: 13, fontWeight: 700 }}>2</span>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700 }}>{kloelT(`Entrega`)}</h2>
      </div>
      <p style={{ fontSize: 13, color: C.text2, marginBottom: 16 }}>
        {kloelT(`Cadastre ou selecione um endereço`)}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ minWidth: 180 }}>
            <label htmlFor={`${fid}-cep`} style={L}>
              CEP
            </label>
            <SharedValidationInput
              theme={inputTheme}
              id={`${fid}-cep`}
              value={form.cep}
              onChange={updateField('cep')}
              placeholder="00000-000"
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${fid}-street`} style={L}>
            {kloelT(`Endereço`)}
          </label>
          <SharedValidationInput
            theme={inputTheme}
            id={`${fid}-street`}
            value={form.street}
            onChange={updateField('street')}
            placeholder={kloelT(`Rua, avenida...`)}
          />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: '0 0 35%' }}>
            <label htmlFor={`${fid}-number`} style={L}>
              {kloelT(`Número`)}
            </label>
            <SharedValidationInput
              theme={inputTheme}
              id={`${fid}-number`}
              value={form.number}
              onChange={updateField('number')}
              placeholder={kloelT(`Nº`)}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor={`${fid}-neighborhood`} style={L}>
              {kloelT(`Bairro`)}
            </label>
            <SharedValidationInput
              theme={inputTheme}
              id={`${fid}-neighborhood`}
              value={form.neighborhood}
              onChange={updateField('neighborhood')}
              placeholder={kloelT(`Bairro`)}
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${fid}-complement`} style={L}>
            {kloelT(`Complemento`)}{' '}
            <span style={{ opacity: 0.4, fontWeight: 400 }}>{kloelT(`(opcional)`)}</span>
          </label>
          <SharedValidationInput
            theme={inputTheme}
            id={`${fid}-complement`}
            value={form.complement}
            onChange={updateField('complement')}
            placeholder={kloelT(`Apto, bloco...`)}
          />
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label htmlFor={`${fid}-city`} style={L}>
              {kloelT(`Cidade`)}
            </label>
            <SharedValidationInput
              theme={inputTheme}
              id={`${fid}-city`}
              value={form.city}
              onChange={updateField('city')}
              placeholder={kloelT(`Cidade`)}
            />
          </div>
          <div style={{ flex: '0 0 24%' }}>
            <label htmlFor={`${fid}-state`} style={L}>
              UF
            </label>
            <SharedValidationInput
              theme={inputTheme}
              id={`${fid}-state`}
              value={form.state}
              onChange={updateField('state')}
              placeholder="UF"
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${fid}-destinatario`} style={L}>
            {kloelT(`Destinatário`)}
          </label>
          <SharedValidationInput
            theme={inputTheme}
            id={`${fid}-destinatario`}
            value={form.destinatario}
            onChange={updateField('destinatario')}
            placeholder={kloelT(`Nome do destinatário`)}
          />
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          marginTop: 18,
          border: `1px solid ${C.border2}`,
          borderRadius: UI.radiusMd,
          background: C.surface2,
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: UI.radiusFull,
            border: `5px solid ${C.accent}`,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{kloelT(`Frete padrão`)}</div>
          <div style={{ fontSize: 12, color: C.text3 }}>{kloelT(`Entrega garantida`)}</div>
        </div>
        <span
          style={{ fontSize: 14, fontWeight: 700, color: shippingInCents === 0 ? C.green : C.text }}
        >
          {shippingInCents === 0 ? 'Grátis' : fmt.brl(shippingInCents)}
        </span>
      </div>
      {submitError && step === 2 ? (
        <div style={{ marginTop: 14, fontSize: 13, color: UI.error }}>{submitError}</div>
      ) : null}
      <button
        type="button"
        onClick={() => goStep(3)}
        style={{
          width: '100%',
          marginTop: 18,
          padding: 15,
          background: C.accent,
          border: 'none',
          borderRadius: UI.radiusMd,
          color: C.void,
          fontSize: 17,
          fontWeight: 700,
          boxShadow: '0 4px 16px rgba(212,165,116,0.2)',
        }}
      >
        {btnStep2Text || 'Ir para Pagamento'}
      </button>
    </div>
  );
}
