'use client';
import { kloelT } from '@/lib/i18n/t';
import { SORA } from './ContaConstants';
import { Field } from './ContaShared';

export default function PixFields({
  form,
  set,
  fid,
}: {
  form: Record<string, string>;
  set: (k: string, v: string) => void;
  fid: string;
}) {
  return (
    <div style={{ borderTop: '1px solid var(--app-border-subtle)', marginTop: 10, paddingTop: 16 }}>
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--app-text-primary)',
          display: 'block',
          marginBottom: 14,
          fontFamily: SORA,
        }}
      >
        {kloelT(`PIX (opcional)`)}
      </span>
      <div style={{ display: 'flex', gap: 14 }}>
        <Field
          label={kloelT(`Chave PIX`)}
          placeholder={kloelT(`E-mail, CPF, celular ou chave aleatoria`)}
          value={form.pixKey}
          onChange={(v) => set('pixKey', v)}
          half
          required={false}
        />
        <div style={{ flex: 1 }}>
          <label
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--app-text-secondary)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginBottom: 6,
              fontFamily: SORA,
            }}
            htmlFor={`${fid}-tipo-chave`}
          >
            {kloelT(`Tipo da chave`)}
          </label>
          <select
            value={form.pixKeyType}
            onChange={(e) => set('pixKeyType', e.target.value)}
            style={{
              width: '100%',
              padding: '11px 14px',
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              fontSize: 13,
              fontFamily: SORA,
              color: 'var(--app-text-primary)',
              outline: 'none',
              cursor: 'pointer',
              appearance: 'none' as const,
            }}
            id={`${fid}-tipo-chave`}
          >
            <option value="">{kloelT(`Selecione...`)}</option>
            <option value="CPF">CPF</option>
            <option value="CNPJ">CNPJ</option>
            <option value="EMAIL">{kloelT(`E-mail`)}</option>
            <option value="PHONE">{kloelT(`Celular`)}</option>
            <option value="RANDOM">{kloelT(`Aleatoria`)}</option>
          </select>
        </div>
      </div>
    </div>
  );
}
