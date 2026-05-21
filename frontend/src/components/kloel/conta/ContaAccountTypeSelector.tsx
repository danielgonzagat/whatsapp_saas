'use client';
import { SORA, EMBER } from './ContaConstants';

export default function AccountTypeSelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const acctTypes = [
    { key: 'CHECKING', label: 'Conta corrente' },
    { key: 'SAVINGS', label: 'Conta poupanca' },
    { key: 'PAYMENT', label: 'Conta pagamento' },
  ];

  const btnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '9px 0',
    background: active ? 'var(--app-accent-light)' : 'transparent',
    border: active ? `1px solid ${EMBER}` : '1px solid var(--app-border-primary)',
    borderRadius: 6,
    color: active ? EMBER : 'var(--app-text-secondary)',
    fontSize: 11,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: SORA,
    transition: 'all 150ms ease',
  });

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
      {acctTypes.map((t) => (
        <button
          type="button"
          key={t.key}
          onClick={() => onChange(t.key)}
          style={btnStyle(value === t.key)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
