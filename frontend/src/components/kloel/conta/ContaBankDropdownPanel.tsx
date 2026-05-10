'use client';
import { useCallback } from 'react';
import { kloelT } from '@/lib/i18n/t';
import { SORA, MONO, EMBER } from './ContaConstants';
import { formatBankCode } from '@/hooks/useBrazilianBanks';
import type { BrazilianBank } from '@/hooks/useBrazilianBanks';
import BankListItem from './ContaBankListItem';

export default function BankDropdownPanel({
  bankSearch,
  onBankSearchChange,
  searchTerm,
  showAllBanks,
  onShowAllBanks,
  filteredBanks,
  selectedCode,
  onSelectBank,
}: {
  bankSearch: string;
  onBankSearchChange: (v: string) => void;
  searchTerm: string;
  showAllBanks: boolean;
  onShowAllBanks: () => void;
  filteredBanks: BrazilianBank[];
  selectedCode: string;
  onSelectBank: (bank: BrazilianBank) => void;
}) {
  const autoFocusRef = useCallback((element: HTMLInputElement | null) => {
    if (!element) {
      return;
    }
    requestAnimationFrame(() => {
      element.focus();
    });
  }, []);

  return (
    <div
      style={{
        position: 'absolute' as const,
        top: '100%',
        left: 0,
        right: 0,
        marginTop: 4,
        zIndex: 100,
        background: 'var(--app-bg-card)',
        border: '1px solid var(--app-border-primary)',
        borderRadius: 6,
        boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
        maxHeight: 280,
        display: 'flex',
        flexDirection: 'column' as const,
      }}
    >
      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid var(--app-border-subtle)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--app-bg-primary)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 4,
            padding: '6px 10px',
          }}
        >
          <svg
            width={13}
            height={13}
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--app-text-placeholder)"
            strokeWidth={2}
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            aria-label="Buscar banco ou codigo"
            value={bankSearch}
            onChange={(e) => onBankSearchChange(e.target.value)}
            placeholder={kloelT(`Buscar banco ou codigo...`)}
            ref={autoFocusRef}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--app-text-primary)',
              fontSize: 12,
              fontFamily: SORA,
            }}
          />
        </div>
      </div>
      <div style={{ overflowY: 'auto' as const, flex: 1, maxHeight: 220 }}>
        {!searchTerm && !showAllBanks && (
          <div
            style={{
              padding: '6px 14px 2px',
              fontSize: 9,
              fontWeight: 600,
              color: 'var(--app-text-tertiary)',
              letterSpacing: '.06em',
              textTransform: 'uppercase' as const,
              fontFamily: SORA,
            }}
          >
            {kloelT(`Mais populares`)}
          </div>
        )}
        {filteredBanks.length === 0 ? (
          <div
            style={{
              padding: '16px 14px',
              textAlign: 'center' as const,
              color: 'var(--app-text-tertiary)',
              fontSize: 12,
              fontFamily: SORA,
            }}
          >
            {kloelT(`Nenhum banco encontrado`)}
          </div>
        ) : (
          filteredBanks.map((bank) => {
            const code3 = formatBankCode(bank.code);
            return (
              <BankListItem
                key={`${bank.code}-${bank.ispb}`}
                bank={bank}
                code3={code3}
                isSelected={selectedCode === code3}
                onSelect={onSelectBank}
              />
            );
          })
        )}
        {!searchTerm && !showAllBanks && (
          <button
            type="button"
            onClick={onShowAllBanks}
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'none',
              border: 'none',
              borderTop: '1px solid var(--app-border-primary)',
              color: EMBER,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: SORA,
              textAlign: 'center' as const,
            }}
          >
            {kloelT(`Ver todos os bancos`)}
          </button>
        )}
      </div>
    </div>
  );
}
