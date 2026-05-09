'use client';

import { kloelT } from '@/lib/i18n/t';
import { useCallback, useEffect, useRef, useState, useId } from 'react';
import { useBankMutations } from '@/hooks/useKyc';
import { BRAZILIAN_BANKS, POPULAR_BANK_CODES, formatBankCode } from '@/data/brazilian-banks';
import Icons from './ContaIcons';
import { SORA, MONO, EMBER, U0300__U036F_RE } from './ContaConstants';
import { cleanPayload, getErrorMessage, bankAccountToFormState } from './ContaHelpers';
import { Field, SaveActions, SectionCard } from './ContaShared';
import type { KycBankAccount, KycFiscal, KycProfile } from './ContaTypes';

function BankListItem({
  bank,
  code3,
  isSelected,
  onSelect,
}: {
  bank: (typeof BRAZILIAN_BANKS)[number];
  code3: string;
  isSelected: boolean;
  onSelect: (bank: (typeof BRAZILIAN_BANKS)[number]) => void;
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

function BankDropdownPanel({
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
  filteredBanks: typeof BRAZILIAN_BANKS;
  selectedCode: string;
  onSelectBank: (bank: (typeof BRAZILIAN_BANKS)[number]) => void;
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

function AccountTypeSelector({
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

function PixFields({
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

export default function DadosBancariosSection({
  bankAccount,
  fiscal,
  profile,
  mutate,
}: {
  bankAccount: KycBankAccount | null;
  fiscal: KycFiscal | null;
  profile: KycProfile | null;
  mutate: () => void;
}) {
  const fid = useId();
  const { updateBank } = useBankMutations();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    },
    [],
  );
  const [form, setForm] = useState({
    bankName: '',
    bankCode: '',
    agency: '',
    account: '',
    accountType: 'CHECKING',
    pixKey: '',
    pixKeyType: '',
    holderName: '',
    holderDocument: '',
  });

  const [bankSearch, setBankSearch] = useState('');
  const [bankDropdownOpen, setBankDropdownOpen] = useState(false);
  const [showAllBanks, setShowAllBanks] = useState(false);
  const bankRef = useRef<HTMLDivElement>(null);

  const normalize = (s: string) => s.normalize('NFD').replace(U0300__U036F_RE, '').toLowerCase();

  const searchTerm = bankSearch.trim();
  const filteredBanks = bankDropdownOpen
    ? searchTerm
      ? BRAZILIAN_BANKS.filter((b) => {
          const q = normalize(searchTerm);
          return (
            normalize(b.fullName).includes(q) ||
            normalize(b.name).includes(q) ||
            formatBankCode(b.code).includes(searchTerm) ||
            String(b.code) === searchTerm
          );
        })
      : showAllBanks
        ? BRAZILIAN_BANKS
        : BRAZILIAN_BANKS.filter((b) => POPULAR_BANK_CODES.has(b.code))
    : [];

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (bankRef.current && !bankRef.current.contains(e.target as Node)) {
        setBankDropdownOpen(false);
        setBankSearch('');
        setShowAllBanks(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectBank = (bank: (typeof BRAZILIAN_BANKS)[number]) => {
    setForm((prev) => ({ ...prev, bankName: bank.fullName, bankCode: formatBankCode(bank.code) }));
    setBankSearch('');
    setBankDropdownOpen(false);
  };

  const isPJ = fiscal?.type === 'PJ' || !!fiscal?.cnpj;
  const autoHolderName = isPJ
    ? fiscal?.razaoSocial || fiscal?.nomeFantasia || ''
    : profile?.name || fiscal?.fullName || '';
  const autoHolderDoc = isPJ ? fiscal?.cnpj || '' : fiscal?.cpf || profile?.documentNumber || '';

  useEffect(() => {
    if (bankAccount) {
      setForm(bankAccountToFormState(bankAccount, autoHolderName, autoHolderDoc));
    } else {
      setForm((prev) => ({
        ...prev,
        holderName: autoHolderName || prev.holderName,
        holderDocument: autoHolderDoc || prev.holderDocument,
      }));
    }
  }, [bankAccount, autoHolderName, autoHolderDoc]);

  const set = (k: string, v: string) => setForm((prev) => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    setError('');
    setSaveStatus('idle');
    if (!form.bankName || !form.bankCode) {
      setError('Selecione um banco da lista.');
      return;
    }
    setSaving(true);
    try {
      await updateBank(cleanPayload(form));
      setSaveStatus('success');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 3000);
      mutate();
    } catch (e) {
      setError(getErrorMessage(e) || 'Erro ao salvar. Tente novamente.');
      setSaveStatus('error');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 4000);
    }
    setSaving(false);
  };

  return (
    <SectionCard
      title={kloelT(`Dados bancarios`)}
      subtitle={kloelT(`Conta para recebimento de saques`)}
    >
      <AccountTypeSelector value={form.accountType} onChange={(v) => set('accountType', v)} />

      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 14 }}>
        <div style={{ display: 'flex', gap: 14 }}>
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
              onClick={() => setBankDropdownOpen(true)}
              aria-haspopup="listbox"
              aria-expanded={bankDropdownOpen}
              aria-label="Selecionar banco"
              style={{
                width: '100%',
                padding: '11px 14px',
                background: 'var(--app-bg-card)',
                border: `1px solid ${bankDropdownOpen ? EMBER : 'var(--app-border-primary)'}`,
                boxShadow: bankDropdownOpen ? '0 0 0 3px rgba(232,93,48,.06)' : 'none',
                borderRadius: 6,
                fontSize: 13,
                fontFamily: SORA,
                color: 'var(--app-text-primary)',
                cursor: 'pointer',
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
                  color: form.bankName ? 'var(--app-text-primary)' : 'var(--app-text-placeholder)',
                }}
              >
                {form.bankName ? `${form.bankCode} — ${form.bankName}` : 'Selecione o banco'}
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
                onBankSearchChange={setBankSearch}
                searchTerm={searchTerm}
                showAllBanks={showAllBanks}
                onShowAllBanks={() => setShowAllBanks(true)}
                filteredBanks={filteredBanks}
                selectedCode={form.bankCode}
                onSelectBank={selectBank}
              />
            )}
          </div>

          <div style={{ flex: 1 }}>
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
              {kloelT(`Codigo do banco`)} <span style={{ color: EMBER, fontSize: 8 }}>*</span>
            </span>
            <div
              style={{
                width: '100%',
                padding: '11px 14px',
                background: 'var(--app-bg-primary)',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                fontSize: 13,
                fontFamily: MONO,
                color: form.bankCode ? 'var(--app-text-primary)' : 'var(--app-text-placeholder)',
                boxSizing: 'border-box' as const,
              }}
            >
              {form.bankCode || '---'}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 14 }}>
          <Field
            label={kloelT(`Agencia`)}
            placeholder="0000"
            value={form.agency}
            onChange={(v) => set('agency', v)}
            mono
            half
          />
          <Field
            label={kloelT(`Conta`)}
            placeholder="00000-0"
            value={form.account}
            onChange={(v) => set('account', v)}
            mono
            half
          />
        </div>

        <div style={{ display: 'flex', gap: 14 }}>
          <Field
            label={kloelT(`Titular da conta`)}
            placeholder={kloelT(`Nome completo do titular`)}
            value={form.holderName}
            onChange={(v) => set('holderName', v)}
            half
            disabled
          />
          <Field
            label={kloelT(`CPF/CNPJ do titular`)}
            placeholder="000.000.000-00"
            value={form.holderDocument}
            onChange={(v) => set('holderDocument', v)}
            mono
            half
            disabled
          />
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 12px',
            background: 'rgba(232,93,48,0.04)',
            border: '1px solid rgba(232,93,48,0.1)',
            borderRadius: 6,
            marginTop: -4,
          }}
        >
          {Icons.shield(12)}
          <span style={{ fontSize: 10, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
            {isPJ
              ? 'Titular preenchido com a razao social e CNPJ dos dados fiscais. A conta deve ser da mesma titularidade.'
              : 'Titular preenchido com seus dados cadastrais. A conta bancaria deve ser de mesma titularidade.'}
          </span>
        </div>

        <PixFields form={form} set={set} fid={fid} />
      </div>

      <div
        style={{
          marginTop: 20,
          background: isPJ ? 'rgba(16,185,129,.04)' : 'rgba(245,158,11,.04)',
          border: `1px solid ${isPJ ? 'rgba(16,185,129,.15)' : 'rgba(245,158,11,.15)'}`,
          borderRadius: 6,
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
        }}
      >
        <span style={{ color: isPJ ? '#10B981' : '#F59E0B', marginTop: 2, flexShrink: 0 }}>
          {isPJ ? Icons.check(16) : Icons.alert(16)}
        </span>
        <div>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              display: 'block',
              fontFamily: SORA,
            }}
          >
            {isPJ ? 'Saque ilimitado' : 'Limite de saque mensal'}
          </span>
          <span style={{ fontSize: 11, color: 'var(--app-text-secondary)', fontFamily: SORA }}>
            {isPJ
              ? 'Contas CNPJ nao possuem limite de saque mensal.'
              : 'Como pessoa fisica, o limite de saque e de R$ 2.259,20/mes. Cadastre um CNPJ para remover o limite.'}
          </span>
        </div>
      </div>

      <SaveActions error={error} saveStatus={saveStatus} saving={saving} onSave={handleSave} />
    </SectionCard>
  );
}
