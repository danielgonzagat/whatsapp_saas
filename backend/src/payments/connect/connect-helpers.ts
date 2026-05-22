import type { ConnectLedgerEntryType } from '@prisma/client';

export const CONNECT_LEDGER_ENTRY_TYPES: ConnectLedgerEntryType[] = [
  'CREDIT_PENDING',
  'MATURE',
  'DEBIT_PAYOUT',
  'DEBIT_CHARGEBACK',
  'DEBIT_REFUND',
  'ADJUSTMENT',
];

export function parseSkip(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : undefined;
}

export function parseTake(value?: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(200, Math.max(1, Math.trunc(parsed))) : undefined;
}
