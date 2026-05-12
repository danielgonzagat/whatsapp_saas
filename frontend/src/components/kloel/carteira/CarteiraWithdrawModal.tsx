'use client';

import { kloelT } from '@/lib/i18n/t';
import { useBankAccounts } from '@/hooks/useWallet';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { apiFetch } from '@/lib/api';
import { useCallback, useState } from 'react';
import { mutate } from 'swr';
import { colors } from '@/lib/design-tokens';
import { Fmt } from './carteira.helpers';
import { IC } from './carteira.config';
import type { RawBankAccount } from './carteira.types';

export function CarteiraWithdrawModal({
  open,
  onClose,
  available,
  withdrawAmount,
  onWithdrawAmountChange,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  available: number;
  withdrawAmount: string;
  onWithdrawAmountChange: (v: string) => void;
  onSuccess?: () => void;
}) {
  const workspaceId = useWorkspaceId();
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');
  const [selectedBank, setSelectedBank] = useState(0);
  const { accounts: rawAccounts } = useBankAccounts();
  const withdrawInputRef = useCallback((element: HTMLInputElement | null) => {
    if (!element) {
      return;
    }
    requestAnimationFrame(() => {
      element.focus();
    });
  }, []);

  const bankAccounts = (rawAccounts as RawBankAccount[]).map((a) => ({
    bank: a.bankName || a.bank || a.name || 'Conta',
    acc:
      a.displayAccount ||
      (a.account
        ? `****${String(a.account).slice(-4)}`
        : a.pixKey
          ? `****${String(a.pixKey).slice(-4)}`
          : '****'),
    type: a.pixKey ? 'PIX' : a.accountType || 'TED',
    id: a.id,
    pixKey: a.pixKey,
    bankCode: a.bankCode,
    agency: a.agency,
    account: a.account,
  }));

  const handleWithdraw = async () => {
    const amount = Number.parseFloat(withdrawAmount.replace(',', '.'));
    if (!amount || amount <= 0) {
      setWithdrawError('Informe um valor valido');
      return;
    }
    if (amount > available) {
      setWithdrawError('Saldo insuficiente');
      return;
    }
    setWithdrawLoading(true);
    setWithdrawError('');
    try {
      const selected = bankAccounts[selectedBank];
      const body: Record<string, unknown> = { amount: Math.round(amount * 100) };
      if (selected) {
        if (selected.pixKey) {
          body.pixKey = selected.pixKey;
        }
        if (selected.bankCode) {
          body.bankCode = selected.bankCode;
        }
        if (selected.agency) {
          body.agency = selected.agency;
        }
        if (selected.account) {
          body.account = selected.account;
        }
      }
      const res = await apiFetch(`/kloel/wallet/${workspaceId}/withdraw`, {
        method: 'POST',
        body,
      });
      if (res.error) {
        setWithdrawError(res.error);
        return;
      }
      mutate((key: string) => typeof key === 'string' && key.startsWith('/kloel/wallet'));
      onClose();
      onSuccess?.();
    } catch (err: unknown) {
      setWithdrawError(err instanceof Error ? err.message : 'Erro ao solicitar saque');
    } finally {
      setWithdrawLoading(false);
    }
  };

  if (!open) {
    return null;
  }
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          (e.currentTarget as HTMLElement).click();
        }
      }}
    >
      <div
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
        style={{
          background: 'var(--app-bg-primary)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          width: 440,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--app-border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--app-text-primary)' }}>
            {kloelT(`Solicitar saque`)}
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--app-text-tertiary)',
              cursor: 'pointer',
            }}
          >
            {IC.x(16)}
          </button>
        </div>
        <div style={{ padding: 20 }}>
          <div
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 16,
              marginBottom: 20,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: 'var(--app-text-secondary)',
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                display: 'block',
                marginBottom: 6,
              }}
            >
              {kloelT(`Disponivel para saque`)}
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 24,
                fontWeight: 700,
                color: 'colors.ember.primary',
              }}
            >
              {kloelT(`R$`)} {Fmt(available)}
            </span>
          </div>
          <div style={{ marginBottom: 16 }}>
            <span
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--app-text-secondary)',
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              {kloelT(`Valor do saque`)}
            </span>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--app-bg-card)',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                padding: '12px 16px',
              }}
            >
              <span style={{ fontSize: 14, color: 'var(--app-text-secondary)', marginRight: 8 }}>
                {kloelT(`R$`)}
              </span>
              <input
                aria-label="Valor do saque"
                value={withdrawAmount}
                onChange={(e) => onWithdrawAmountChange(e.target.value)}
                placeholder="0,00"
                ref={withdrawInputRef}
                style={{
                  flex: 1,
                  background: 'none',
                  border: 'none',
                  outline: 'none',
                  color: 'var(--app-text-primary)',
                  fontSize: 18,
                  fontFamily: "'JetBrains Mono',monospace",
                  fontWeight: 600,
                }}
              />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <span
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--app-text-secondary)',
                letterSpacing: '.06em',
                textTransform: 'uppercase',
                marginBottom: 6,
              }}
            >
              {kloelT(`Conta destino`)}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {bankAccounts.length === 0 ? (
                <div
                  style={{
                    padding: '16px 14px',
                    background: 'var(--app-bg-card)',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 6,
                    textAlign: 'center',
                  }}
                >
                  <span style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                    {kloelT(`Nenhuma conta cadastrada. Cadastre em`)}{' '}
                    <strong>{kloelT(`Configuracoes &gt; Dados bancarios`)}</strong>.
                  </span>
                </div>
              ) : (
                bankAccounts.map((b, i) => (
                  <label
                    key={`${b.bank}-${b.acc}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      background:
                        selectedBank === i ? 'var(--app-accent-light)' : 'var(--app-bg-card)',
                      border: `1px solid ${selectedBank === i ? 'var(--app-accent-medium)' : 'var(--app-border-primary)'}`,
                      borderRadius: 6,
                      padding: '10px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="bank-account"
                      checked={selectedBank === i}
                      onChange={() => setSelectedBank(i)}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                    />
                    <div
                      aria-hidden="true"
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        border: `2px solid ${selectedBank === i ? 'colors.ember.primary' : 'var(--app-text-placeholder)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {selectedBank === i && (
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 4,
                            background: 'colors.ember.primary',
                          }}
                        />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <span
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          color: 'var(--app-text-primary)',
                          display: 'block',
                        }}
                      >
                        {b.bank}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                        {b.acc} — {b.type}
                      </span>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
          <div
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 12,
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ color: colors.semantic.info, display: 'flex' }}>{IC.shield(14)}</span>
            <span style={{ fontSize: 11, color: 'var(--app-text-secondary)' }}>
              {kloelT(`Saques via PIX sao processados em ate 2 minutos. TED em ate 1 dia util.`)}
            </span>
          </div>
          <button
            type="button"
            onClick={handleWithdraw}
            disabled={withdrawLoading}
            style={{
              width: '100%',
              padding: '14px 24px',
              background: withdrawLoading ? 'var(--app-bg-secondary)' : 'colors.ember.primary',
              color: withdrawLoading ? 'var(--app-text-secondary)' : 'var(--app-text-on-accent)',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 700,
              cursor: withdrawLoading ? 'default' : 'pointer',
              fontFamily: "'Sora',sans-serif",
            }}
          >
            {withdrawLoading ? 'Processando...' : 'Solicitar saque'}
          </button>
          {withdrawError && (
            <div
              style={{
                marginTop: 10,
                padding: '8px 12px',
                background: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: 6,
              }}
            >
              <span style={{ fontSize: 12, color: colors.semantic.error }}>{withdrawError}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
