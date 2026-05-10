'use client';
import { SORA, MONO, EMBER } from './ContaConstants';
import { kloelT } from '@/lib/i18n/t';
import BankDropdownPanel from './ContaBankDropdownPanel';

export default function ContaBankSelectorField({
  bankRef,
  banksLoading,
  banksError,
  formBankName,
  formBankCode,
  bankDropdownOpen,
  onToggleDropdown,
  bankSearch,
  onBankSearchChange,
  searchTerm,
  showAllBanks,
  onShowAllBanks,
  filteredBanks,
  onSelectBank,
}: {
  bankRef: React.RefObject<HTMLDivElement | null>;
  banksLoading: boolean;
  banksError: string | null;
  formBankName: string;
  formBankCode: string;
  bankDropdownOpen: boolean;
  onToggleDropdown: () => void;
  bankSearch: string;
  onBankSearchChange: (v: string) => void;
  searchTerm: string;
  showAllBanks: boolean;
  onShowAllBanks: () => void;
  filteredBanks: Array<{ code: number; fullName: string; name: string; ispb: string }>;
  onSelectBank: (bank: { code: number; fullName: string; name: string; ispb: string }) => void;
}) {
  return (
    <div ref={bankRef} style={{ flex: 1, position: 'relative' as const }}>
      <span
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
      >
        {kloelT(`Banco`)} <span style={{ color: EMBER, fontSize: 8 }}>*</span>
      </span>
      <button
        type="button"
        onClick={onToggleDropdown}
        disabled={banksLoading}
        aria-haspopup="listbox"
        aria-expanded={bankDropdownOpen}
        aria-label="Selecionar banco"
        aria-busy={banksLoading}
        style={{
          width: '100%',
          padding: '11px 14px',
          background: 'var(--app-bg-card)',
          border: `1px solid ${bankDropdownOpen ? EMBER : 'var(--app-border-primary)'}`,
          boxShadow: bankDropdownOpen ? '0 0 0 3px rgba(232,93,48,.06)' : 'none',
          borderRadius: 6,
          fontSize: 13,
          fontFamily: SORA,
          color: banksLoading ? 'var(--app-text-placeholder)' : 'var(--app-text-primary)',
          cursor: banksLoading ? 'not-allowed' : 'pointer',
          opacity: banksLoading ? 0.6 : 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'border-color .15s, box-shadow .15s',
          boxSizing: 'border-box' as const,
          textAlign: 'inherit' as const,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: formBankName ? 'var(--app-text-primary)' : 'var(--app-text-placeholder)',
          }}
        >
          {banksLoading ? 'Carregando bancos...' : banksError ? 'Erro ao carregar' : formBankName ? `${formBankCode} — ${formBankName}` : 'Selecione o banco'}
        </span>
        <svg
          width={12}
          height={12}
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--app-text-secondary)"
          strokeWidth={2}
          style={{
            transform: bankDropdownOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform .15s',
            flexShrink: 0,
          }}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {bankDropdownOpen && (
        <BankDropdownPanel
          bankSearch={bankSearch}
          onBankSearchChange={onBankSearchChange}
          searchTerm={searchTerm}
          showAllBanks={showAllBanks}
          onShowAllBanks={onShowAllBanks}
          filteredBanks={filteredBanks}
          selectedCode={formBankCode}
          onSelectBank={onSelectBank}
        />
      )}
    </div>
  );
}
