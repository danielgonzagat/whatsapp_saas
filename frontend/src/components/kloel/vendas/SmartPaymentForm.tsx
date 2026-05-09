import { kloelT } from '@/lib/i18n/t';
import { SORA, MONO } from './utils';

export interface SmartPaymentFormData {
  amount: string;
  description: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  method: string;
  dueDate: string;
}

const FORM_FIELDS = [
  { label: 'Cliente', key: 'customerName' as const, placeholder: 'Nome do cliente' },
  { label: 'Telefone', key: 'customerPhone' as const, placeholder: '5511999999999' },
  { label: 'E-mail', key: 'customerEmail' as const, placeholder: 'cliente@exemplo.com' },
  { label: 'Valor (R$)', key: 'amount' as const, placeholder: '97,00' },
  { label: 'Descricao', key: 'description' as const, placeholder: 'Ex: Consultoria, Produto X' },
];

interface SmartPaymentFormViewProps {
  form: SmartPaymentFormData;
  onChange: React.Dispatch<React.SetStateAction<SmartPaymentFormData>>;
  error: string;
  loading: boolean;
  hasRequired: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function SmartPaymentFormView({
  form,
  onChange,
  error,
  loading,
  hasRequired,
  onSubmit,
  onCancel,
}: SmartPaymentFormViewProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {FORM_FIELDS.map(({ label, key, placeholder }) => (
        <div key={key}>
          <FieldLabel>{label}</FieldLabel>
          <input
            aria-label={label}
            value={form[key]}
            onChange={(e) => onChange((f) => ({ ...f, [key]: e.target.value }))}
            placeholder={placeholder}
            style={{
              width: '100%',
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 4,
              padding: '9px 12px',
              color: 'var(--app-text-primary)',
              fontSize: 13,
              fontFamily: key === 'amount' ? MONO : SORA,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <FieldLabel>{kloelT('Metodo')}</FieldLabel>
          <select
            value={form.method}
            onChange={(e) => onChange((f) => ({ ...f, method: e.target.value }))}
            style={selectStyle}
          >
            <option value="pix">PIX</option>
            <option value="boleto">{kloelT('Boleto')}</option>
            <option value="credit_card">{kloelT('Cartao')}</option>
            <option value="link">{kloelT('Link')}</option>
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <FieldLabel>{kloelT('Vencimento')}</FieldLabel>
          <input
            aria-label="Data de vencimento"
            type="date"
            value={form.dueDate}
            onChange={(e) => onChange((f) => ({ ...f, dueDate: e.target.value }))}
            style={{ ...selectStyle, fontFamily: MONO }}
          />
        </div>
      </div>
      {error && <span style={{ fontSize: 12, color: '#EF4444', fontFamily: SORA }}>{error}</span>}
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button type="button" onClick={onCancel} style={secondaryBtnStyle}>
          {kloelT('Cancelar')}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading || !hasRequired}
          style={{
            flex: 1,
            padding: '10px 16px',
            background: hasRequired ? 'colors.ember.primary' : 'var(--app-bg-secondary)',
            border: 'none',
            borderRadius: 6,
            color: hasRequired ? 'var(--app-text-on-accent)' : 'var(--app-text-placeholder)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: SORA,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Criando...' : 'Cobrar'}
        </button>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        color: 'var(--app-text-secondary)',
        fontFamily: SORA,
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        display: 'block',
        marginBottom: 6,
      }}
    >
      {children}
    </span>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--app-bg-card)',
  border: '1px solid var(--app-border-primary)',
  borderRadius: 4,
  padding: '9px 12px',
  color: 'var(--app-text-primary)',
  fontSize: 13,
  fontFamily: SORA,
  outline: 'none',
  boxSizing: 'border-box',
};

const secondaryBtnStyle: React.CSSProperties = {
  flex: 1,
  padding: '10px 16px',
  background: 'none',
  border: '1px solid var(--app-border-primary)',
  borderRadius: 6,
  color: 'var(--app-text-secondary)',
  fontSize: 12,
  cursor: 'pointer',
  fontFamily: SORA,
};
