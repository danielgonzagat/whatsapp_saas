'use client';

import { kloelT } from '@/lib/i18n/t';
import type * as React from 'react';
import {
  Bc,
  Cc,
  Px,
  PAYMENT_BADGES,
  ValidationInput as SharedValidationInput,
} from './checkout-theme-shared';
import type { NoirColors, NoirInputTheme } from './CheckoutNoir.order-summary';

export type NoirCardForm = {
  cardNumber: string;
  cardName: string;
  cardExp: string;
  cardCvv: string;
  cardCpf: string;
  installments: string;
};

export function NoirCardFields({
  fid,
  form,
  updateField,
  installmentOptions,
  pricing,
  inputTheme,
  C,
  L,
  fmt,
}: {
  fid: string;
  form: NoirCardForm;
  updateField: (field: string) => React.ChangeEventHandler<HTMLSelectElement | HTMLInputElement>;
  installmentOptions: { value: string; label: string }[];
  pricing: { installmentInterestInCents: number };
  inputTheme: NoirInputTheme;
  C: NoirColors;
  L: React.CSSProperties;
  fmt: { brl: (v: number) => string };
}) {
  return (
    <>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {PAYMENT_BADGES.filter((item) => item !== 'Pix' && item !== 'Boleto').map((brand) => (
          <span
            key={brand}
            style={{
              padding: '3px 8px',
              background: C.surface2,
              border: `1px solid ${C.border}`,
              borderRadius: 4,
              fontSize: 9,
              fontWeight: 700,
              color: C.text3,
            }}
          >
            {brand}
          </span>
        ))}
      </div>
      <div
        style={{
          background: `linear-gradient(135deg,${C.surface2},#2a2a3d)`,
          borderRadius: 6,
          padding: 18,
          color: '#fff',
          fontFamily: 'monospace',
          marginBottom: 16,
          minHeight: 150,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{ width: 36, height: 24, borderRadius: 4, background: 'rgba(255,255,255,0.15)' }}
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
              {kloelT(`Validade`)} <span style={{ opacity: 0.4 }}>{kloelT(`(mês/ano)`)}</span>
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
              background: C.surface2,
              border: `1px solid ${C.border2}`,
              borderRadius: 6,
              fontSize: 15,
              color: C.text,
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
          <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>
            {pricing.installmentInterestInCents > 0
              ? `Juros total do parcelamento: ${fmt.brl(pricing.installmentInterestInCents)}`
              : 'Parcelamento sem juros na opção selecionada.'}
          </div>
        </div>
      </div>
    </>
  );
}

export function NoirPixDetails({
  total,
  C,
  fmt,
}: {
  total: number;
  C: NoirColors;
  fmt: { brl: (v: number) => string };
}) {
  return (
    <>
      <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.6, marginBottom: 8 }}>
        {kloelT(
          `A confirmação de pagamento é realizada em poucos minutos. Utilize o aplicativo do seu banco para pagar.`,
        )}
      </p>
      <div style={{ fontSize: 15, color: C.text3, marginBottom: 14 }}>
        {kloelT(`Valor no Pix:`)} {fmt.brl(total)}
      </div>
    </>
  );
}

export function NoirBoletoDetails({
  total,
  C,
  fmt,
}: {
  total: number;
  C: NoirColors;
  fmt: { brl: (v: number) => string };
}) {
  return (
    <>
      <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.6, marginBottom: 8 }}>
        {kloelT(
          `O boleto é gerado com código de barras e PDF prontos para pagamento logo após a confirmação.`,
        )}
      </p>
      <div style={{ fontSize: 15, color: C.text3, marginBottom: 4 }}>
        {kloelT(`Valor no boleto:`)} {fmt.brl(total)}
      </div>
      <div style={{ fontSize: 12, color: C.text3 }}>
        {kloelT(`Compensação bancária em até 3 dias úteis.`)}
      </div>
    </>
  );
}

export { Bc, Cc, Px };
