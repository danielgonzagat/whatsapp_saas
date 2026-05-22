'use client';
import { SORA, MONO, EMBER } from './ContaConstants';
import Icons from './ContaIcons';
import type { BrazilianBank } from '@/hooks/useBrazilianBanks';

export default function BankListItem({
  bank,
  code3,
  isSelected,
  onSelect,
}: {
  bank: BrazilianBank;
  code3: string;
  isSelected: boolean;
  onSelect: (bank: BrazilianBank) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(bank)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 14px',
        background: isSelected ? 'rgba(232,93,48,0.06)' : 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--app-border-subtle)',
        cursor: 'pointer',
        textAlign: 'left' as const,
        transition: 'background .1s',
      }}
      onMouseEnter={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLElement).style.background = 'var(--app-bg-hover)';
        }
      }}
      onMouseLeave={(e) => {
        if (!isSelected) {
          (e.currentTarget as HTMLElement).style.background = 'transparent';
        }
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 600,
            color: EMBER,
            width: 32,
            flexShrink: 0,
          }}
        >
          {code3}
        </span>
        <span
          style={{
            fontSize: 12,
            color: 'var(--app-text-primary)',
            fontFamily: SORA,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {bank.fullName}
        </span>
      </div>
      {isSelected && <span style={{ color: EMBER, flexShrink: 0 }}>{Icons.check(14)}</span>}
    </button>
  );
}
