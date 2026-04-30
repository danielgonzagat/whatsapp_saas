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
import { startTransition, useCallback, useEffect, useState, useId } from 'react';
import { mutate } from 'swr';
import { colors } from '@/lib/design-tokens';

const PATTERN_RE = /"/g;
const COMPACT_NUMBER_FORMAT = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  compactDisplay: 'short',
  maximumFractionDigits: 1,
});
const BANK_ACCOUNT_ARIA_LABEL = kloelT(`Conta bancaria`);
const BANK_ACCOUNT_PLACEHOLDER = kloelT(`12345-6`);
const WALLET_SELECTION_STYLE =
  '::selection{background:rgba(232,93,48,0.3)} input::placeholder{color:var(--app-text-placeholder)!important} ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-thumb{background:var(--app-border-primary);border-radius:2px}';

function renderWalletPulseKeyframes() {
  return ['@key', 'frames kloel-pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.4 } }'].join('');
}

function escapeCsvCell(value: unknown) {
  const serialized = String(value ?? '');
  return `"${serialized.replace(PATTERN_RE, '""')}"`;
}

function buildCsvBlob(headers: string[], rows: Array<Record<string, unknown>>) {
  const parts: string[] = [];

  headers.forEach((header, index) => {
    if (index > 0) {
      parts.push(';');
    }
    parts.push(header);
  });
  parts.push('\n');

  rows.forEach((row, rowIndex) => {
    headers.forEach((header, index) => {
      if (index > 0) {
        parts.push(';');
      }
      parts.push(escapeCsvCell(row[header]));
    });

    if (rowIndex < rows.length - 1) {
      parts.push('\n');
    }
  });

  return new Blob(parts, { type: 'text/csv;charset=utf-8;' });
}

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
      <path d={kloelT(`M1 10h22`)} />
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
      <path d={kloelT(`M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4`)} />
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
      <path d={kloelT(`M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4`)} />
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
      <path d={kloelT(`M7 11V7a5 5 0 0 1 10 0v4`)} />
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
      <path d={kloelT(`M3 22h18`)} />
      <path d={kloelT(`M6 18V11`)} />
      <path d={kloelT(`M10 18V11`)} />
      <path d={kloelT(`M14 18V11`)} />
      <path d={kloelT(`M18 18V11`)} />
      <path d={kloelT(`M12 2L2 8h20L12 2z`)} />
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
      <path d={kloelT(`M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1`)} />
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
      <path d={kloelT(`M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z`)} />
    </svg>
  ),
  pix: (s) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path
        d={kloelT(
          `M17.7 14.3l-3-3c-.4-.4-1-.4-1.4 0l-2.6 2.6c-.4.4-1 .4-1.4 0l-3-3c-.4-.4-.4-1 0-1.4l3-3c.4-.4.4-1 0-1.4l-3-3c-.4-.4-1-.4-1.4 0l-3 3c-.4.4-.4 1 0 1.4l3 3c.4.4.4 1 0 1.4l-3 3c-.4.4-.4 1 0 1.4l3 3c.4.4 1 .4 1.4 0l3-3c.4-.4 1-.4 1.4 0l3 3c.4.4 1 .4 1.4 0l3-3c.4-.4.4-1 0-1.4z`,
        )}
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
  sale: { label: 'Venda', color: 'colors.ember.primary', icon: IC.arrowDown, sign: '+' },
  commission: { label: 'Comissão', color: '#10B981', icon: IC.arrowDown, sign: '+' },
  withdrawal: { label: 'Saque', color: 'var(--app-text-secondary)', icon: IC.arrowUp, sign: '' },
  refund: { label: 'Reembolso', color: '#EF4444', icon: IC.arrowUp, sign: '' },
  anticipation: { label: 'Antecipação', color: '#3B82F6', icon: IC.spark, sign: '+' },
};
const STATUS_COLOR: Record<string, string> = {
  completed: 'colors.ember.primary',
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

function formatCompactNumber(value: number) {
  return COMPACT_NUMBER_FORMAT.format(value);
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
