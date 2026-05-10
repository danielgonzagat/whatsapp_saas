'use client';
import { colors } from '@/lib/design-tokens';
import { kloelT } from '@/lib/i18n/t';
import { useEffect, useRef, useState, useId } from 'react';
import { useBankMutations } from '@/hooks/useKyc';
import { useToast } from '@/components/kloel/ToastProvider';
import { useBrazilianBanks, formatBankCode, POPULAR_BANK_CODES, type BrazilianBank } from '@/hooks/useBrazilianBanks';
import Icons from './ContaIcons';
import { SORA, MONO, EMBER, U0300__U036F_RE } from './ContaConstants';
import { cleanPayload, getErrorMessage, bankAccountToFormState } from './ContaHelpers';
import { Field, SaveActions, SectionCard } from './ContaShared';
import type { KycBankAccount, KycFiscal, KycProfile } from './ContaTypes';
import AccountTypeSelector from './ContaAccountTypeSelector';
import PixFields from './ContaPixFields';
import ContaBankSelectorField from './ContaBankSelectorField';

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
  const { banks, isLoading: banksLoading, error: banksError } = useBrazilianBanks();
  const { updateBank } = useBankMutations();
  const { showToast } = useToast();
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
      ? banks.filter((b) => {
          const q = normalize(searchTerm);
          return (
            normalize(b.fullName).includes(q) ||
            normalize(b.name).includes(q) ||
            formatBankCode(b.code).includes(searchTerm) ||
            String(b.code) === searchTerm
          );
        })
      : showAllBanks
        ? banks
        : banks.filter((b) => POPULAR_BANK_CODES.has(b.code))
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

  const selectBank = (bank: BrazilianBank) => {
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
      showToast('Dados bancarios salvos', 'success');
    } catch (e) {
      setError(getErrorMessage(e) || 'Erro ao salvar. Tente novamente.');
      setSaveStatus('error');
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
      saveTimer.current = setTimeout(() => setSaveStatus('idle'), 4000);
      showToast('Erro ao salvar dados bancarios', 'error');
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
          <ContaBankSelectorField
            bankRef={bankRef}
            banksLoading={banksLoading}
            banksError={banksError || null}
            formBankName={form.bankName}
            formBankCode={form.bankCode}
            bankDropdownOpen={bankDropdownOpen}
            onToggleDropdown={() => { if (!banksLoading) setBankDropdownOpen(true); }}
            bankSearch={bankSearch}
            onBankSearchChange={setBankSearch}
            searchTerm={searchTerm}
            showAllBanks={showAllBanks}
            onShowAllBanks={() => setShowAllBanks(true)}
            filteredBanks={filteredBanks}
            onSelectBank={selectBank}
          />

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
        <span style={{ color: isPJ ? colors.semantic.success : colors.semantic.warning, marginTop: 2, flexShrink: 0 }}>
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
