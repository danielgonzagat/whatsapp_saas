'use client';

import { kloelT } from '@/lib/i18n/t';
import {
  SUBINTERFACE_PILL_ROW_STYLE,
  getSubinterfacePillStyle,
} from '@/components/kloel/ui/subinterface-pill';
import { useResponsiveViewport } from '@/hooks/useResponsiveViewport';
import {
  useBankAccounts,
  useWalletAnticipations,
  useWalletBalance,
  useWalletChart,
  useWalletMonthly,
  useWalletTransactions,
  useWalletWithdrawals,
} from '@/hooks/useWallet';
import { useWorkspaceId } from '@/hooks/useWorkspaceId';
import { apiFetch } from '@/lib/api';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useState } from 'react';
import { mutate } from 'swr';
import { colors } from '@/lib/design-tokens';
import {
  Fmt,
  renderWalletPulseKeyframes,
  WALLET_SELECTION_STYLE,
} from './carteira/carteira.helpers';
import type {
  AnticipationItem,
  RawBankAccount,
  RawTransaction,
  WithdrawalItem,
} from './carteira/carteira.types';
import { IC } from './carteira/carteira.config';
import CarteiraSaldoCard from './carteira/CarteiraSaldoCard';
import CarteiraExtratoTable from './carteira/CarteiraExtratoTable';
import CarteiraSaque from './carteira/CarteiraSaque';

/*
  KLOEL — CARTEIRA
  "Cada centavo que entra. Cada centavo que sai. Tudo visivel."
*/

/* ═══ EXTRACTED COMPONENTS ═══ */

/* --- WithdrawModal --- */
function WithdrawModal({
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
                            borderRadius: 2,
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

/* --- AntecipateModal --- */
function AntecipateModal({
  open,
  onClose,
  pending,
}: {
  open: boolean;
  onClose: () => void;
  pending: number;
}) {
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
            {kloelT(`Antecipar recebiveis`)}
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
              {kloelT(`Disponivel para antecipacao`)}
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 24,
                fontWeight: 700,
                color: 'var(--app-text-primary)',
              }}
            >
              {kloelT(`R$`)} {Fmt(pending)}
            </span>
          </div>
          <div
            style={{
              background: 'var(--app-bg-card)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 16,
              marginBottom: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span style={{ color: colors.semantic.warning, display: 'flex' }}>{IC.clock(16)}</span>
            <span style={{ fontSize: 12, color: 'var(--app-text-secondary)', lineHeight: 1.5 }}>
              {kloelT(`Antecipacao em breve — estamos ativando este recurso. Acompanhe suas antecipacoes
              existentes na aba Antecipacoes.`)}
            </span>
          </div>
          <button
            type="button"
            disabled
            style={{
              width: '100%',
              padding: '14px 24px',
              background: 'var(--app-bg-secondary)',
              color: 'var(--app-text-tertiary)',
              border: 'none',
              borderRadius: 6,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'not-allowed',
              fontFamily: "'Sora',sans-serif",
              position: 'relative',
            }}
            title={kloelT(`Antecipacao em breve — estamos ativando este recurso`)}
          >
            {kloelT(`Antecipar agora`)}
          </button>
        </div>
      </div>
    </div>
  );
}
/* --- TabAntecipacoes --- */
function TabAntecipacoes({
  pending,
  onOpenAntecipate,
  anticipations,
  antTotals,
}: {
  pending: number;
  onOpenAntecipate: () => void;
  anticipations: AnticipationItem[];
  antTotals: Record<string, number>;
}) {
  const antList = anticipations;
  const totalAnticipated = antTotals.totalAnticipated || 0;
  const totalFees = antTotals.totalFees || 0;
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 16,
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
            {kloelT(`Antecipavel agora`)}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 20,
              fontWeight: 600,
              color: 'colors.ember.primary',
            }}
          >
            {kloelT(`R$`)} {Fmt(pending)}
          </span>
        </div>
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 16,
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
            {kloelT(`Total antecipado`)}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 20,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
            }}
          >
            {kloelT(`R$`)} {Fmt(totalAnticipated)}
          </span>
        </div>
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 16,
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
            {kloelT(`Taxas pagas`)}
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 20,
              fontWeight: 600,
              color: 'var(--app-text-secondary)',
            }}
          >
            {kloelT(`R$`)} {Fmt(totalFees)}
          </span>
        </div>
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <button
            type="button"
            onClick={onOpenAntecipate}
            style={{
              padding: '10px 24px',
              background: 'colors.ember.primary',
              color: 'var(--app-text-on-accent)',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: "'Sora',sans-serif",
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {IC.spark(14)} {kloelT(`Antecipar agora`)}
          </button>
        </div>
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
            gridTemplateColumns: '1fr 0.8fr 0.6fr 1fr 0.7fr 0.6fr',
            gap: 12,
            padding: '10px 16px',
            borderBottom: '1px solid var(--app-border-subtle)',
          }}
        >
          {['Valor original', 'Taxa', '% Taxa', 'Valor liquido', 'Parcelas', 'Data'].map((h) => (
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
        {antList.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--app-text-tertiary)' }}>
              {kloelT(`Nenhuma antecipacao realizada`)}
            </span>
          </div>
        ) : (
          antList.map((a: AnticipationItem, i: number) => (
            <div
              key={a.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 0.8fr 0.6fr 1fr 0.7fr 0.6fr',
                gap: 12,
                padding: '14px 16px',
                borderBottom:
                  i < antList.length - 1 ? '1px solid var(--app-border-subtle)' : 'none',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 13,
                  color: 'var(--app-text-primary)',
                }}
              >
                {kloelT(`R$`)} {Fmt(a.original || a.originalAmount || 0)}
              </span>
              <span
                style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: colors.semantic.error }}
              >
                {kloelT(`- R$`)} {Fmt(a.fee || a.feeAmount || 0)}
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 11,
                  color: 'var(--app-text-secondary)',
                }}
              >
                {a.feePct || a.feePercent || 3.0}%
              </span>
              <span
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'colors.ember.primary',
                }}
              >
                {kloelT(`R$`)} {Fmt(a.net || a.netAmount || 0)}
              </span>
              <span style={{ fontSize: 12, color: 'var(--app-text-secondary)' }}>
                {a.installments || '—'}x
              </span>
              <span style={{ fontSize: 11, color: 'var(--app-text-tertiary)' }}>
                {a.date || (a.createdAt ? new Date(a.createdAt).toLocaleDateString('pt-BR') : '')}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}

/* ═══ MAIN ═══ */
export default function KloelCarteira({ defaultTab = 'saldo' }: { defaultTab?: string }) {
  const { isMobile } = useResponsiveViewport();
  const resolvedDefaultTab = defaultTab === 'movimentacoes' ? 'saldo' : defaultTab;
  const router = useRouter();
  const pathname = usePathname();

  const {
    balance: realBalance,
    isLoading: balanceLoading,
    mutate: mutateBalance,
  } = useWalletBalance();
  const { transactions: realTransactions, mutate: mutateTransactions } = useWalletTransactions();
  const { chart: realChart } = useWalletChart();
  useWalletMonthly();
  const { withdrawals: realWithdrawals, mutate: mutateWithdrawals } = useWalletWithdrawals();
  const { anticipations: realAnticipations, totals: realAntTotals } = useWalletAnticipations();

  const bal =
    realBalance && realBalance.available !== undefined
      ? {
          available: realBalance.available ?? 0,
          pending: realBalance.pending ?? 0,
          blocked: realBalance.blocked ?? realBalance.locked ?? 0,
          total:
            realBalance.total ??
            (realBalance.available ?? 0) + (realBalance.pending ?? 0) + (realBalance.blocked ?? 0),
        }
      : { available: 0, pending: 0, blocked: 0, total: 0 };

  const txList =
    realTransactions && realTransactions.length > 0
      ? (realTransactions as RawTransaction[]).map((t) => ({
          id: t.id,
          type: t.type || 'sale',
          desc: t.description || t.desc || '',
          amount: t.amount,
          status: t.status || 'completed',
          method: t.method || '—',
          date: new Date(t.createdAt).toLocaleDateString('pt-BR'),
          time: new Date(t.createdAt).toLocaleTimeString('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          fee: t.fee || 0,
        }))
      : [];

  const [tab, setTab] = useState(resolvedDefaultTab);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('todos');
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showAntecipateModal, setShowAntecipateModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  useEffect(() => {
    setTab(resolvedDefaultTab);
  }, [resolvedDefaultTab]);

  function handleTabChange(newTab: string) {
    setTab(newTab);
    setFilterType('todos');
    setSearch('');
    const routes: Record<string, string> = {
      saldo: '/carteira/saldo',
      extrato: '/carteira/extrato',
      saques: '/carteira/saques',
      antecipacoes: '/carteira/antecipacoes',
    };
    const nextRoute = routes[newTab] || '/carteira';
    if (pathname === nextRoute) {
      return;
    }
    startTransition(() => {
      router.push(nextRoute);
    });
  }

  const TABS = [
    { key: 'saldo', label: 'Saldo', icon: IC.wallet },
    { key: 'extrato', label: 'Extrato', icon: IC.calendar },
    { key: 'saques', label: 'Saques', icon: IC.upload },
    { key: 'antecipacoes', label: 'Antecipações', icon: IC.spark },
  ];

  return (
    <div
      data-testid="wallet-view-root"
      style={{
        background: 'var(--app-bg-primary)',
        minHeight: '100vh',
        fontFamily: "'Sora',sans-serif",
        color: 'var(--app-text-primary)',
        padding: isMobile ? 16 : 24,
      }}
    >
      <style>{WALLET_SELECTION_STYLE}</style>

      <WithdrawModal
        open={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        available={bal.available}
        withdrawAmount={withdrawAmount}
        onWithdrawAmountChange={setWithdrawAmount}
        onSuccess={() => {
          mutateBalance();
          mutateTransactions();
          mutateWithdrawals();
        }}
      />
      <AntecipateModal
        open={showAntecipateModal}
        onClose={() => setShowAntecipateModal(false)}
        pending={bal.pending}
      />

      <style>{renderWalletPulseKeyframes()}</style>

      {balanceLoading && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, 1fr)',
            gap: 12,
            marginBottom: 24,
          }}
        >
          {['saldo', 'receita', 'saques', 'pendente'].map((cardKey) => (
            <div
              key={`skeleton-card-${cardKey}`}
              style={{
                background: 'var(--app-bg-card)',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                padding: 18,
              }}
            >
              <div
                style={{
                  width: '60%',
                  height: 10,
                  background: 'var(--app-bg-secondary)',
                  borderRadius: 4,
                  marginBottom: 12,
                  animation: 'kloel-pulse 1.5s ease-in-out infinite',
                }}
              />
              <div
                style={{
                  width: '40%',
                  height: 22,
                  background: 'var(--app-bg-secondary)',
                  borderRadius: 4,
                  animation: 'kloel-pulse 1.5s ease-in-out infinite',
                }}
              />
            </div>
          ))}
        </div>
      )}

      <div style={SUBINTERFACE_PILL_ROW_STYLE}>
        {TABS.map((t) => (
          <button
            type="button"
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            style={getSubinterfacePillStyle(tab === t.key, isMobile)}
          >
            <span style={{ display: 'flex', alignItems: 'center' }}>{t.icon(14)}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ maxWidth: 1240, margin: '0 auto' }}>
        {tab === 'saldo' && !balanceLoading && (
          <CarteiraSaldoCard
            bal={bal}
            revenueChart={realChart}
            txList={txList}
            onOpenWithdraw={() => setShowWithdrawModal(true)}
            onOpenAntecipate={() => setShowAntecipateModal(true)}
            onNavigateExtrato={() => handleTabChange('extrato')}
          />
        )}
        {tab === 'extrato' && (
          <CarteiraExtratoTable
            txList={txList}
            filterType={filterType}
            onFilterTypeChange={setFilterType}
            search={search}
            onSearchChange={setSearch}
          />
        )}
        {tab === 'saques' && (
          <CarteiraSaque
            available={bal.available}
            onOpenWithdraw={() => setShowWithdrawModal(true)}
            withdrawals={realWithdrawals as WithdrawalItem[]}
          />
        )}
        {tab === 'antecipacoes' && (
          <TabAntecipacoes
            pending={bal.pending}
            onOpenAntecipate={() => setShowAntecipateModal(true)}
            anticipations={realAnticipations as AnticipationItem[]}
            antTotals={realAntTotals}
          />
        )}
      </div>
    </div>
  );
}
