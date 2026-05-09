import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { SORA, MONO } from './utils';

export interface SmartPaymentResultData {
  paymentLink?: string;
  pixCode?: string;
  boletoUrl?: string;
}

interface SmartPaymentResultViewProps {
  result: SmartPaymentResultData;
  onNewCharge: () => void;
  onClose: () => void;
}

function copyToClipboard(text: string) {
  navigator.clipboard.writeText(text).catch(() => {});
}

export function SmartPaymentResultView({ result, onNewCharge, onClose }: SmartPaymentResultViewProps) {
  return (
    <div>
      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-subtle)',
          borderRadius: 6,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: colors.semantic.success,
            display: 'block',
            marginBottom: 12,
            fontFamily: SORA,
          }}
        >
          {kloelT('Cobranca criada')}
        </span>
        {result.paymentLink && (
          <CopyField
            label={kloelT('Link de pagamento')}
            value={result.paymentLink}
            onCopy={() => copyToClipboard(result.paymentLink!)}
          />
        )}
        {result.pixCode && (
          <CopyField
            label={kloelT('Codigo PIX')}
            value={result.pixCode}
            onCopy={() => copyToClipboard(result.pixCode!)}
          />
        )}
        {result.boletoUrl && (
          <div>
            <FieldLabel>{kloelT('Boleto')}</FieldLabel>
            <div style={{ marginTop: 4 }}>
              <a
                href={result.boletoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: 12,
                  color: 'colors.ember.primary',
                  fontFamily: SORA,
                  textDecoration: 'underline',
                }}
              >
                {kloelT('Abrir boleto')}
              </a>
            </div>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={onNewCharge}
          style={{
            flex: 1,
            padding: '10px 16px',
            background: 'none',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            color: 'var(--app-text-secondary)',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: SORA,
          }}
        >
          {kloelT('Nova cobranca')}
        </button>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: 1,
            padding: '10px 16px',
            background: 'colors.ember.primary',
            border: 'none',
            borderRadius: 6,
            color: 'var(--app-text-on-accent)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: SORA,
          }}
        >
          {kloelT('Fechar')}
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

function CopyField({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <FieldLabel>{label}</FieldLabel>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input
          aria-label={label}
          readOnly
          value={value}
          style={{
            flex: 1,
            background: 'var(--app-bg-primary)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 4,
            padding: '8px 12px',
            color: 'var(--app-text-primary)',
            fontSize: 12,
            fontFamily: MONO,
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={onCopy}
          style={{
            padding: '8px 12px',
            background: 'none',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 4,
            color: 'var(--app-text-secondary)',
            fontSize: 11,
            cursor: 'pointer',
            fontFamily: SORA,
            whiteSpace: 'nowrap',
          }}
        >
          {kloelT('Copiar')}
        </button>
      </div>
    </div>
  );
}
