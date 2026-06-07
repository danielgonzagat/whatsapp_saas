'use client';

import { colors } from '@/lib/design-tokens';

import { kloelT } from '@/lib/i18n/t';
import { useState, useId } from 'react';
import { useBankAccounts } from '@/hooks/useWallet';
import { IC, STATUS_COLOR, STATUS_LABEL } from './carteira.config';
import { Fmt } from './carteira.helpers';
import { AddBankAccountForm } from './carteira-add-bank-form';
import type { RawBankAccount, WithdrawalItem } from './carteira.types';

export default function CarteiraSaque({
  available,
  onOpenWithdraw,
  withdrawals,
}: {
  available: number;
  onOpenWithdraw: () => void;
  withdrawals: WithdrawalItem[];
}) {
  const fid = useId();
  const { accounts, addBankAccount, removeBankAccount } = useBankAccounts();
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [addForm, setAddForm] = useState({
    bankName: '',
    pixKey: '',
    bankCode: '',
    agency: '',
    account: '',
    accountType: 'checking',
  });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState('');
  const [confirmingRemoveAccountId, setConfirmingRemoveAccountId] = useState<string | null>(null);

  const handleAddAccount = async () => {
    if (!addForm.bankName) {
      setAddError('Informe o nome do banco');
      return;
    }
    if (!addForm.pixKey && !addForm.account) {
      setAddError('Informe a chave PIX ou conta');
      return;
    }
    setAddLoading(true);
    setAddError('');
    try {
      await addBankAccount({
        bankName: addForm.bankName,
        pixKey: addForm.pixKey,
        bankCode: addForm.bankCode,
        agency: addForm.agency,
        account: addForm.account,
      });
      setShowAddAccount(false);
      setAddForm({
        bankName: '',
        pixKey: '',
        bankCode: '',
        agency: '',
        account: '',
        accountType: 'checking',
      });
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Erro ao adicionar conta');
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--app-text-secondary)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
            }}
          >
            {kloelT(`Disponivel`)}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 20,
              fontWeight: 700,
              color: colors.ember.primary,
            }}
          >
            {kloelT(`R$`)} {Fmt(available)}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenWithdraw}
          style={{
            padding: '10px 24px',
            background: colors.ember.primary,
            color: 'var(--app-text-on-accent)',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: "'Sora',sans-serif",
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {IC.upload(14)} {kloelT(`Novo saque`)}
        </button>
      </div>

      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          padding: 20,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--app-text-primary)' }}>
            {kloelT(`Contas cadastradas`)}
          </span>
          <button
            type="button"
            onClick={() => setShowAddAccount(!showAddAccount)}
            style={{
              padding: '6px 14px',
              background: showAddAccount ? 'var(--app-bg-secondary)' : 'var(--app-accent-light)',
              border: `1px solid ${showAddAccount ? 'var(--app-border-primary)' : 'var(--app-accent-medium)'}`,
              borderRadius: 6,
              color: showAddAccount ? 'var(--app-text-secondary)' : colors.ember.primary,
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: "'Sora',sans-serif",
            }}
          >
            {showAddAccount ? 'Cancelar' : '+ Adicionar conta'}
          </button>
        </div>

        {showAddAccount && (
          <AddBankAccountForm
            fid={fid}
            addForm={addForm}
            setAddForm={setAddForm}
            addLoading={addLoading}
            addError={addError}
            onSave={handleAddAccount}
          />
        )}

        {accounts.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>
              {kloelT(`Nenhuma conta cadastrada. Adicione uma conta para fazer saques.`)}
            </span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {accounts.map((a: RawBankAccount) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  background: 'var(--app-bg-primary)',
                  border: '1px solid var(--app-border-primary)',
                  borderRadius: 6,
                  padding: '10px 14px',
                }}
              >
                <span style={{ color: colors.ember.primary, display: 'flex' }}>
                  {IC.bank(16)}
                </span>
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--app-text-primary)',
                      display: 'block',
                    }}
                  >
                    {a.bankName || a.bank || 'Conta'}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                    {a.displayAccount ||
                      (a.pixKey
                        ? `PIX: ****${String(a.pixKey).slice(-4)}`
                        : a.account
                          ? `Conta: ****${String(a.account).slice(-4)}`
                          : '')}{' '}
                    — {a.pixKey ? 'PIX' : a.accountType || 'TED'}
                  </span>
                </div>
                {a.isDefault && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: colors.ember.primary,
                      background: 'rgba(232,93,48,0.1)',
                      padding: '2px 6px',
                      borderRadius: 4,
                      textTransform: 'uppercase',
                      letterSpacing: '.06em',
                    }}
                  >
                    {kloelT(`Padrao`)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (confirmingRemoveAccountId !== a.id) {
                      setConfirmingRemoveAccountId(a.id);
                      return;
                    }
                    setConfirmingRemoveAccountId(null);
                    void removeBankAccount(a.id);
                  }}
                  style={{
                    background: confirmingRemoveAccountId === a.id ? 'rgba(232,93,48,0.12)' : 'none',
                    border: confirmingRemoveAccountId === a.id ? '1px solid rgba(232,93,48,0.42)' : '1px solid transparent',
                    borderRadius: 4,
                    color: confirmingRemoveAccountId === a.id ? colors.ember.primary : 'var(--app-text-tertiary)',
                    cursor: 'pointer',
                    padding: confirmingRemoveAccountId === a.id ? '4px 8px' : 4,
                    display: 'flex',
                    alignItems: 'center',
                    fontFamily: "'Sora',sans-serif",
                    fontSize: 10,
                    fontWeight: 600,
                  }}
                  title={
                    confirmingRemoveAccountId === a.id
                      ? kloelT(`Confirmar remocao da conta ${a.bankName || a.bank || 'Conta'}`)
                      : kloelT(`Remover conta`)
                  }
                  aria-label={
                    confirmingRemoveAccountId === a.id
                      ? kloelT(`Confirmar remocao da conta ${a.bankName || a.bank || 'Conta'}`)
                      : kloelT(`Remover conta`)
                  }
                >
                  {confirmingRemoveAccountId === a.id ? kloelT(`Confirmar`) : IC.x(12)}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr 0.8fr 1.2fr',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '1px solid var(--app-border-subtle)',
          }}
        >
          {['Valor', 'Destino', 'Metodo', 'Status', 'Data'].map((h) => (
            <span
              key={h}
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--app-text-tertiary)',
                letterSpacing: '.06em',
                textTransform: 'uppercase',
              }}
            >
              {h}
            </span>
          ))}
        </div>
        {withdrawals.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--app-text-tertiary)' }}>
              {kloelT(`Nenhum saque realizado`)}
            </span>
          </div>
        ) : (
          withdrawals.map((w, i, arr) => (
            <div
              key={w.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr 0.8fr 1.2fr',
                gap: 12,
                padding: '14px 16px',
                borderBottom: i < arr.length - 1 ? '1px solid var(--app-border-subtle)' : 'none',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--app-text-primary)',
                }}
              >
                {kloelT(`R$`)} {Fmt(Math.abs(w.amount))}
              </span>
              <div>
                <span style={{ fontSize: 12, color: 'var(--app-text-primary)', display: 'block' }}>
                  {w.bank || w.description || 'Saque'}
                </span>
                <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                  {w.account || ''}
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--app-text-secondary)' }}>
                {w.method || 'PIX'}
              </span>
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: STATUS_COLOR[w.status] || 'var(--app-text-secondary)',
                  fontFamily: "'JetBrains Mono',monospace",
                }}
              >
                {STATUS_LABEL[w.status] || w.status}
              </span>
              <div>
                <span
                  style={{ fontSize: 11, color: 'var(--app-text-secondary)', display: 'block' }}
                >
                  {w.requested ||
                    (w.createdAt ? new Date(w.createdAt).toLocaleString('pt-BR') : '')}
                </span>
                {w.completed && (
                  <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                    {kloelT(`Concluido:`)} {w.completed}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
