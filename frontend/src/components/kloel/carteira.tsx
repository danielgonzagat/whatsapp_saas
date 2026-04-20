'use client';

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
import { startTransition, useCallback, useEffect, useState, useId } from 'react';
import { mutate } from 'swr';

const PATTERN_RE = /"/g;

/*
  KLOEL — CARTEIRA
  "Cada centavo que entra. Cada centavo que sai. Tudo visivel."
*/

const IC: Record<string, (s: number) => React.ReactElement> = {
  wallet: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <rect x="1" y="5" width="22" height="16" rx="2" />
      <path d="M1 10h22" />
    </svg>
  ),
  trend: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  ),
  trendD: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
      <polyline points="17 18 23 18 23 12" />
    </svg>
  ),
  download: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  upload: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  ),
  clock: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  ),
  check: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  x: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  search: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  filter: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  ),
  spark: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  lock: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  bank: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M3 22h18" />
      <path d="M6 18V11" />
      <path d="M10 18V11" />
      <path d="M14 18V11" />
      <path d="M18 18V11" />
      <path d="M12 2L2 8h20L12 2z" />
    </svg>
  ),
  zap: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  ),
  arrowUp: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  ),
  arrowDown: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <polyline points="19 12 12 19 5 12" />
    </svg>
  ),
  copy: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  calendar: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  shield: (s) => (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden="true"
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
  pix: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d="M17.7 14.3l-3-3c-.4-.4-1-.4-1.4 0l-2.6 2.6c-.4.4-1 .4-1.4 0l-3-3c-.4-.4-.4-1 0-1.4l3-3c.4-.4.4-1 0-1.4l-3-3c-.4-.4-1-.4-1.4 0l-3 3c-.4.4-.4 1 0 1.4l3 3c.4.4.4 1 0 1.4l-3 3c-.4.4-.4 1 0 1.4l3 3c.4.4 1 .4 1.4 0l3-3c.4-.4 1-.4 1.4 0l3 3c.4.4 1 .4 1.4 0l3-3c.4-.4.4-1 0-1.4z"
        opacity=".6"
      />
    </svg>
  ),
};

interface RawBankAccount {
  id: string;
  bankName?: string;
  bank?: string;
  name?: string;
  displayAccount?: string;
  account?: string;
  pixKey?: string;
  accountType?: string;
  bankCode?: string;
  agency?: string;
  isDefault?: boolean;
}

interface WithdrawalItem {
  id: string;
  amount: number;
  status: string;
  date: string;
  method?: string;
  account?: string;
  bank?: string;
  description?: string;
  requested?: string;
  createdAt?: string;
  completed?: string;
  [key: string]: unknown;
}

interface AnticipationItem {
  id: string;
  amount: number;
  netAmount?: number;
  net?: number;
  fee?: number;
  feeAmount?: number;
  feePct?: number;
  feePercent?: number;
  original?: number;
  originalAmount?: number;
  status: string;
  createdAt?: string;
  date?: string;
  method?: string;
  installments?: number;
  [key: string]: unknown;
}

interface RawTransaction {
  id: string;
  type?: string;
  description?: string;
  desc?: string;
  amount: number;
  status?: string;
  method?: string;
  createdAt: string;
  fee?: number;
}

/* ═══ DEFAULT (EMPTY) DATA ═══ */
const BALANCE = { available: 0, pending: 0, blocked: 0, total: 0 };
const TRANSACTIONS: {
  id: string;
  type: string;
  desc: string;
  amount: number;
  status: string;
  method: string;
  date: string;
  time: string;
  fee: number;
}[] = [];
const _WITHDRAWALS: Array<{ id: string; amount: number; status: string; date: string }> = [];
const _ANTICIPATIONS: Array<{ id: string; amount: number; status: string; date: string }> = [];

/* ═══ HELPERS ═══ */
const TYPE_CONFIG: Record<
  string,
  { label: string; color: string; icon: (s: number) => React.ReactElement; sign: string }
> = {
  sale: { label: 'Venda', color: '#E85D30', icon: IC.arrowDown, sign: '+' },
  commission: { label: 'Comissão', color: '#10B981', icon: IC.arrowDown, sign: '+' },
  withdrawal: { label: 'Saque', color: 'var(--app-text-secondary)', icon: IC.arrowUp, sign: '' },
  refund: { label: 'Reembolso', color: '#EF4444', icon: IC.arrowUp, sign: '' },
  anticipation: { label: 'Antecipação', color: '#3B82F6', icon: IC.spark, sign: '+' },
};
const STATUS_COLOR: Record<string, string> = {
  completed: '#E85D30',
  pending: '#F59E0B',
  processing: '#3B82F6',
  failed: '#EF4444',
};
const STATUS_LABEL: Record<string, string> = {
  completed: 'Concluido',
  pending: 'Pendente',
  processing: 'Processando',
  failed: 'Falhou',
};

function Fmt(v: number) {
  return Math.abs(v).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/* ═══ EXTRACTED COMPONENTS ═══ */

type BalanceData = { available: number; pending: number; blocked: number; total: number };
type TransactionItem = {
  id: string;
  type: string;
  desc: string;
  amount: number;
  status: string;
  method: string;
  date: string;
  time: string;
  fee: number;
};

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

  const bankAccounts = (rawAccounts as unknown as RawBankAccount[]).map((a) => ({
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
            Solicitar saque
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
              Disponivel para saque
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 24,
                fontWeight: 700,
                color: '#E85D30',
              }}
            >
              R$ {Fmt(available)}
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
              Valor do saque
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
                R$
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
              Conta destino
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
                    Nenhuma conta cadastrada. Cadastre em{' '}
                    <strong>Configuracoes &gt; Dados bancarios</strong>.
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
                        border: `2px solid ${selectedBank === i ? '#E85D30' : 'var(--app-text-placeholder)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {selectedBank === i && (
                        <div
                          style={{ width: 8, height: 8, borderRadius: 2, background: '#E85D30' }}
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
            <span style={{ color: '#3B82F6', display: 'flex' }}>{IC.shield(14)}</span>
            <span style={{ fontSize: 11, color: 'var(--app-text-secondary)' }}>
              Saques via PIX sao processados em ate 2 minutos. TED em ate 1 dia util.
            </span>
          </div>
          <button
            type="button"
            onClick={handleWithdraw}
            disabled={withdrawLoading}
            style={{
              width: '100%',
              padding: '14px 24px',
              background: withdrawLoading ? 'var(--app-bg-secondary)' : '#E85D30',
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
              <span style={{ fontSize: 12, color: '#EF4444' }}>{withdrawError}</span>
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
            Antecipar recebiveis
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
              Disponivel para antecipacao
            </span>
            <span
              style={{
                fontFamily: "'JetBrains Mono',monospace",
                fontSize: 24,
                fontWeight: 700,
                color: 'var(--app-text-primary)',
              }}
            >
              R$ {Fmt(pending)}
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
            <span style={{ color: '#F59E0B', display: 'flex' }}>{IC.clock(16)}</span>
            <span style={{ fontSize: 12, color: 'var(--app-text-secondary)', lineHeight: 1.5 }}>
              Antecipacao em breve — estamos ativando este recurso. Acompanhe suas antecipacoes
              existentes na aba Antecipacoes.
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
            title="Antecipacao em breve — estamos ativando este recurso"
          >
            Antecipar agora
          </button>
        </div>
      </div>
    </div>
  );
}

/* --- TabSaldo --- */
function TabSaldo({
  bal,
  revenueChart,
  txList,
  onOpenWithdraw,
  onOpenAntecipate,
  onNavigateExtrato,
}: {
  bal: BalanceData;
  revenueChart: number[];
  txList: TransactionItem[];
  onOpenWithdraw: () => void;
  onOpenAntecipate: () => void;
  onNavigateExtrato: () => void;
}) {
  const { isMobile } = useResponsiveViewport();
  const revenueWeek = revenueChart.length > 0 ? revenueChart : [0, 0, 0, 0, 0, 0, 0];
  const hasRevenue = revenueWeek.some((v: number) => v > 0);
  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 1fr 1fr',
          gap: 12,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 24,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              height: 2,
              background: '#E85D30',
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--app-text-secondary)',
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              display: 'block',
              marginBottom: 8,
            }}
          >
            Saldo disponivel
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 32,
              fontWeight: 700,
              color: '#E85D30',
              display: 'block',
              marginBottom: 4,
            }}
          >
            R$ {Fmt(bal.available)}
          </span>
          <span style={{ fontSize: 11, color: 'var(--app-text-tertiary)' }}>Pronto para saque</span>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              type="button"
              onClick={onOpenWithdraw}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: '#E85D30',
                color: 'var(--app-text-on-accent)',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: "'Sora',sans-serif",
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {IC.upload(12)} Sacar
            </button>
            <button
              type="button"
              onClick={onOpenAntecipate}
              style={{
                flex: 1,
                padding: '10px 16px',
                background: 'none',
                border: '1px solid var(--app-border-primary)',
                borderRadius: 6,
                color: 'var(--app-text-secondary)',
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: "'Sora',sans-serif",
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              {IC.spark(12)} Antecipar
            </button>
          </div>
        </div>
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 18,
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
            A receber
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 22,
              fontWeight: 600,
              color: '#F59E0B',
            }}
          >
            R$ {Fmt(bal.pending)}
          </span>
          <span
            style={{
              fontSize: 11,
              color: 'var(--app-text-tertiary)',
              display: 'block',
              marginTop: 4,
            }}
          >
            Aguardando liberacao
          </span>
        </div>
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 18,
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
            Bloqueado
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 22,
              fontWeight: 600,
              color: 'var(--app-text-tertiary)',
            }}
          >
            R$ {Fmt(bal.blocked)}
          </span>
          <span
            style={{
              fontSize: 11,
              color: 'var(--app-text-tertiary)',
              display: 'block',
              marginTop: 4,
            }}
          >
            Em garantia
          </span>
        </div>
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 18,
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
            Total acumulado
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 22,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
            }}
          >
            R$ {Fmt(bal.total)}
          </span>
          <span
            style={{
              fontSize: 11,
              color: 'var(--app-text-tertiary)',
              display: 'block',
              marginTop: 4,
            }}
          >
            Todas as origens
          </span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 20,
            position: 'relative',
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              display: 'block',
              marginBottom: 16,
            }}
          >
            Receita — Ultimos 7 dias
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 6,
              height: 100,
              position: 'relative',
            }}
          >
            {hasRevenue ? (
              revenueWeek.map((v, i) => {
                const dayKeys = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
                const max = Math.max(...revenueWeek);
                return (
                  <div
                    key={`rev-bar-${dayKeys[i]}`}
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono',monospace",
                        fontSize: 8,
                        color: 'var(--app-text-tertiary)',
                      }}
                    >
                      {(v / 1000).toFixed(1)}k
                    </span>
                    <div
                      style={{
                        width: '100%',
                        height: `${(v / max) * 70}px`,
                        background: i === revenueWeek.length - 1 ? '#E85D30' : '#E85D3040',
                        borderRadius: '3px 3px 0 0',
                      }}
                    />
                  </div>
                );
              })
            ) : (
              <>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 1,
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--app-text-tertiary)',
                      fontFamily: "'Sora',sans-serif",
                    }}
                  >
                    Nenhuma receita ainda
                  </span>
                </div>
                {revenueWeek.map((_, i) => {
                  const dayKeys = ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'];
                  return (
                    <div
                      key={`empty-bar-${dayKeys[i]}`}
                      style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          width: '100%',
                          height: 2,
                          background: 'var(--app-bg-secondary)',
                          borderRadius: '3px 3px 0 0',
                        }}
                      />
                    </div>
                  );
                })}
              </>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'].map((d) => (
              <span
                key={d}
                style={{
                  fontFamily: "'JetBrains Mono',monospace",
                  fontSize: 9,
                  color: 'var(--app-text-tertiary)',
                  flex: 1,
                  textAlign: 'center',
                }}
              >
                {d}
              </span>
            ))}
          </div>
        </div>
        <div
          style={{
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: 20,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
              display: 'block',
              marginBottom: 14,
            }}
          >
            Ultimas transacoes
          </span>
          {txList.length === 0 ? (
            <div style={{ padding: '24px 0', textAlign: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>
                Nenhuma transacao encontrada
              </span>
            </div>
          ) : (
            txList.slice(0, 5).map((t, i) => {
              const cfg = TYPE_CONFIG[t.type] || TYPE_CONFIG.sale;
              return (
                <div
                  key={t.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 0',
                    borderBottom: i < 4 ? '1px solid var(--app-border-subtle)' : 'none',
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background: `${cfg.color}12`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: cfg.color,
                      flexShrink: 0,
                    }}
                  >
                    {cfg.icon(12)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--app-text-primary)',
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t.desc}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                      {t.date} {t.time}
                    </span>
                  </div>
                  <span
                    style={{
                      fontFamily: "'JetBrains Mono',monospace",
                      fontSize: 13,
                      fontWeight: 600,
                      color: t.amount > 0 ? cfg.color : 'var(--app-text-secondary)',
                    }}
                  >
                    {t.amount > 0 ? '+' : ''}R$ {Fmt(t.amount)}
                  </span>
                </div>
              );
            })
          )}
          <button
            type="button"
            onClick={onNavigateExtrato}
            style={{
              width: '100%',
              marginTop: 10,
              padding: '8px 14px',
              background: 'none',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              color: 'var(--app-text-secondary)',
              fontSize: 11,
              cursor: 'pointer',
              fontFamily: "'Sora',sans-serif",
            }}
          >
            Ver extrato completo
          </button>
        </div>
      </div>
    </>
  );
}

/* --- TabExtrato --- */
function TabExtrato({
  txList,
  filterType,
  onFilterTypeChange,
  search,
  onSearchChange,
}: {
  txList: TransactionItem[];
  filterType: string;
  onFilterTypeChange: (v: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
}) {
  const { isMobile } = useResponsiveViewport();
  const filtered = txList.filter((t) => {
    if (filterType !== 'todos' && t.type !== filterType) {
      return false;
    }
    if (search && !t.desc.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });
  return (
    <>
      <div
        style={{
          display: 'flex',
          gap: 8,
          marginBottom: 16,
          flexDirection: isMobile ? 'column' : 'row',
          alignItems: isMobile ? 'stretch' : 'center',
        }}
      >
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--app-bg-card)',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            padding: '8px 14px',
          }}
        >
          <span style={{ color: 'var(--app-text-tertiary)' }}>{IC.search(14)}</span>
          <input
            aria-label="Buscar transacao"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar transacao..."
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              color: 'var(--app-text-primary)',
              fontSize: 12,
              fontFamily: "'Sora',sans-serif",
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['todos', 'sale', 'commission', 'withdrawal', 'refund', 'anticipation'].map((f) => (
            <button
              type="button"
              key={f}
              onClick={() => onFilterTypeChange(f)}
              style={{
                padding: '7px 12px',
                background: filterType === f ? 'var(--app-bg-card)' : '#E85D30',
                border: '1px solid #E85D30',
                borderRadius: 6,
                color: filterType === f ? '#E85D30' : 'var(--app-text-on-accent)',
                fontSize: 10,
                fontWeight: 600,
                cursor: 'pointer',
                fontFamily: "'Sora',sans-serif",
              }}
            >
              {f === 'todos' ? 'Todos' : TYPE_CONFIG[f]?.label || f}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            if (!filtered.length) {
              return;
            }
            const escape = (v: unknown) => {
              const s = String(v ?? '');
              return `"${s.replace(PATTERN_RE, '""')}"`;
            };
            const rows = filtered.map((t) => ({
              id: t.id,
              tipo: TYPE_CONFIG[t.type]?.label || t.type,
              descricao: t.desc,
              valor: t.amount,
              status: STATUS_LABEL[t.status] || t.status,
              metodo: t.method,
              data: t.date,
              hora: t.time,
              taxa: t.fee,
            }));
            const headers = Object.keys(rows[0]);
            const csv = [
              headers.join(';'),
              ...rows.map((r) =>
                headers.map((h) => escape((r as Record<string, unknown>)[h])).join(';'),
              ),
            ].join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `carteira-extrato-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }}
          style={{
            padding: '7px 12px',
            background: 'none',
            border: '1px solid var(--app-border-primary)',
            borderRadius: 6,
            color: 'var(--app-text-secondary)',
            fontSize: 10,
            cursor: 'pointer',
            fontFamily: "'Sora',sans-serif",
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {IC.download(10)} CSV
        </button>
      </div>
      <div
        style={{
          background: 'var(--app-bg-card)',
          border: '1px solid var(--app-border-primary)',
          borderRadius: 6,
          overflow: 'hidden',
        }}
      >
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 0', textAlign: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--app-text-tertiary)' }}>
              Nenhuma transacao encontrada
            </span>
          </div>
        ) : (
          filtered.map((t, i) => {
            const cfg = TYPE_CONFIG[t.type] || TYPE_CONFIG.sale;
            return (
              <div
                key={t.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : '36px 2fr 0.8fr 0.6fr 1fr 0.6fr',
                  gap: 12,
                  padding: '12px 16px',
                  borderBottom:
                    i < filtered.length - 1 ? '1px solid var(--app-border-subtle)' : 'none',
                  alignItems: 'center',
                  transition: 'background .1s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'var(--app-bg-hover)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'none';
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: `${cfg.color}12`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: cfg.color,
                  }}
                >
                  {cfg.icon(14)}
                </div>
                <div>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      color: 'var(--app-text-primary)',
                      display: 'block',
                    }}
                  >
                    {t.desc}
                  </span>
                  {t.fee > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                      Taxa: R$ {Fmt(t.fee)}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: cfg.color,
                    background: `${cfg.color}12`,
                    padding: '3px 8px',
                    borderRadius: 4,
                    textTransform: 'uppercase',
                    fontFamily: "'JetBrains Mono',monospace",
                    textAlign: isMobile ? 'left' : 'center',
                    justifySelf: isMobile ? 'flex-start' : undefined,
                  }}
                >
                  {cfg.label}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    color: STATUS_COLOR[t.status],
                    fontFamily: "'JetBrains Mono',monospace",
                  }}
                >
                  {STATUS_LABEL[t.status]}
                </span>
                <span
                  style={{
                    fontFamily: "'JetBrains Mono',monospace",
                    fontSize: 14,
                    fontWeight: 600,
                    color: t.amount > 0 ? cfg.color : 'var(--app-text-secondary)',
                  }}
                >
                  {t.amount > 0 ? '+' : ''}R$ {Fmt(t.amount)}
                </span>
                <span style={{ fontSize: 10, color: 'var(--app-text-tertiary)' }}>
                  {t.date}
                  <br />
                  {t.time}
                </span>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

/* --- TabSaques --- */
function TabSaques({
  available,
  onOpenWithdraw,
  withdrawals,
}: {
  available: number;
  onOpenWithdraw: () => void;
  withdrawals: Array<{
    id: string;
    amount: number;
    status: string;
    date: string;
    method?: string;
    account?: string;
  }>;
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
      await addBankAccount({ ...addForm });
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
            Disponivel
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 20,
              fontWeight: 700,
              color: '#E85D30',
            }}
          >
            R$ {Fmt(available)}
          </span>
        </div>
        <button
          type="button"
          onClick={onOpenWithdraw}
          style={{
            padding: '10px 24px',
            background: '#E85D30',
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
          {IC.upload(14)} Novo saque
        </button>
      </div>

      {/* Bank accounts section */}
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
            Contas cadastradas
          </span>
          <button
            type="button"
            onClick={() => setShowAddAccount(!showAddAccount)}
            style={{
              padding: '6px 14px',
              background: showAddAccount ? 'var(--app-bg-secondary)' : 'var(--app-accent-light)',
              border: `1px solid ${showAddAccount ? 'var(--app-border-primary)' : 'var(--app-accent-medium)'}`,
              borderRadius: 6,
              color: showAddAccount ? 'var(--app-text-secondary)' : '#E85D30',
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
          <div
            style={{
              background: 'var(--app-bg-primary)',
              border: '1px solid var(--app-border-primary)',
              borderRadius: 6,
              padding: 16,
              marginBottom: 14,
            }}
          >
            <div
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}
            >
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--app-text-secondary)',
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-banco`}
                >
                  Banco
                </label>
                <input
                  aria-label="Banco"
                  value={addForm.bankName}
                  onChange={(e) => setAddForm((f) => ({ ...f, bankName: e.target.value }))}
                  placeholder="Ex: Nubank"
                  style={{
                    width: '100%',
                    background: 'var(--app-bg-card)',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 12,
                    fontFamily: "'Sora',sans-serif",
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  id={`${fid}-banco`}
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--app-text-secondary)',
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-chave-pix`}
                >
                  Chave PIX
                </label>
                <input
                  aria-label="Chave PIX"
                  value={addForm.pixKey}
                  onChange={(e) => setAddForm((f) => ({ ...f, pixKey: e.target.value }))}
                  placeholder="CPF, email, telefone ou aleatoria"
                  style={{
                    width: '100%',
                    background: 'var(--app-bg-card)',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 12,
                    fontFamily: "'Sora',sans-serif",
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  id={`${fid}-chave-pix`}
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--app-text-secondary)',
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-agencia`}
                >
                  Agencia
                </label>
                <input
                  aria-label="Agencia"
                  value={addForm.agency}
                  onChange={(e) => setAddForm((f) => ({ ...f, agency: e.target.value }))}
                  placeholder="0001"
                  style={{
                    width: '100%',
                    background: 'var(--app-bg-card)',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono',monospace",
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  id={`${fid}-agencia`}
                />
              </div>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: 10,
                    fontWeight: 600,
                    color: 'var(--app-text-secondary)',
                    letterSpacing: '.06em',
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                  htmlFor={`${fid}-conta`}
                >
                  Conta
                </label>
                <input
                  aria-label="Conta bancaria"
                  value={addForm.account}
                  onChange={(e) => setAddForm((f) => ({ ...f, account: e.target.value }))}
                  placeholder="12345-6"
                  style={{
                    width: '100%',
                    background: 'var(--app-bg-card)',
                    border: '1px solid var(--app-border-primary)',
                    borderRadius: 6,
                    padding: '8px 12px',
                    color: 'var(--app-text-primary)',
                    fontSize: 12,
                    fontFamily: "'JetBrains Mono',monospace",
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  id={`${fid}-conta`}
                />
              </div>
            </div>
            {addError && (
              <div
                style={{
                  marginBottom: 10,
                  padding: '7px 12px',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.2)',
                  borderRadius: 6,
                }}
              >
                <span style={{ fontSize: 11, color: '#EF4444' }}>{addError}</span>
              </div>
            )}
            <button
              type="button"
              onClick={handleAddAccount}
              disabled={addLoading}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: addLoading ? 'var(--app-bg-secondary)' : '#E85D30',
                color: addLoading ? 'var(--app-text-secondary)' : 'var(--app-text-on-accent)',
                border: 'none',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: addLoading ? 'default' : 'pointer',
                fontFamily: "'Sora',sans-serif",
              }}
            >
              {addLoading ? 'Salvando...' : 'Salvar conta'}
            </button>
          </div>
        )}
        {accounts.length === 0 ? (
          <div style={{ padding: '20px 0', textAlign: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--app-text-tertiary)' }}>
              Nenhuma conta cadastrada. Adicione uma conta para fazer saques.
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
                <span style={{ color: '#E85D30', display: 'flex' }}>{IC.bank(16)}</span>
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
                      color: '#E85D30',
                      background: 'rgba(232,93,48,0.1)',
                      padding: '2px 6px',
                      borderRadius: 4,
                      textTransform: 'uppercase',
                      letterSpacing: '.06em',
                    }}
                  >
                    Padrao
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeBankAccount(a.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--app-text-tertiary)',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  title="Remover conta"
                >
                  {IC.x(12)}
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
              Nenhum saque realizado
            </span>
          </div>
        ) : (
          withdrawals.map((w: WithdrawalItem, i: number, arr: WithdrawalItem[]) => (
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
                R$ {Fmt(Math.abs(w.amount))}
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
                    Concluido: {w.completed}
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
            Antecipavel agora
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 20,
              fontWeight: 600,
              color: '#E85D30',
            }}
          >
            R$ {Fmt(pending)}
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
            Total antecipado
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 20,
              fontWeight: 600,
              color: 'var(--app-text-primary)',
            }}
          >
            R$ {Fmt(totalAnticipated)}
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
            Taxas pagas
          </span>
          <span
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontSize: 20,
              fontWeight: 600,
              color: 'var(--app-text-secondary)',
            }}
          >
            R$ {Fmt(totalFees)}
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
              background: '#E85D30',
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
            {IC.spark(14)} Antecipar agora
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
              Nenhuma antecipacao realizada
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
                R$ {Fmt(a.original || a.originalAmount || 0)}
              </span>
              <span
                style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#EF4444' }}
              >
                - R$ {Fmt(a.fee || a.feeAmount || 0)}
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
                  color: '#E85D30',
                }}
              >
                R$ {Fmt(a.net || a.netAmount || 0)}
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
      : BALANCE;

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
      : TRANSACTIONS;

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
      <style>{`::selection{background:rgba(232,93,48,0.3)} input::placeholder{color:var(--app-text-placeholder)!important} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:var(--app-border-primary);border-radius:2px}`}</style>

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

      <style>{`@keyframes kloel-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>

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
          <TabSaldo
            bal={bal}
            revenueChart={realChart}
            txList={txList}
            onOpenWithdraw={() => setShowWithdrawModal(true)}
            onOpenAntecipate={() => setShowAntecipateModal(true)}
            onNavigateExtrato={() => handleTabChange('extrato')}
          />
        )}
        {tab === 'extrato' && (
          <TabExtrato
            txList={txList}
            filterType={filterType}
            onFilterTypeChange={setFilterType}
            search={search}
            onSearchChange={setSearch}
          />
        )}
        {tab === 'saques' && (
          <TabSaques
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
