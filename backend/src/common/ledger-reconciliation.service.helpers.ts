import type { DriftKind, DriftReport } from './ledger-reconciliation.types';

/**
 * Pure helpers extracted from LedgerReconciliationService (Claude-w103).
 *
 * Money-path discipline:
 *   * BigInt cents stay BigInt — never coerced to Number.
 *   * Ledger is append-only — these helpers never mutate, persist, or
 *     "repair" anything; they only project read inputs into shapes the
 *     service can log or push into a drift report.
 *
 * Everything in this module is a deterministic, side-effect-free
 * function. The service owns I/O (Prisma, logger, audit log), the
 * helpers own the algebra.
 */

/** Terminal CheckoutOrder statuses that imply payment must be confirmed. */
export const ORDER_TERMINAL_STATUSES = ['PAID', 'SHIPPED', 'DELIVERED'] as const;

/** Terminal CheckoutPayment statuses that satisfy the order terminal contract. */
export const PAYMENT_TERMINAL_STATUSES = ['CONFIRMED', 'RECEIVED', 'APPROVED', 'PAID'] as const;

/** Wallet buckets reconciled by `runWalletReconciliation`. */
export const WALLET_BUCKETS = ['available', 'pending', 'blocked'] as const;

/** A single wallet bucket name. */
export type WalletBucket = (typeof WALLET_BUCKETS)[number];

/** JSON-encode a payload deterministically for structured log lines. */
export function toLogJson(payload: unknown): string {
  return JSON.stringify(payload);
}

/** True when the CheckoutOrder.status is one of the terminal "paid" states. */
export function isOrderTerminalStatus(status: string | null | undefined): boolean {
  return ORDER_TERMINAL_STATUSES.includes(
    String(status || '').toUpperCase() as (typeof ORDER_TERMINAL_STATUSES)[number],
  );
}

/** True when the CheckoutPayment.status is one of the terminal "confirmed" states. */
export function isPaymentTerminalStatus(status: string | null | undefined): boolean {
  return PAYMENT_TERMINAL_STATUSES.includes(
    String(status || '').toUpperCase() as (typeof PAYMENT_TERMINAL_STATUSES)[number],
  );
}

/** Count drift records by their `kind` discriminator. */
export function countDriftsByKind(drifts: DriftReport[]): Record<DriftKind, number> {
  return drifts.reduce<Record<string, number>>((acc, drift) => {
    acc[drift.kind] = (acc[drift.kind] || 0) + 1;
    return acc;
  }, {}) as Record<DriftKind, number>;
}

/** Compact summary the service emits via `logger.warn` for checkout drift. */
export interface CheckoutDriftSummary {
  /** Number of orders scanned. */
  scannedOrders: number;
  /** Number of drift records found. */
  driftCount: number;
  /** Drift counts broken down by kind. */
  kinds: Record<DriftKind, number>;
}

/** Build the structured summary used for the `ledger_drift_detected` warn line. */
export function buildCheckoutDriftSummary(
  scannedOrders: number,
  drifts: DriftReport[],
): CheckoutDriftSummary {
  return {
    scannedOrders,
    driftCount: drifts.length,
    kinds: countDriftsByKind(drifts),
  };
}

/** Compact wallet drift summary for `wallet_ledger_drift_detected`. */
export interface WalletDriftSummary {
  /** Number of wallets scanned. */
  scannedWallets: number;
  /** Number of drift records found. */
  driftCount: number;
}

/** Build the structured summary used for the `wallet_ledger_drift_detected` warn line. */
export function buildWalletDriftSummary(
  scannedWallets: number,
  drifts: DriftReport[],
): WalletDriftSummary {
  return {
    scannedWallets,
    driftCount: drifts.length,
  };
}

/** Per-drift detail shape logged for searchability under `ledger_drift`. */
export interface CheckoutDriftLogEntry {
  /** Order id property. */
  orderId: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Kind property. */
  kind: DriftKind;
  /** Details property. */
  details: Record<string, unknown>;
}

/** Project a checkout drift into the shape logged per line. */
export function formatCheckoutDriftLogEntry(drift: DriftReport): CheckoutDriftLogEntry {
  return {
    orderId: drift.orderId,
    workspaceId: drift.workspaceId,
    kind: drift.kind,
    details: drift.details,
  };
}

/** Per-drift detail shape logged under `wallet_ledger_drift`. */
export interface WalletDriftLogEntry {
  /** Workspace id property. */
  workspaceId: string;
  /** Wallet id (sourced from DriftReport.orderId — see service note). */
  walletId: string;
  /** Kind property. */
  kind: DriftKind;
  /** Details property. */
  details: Record<string, unknown>;
}

/** Project a wallet drift into the shape logged per line. */
export function formatWalletDriftLogEntry(drift: DriftReport): WalletDriftLogEntry {
  return {
    workspaceId: drift.workspaceId,
    walletId: drift.orderId,
    kind: drift.kind,
    details: drift.details,
  };
}

/** A single row returned by Prisma `kloelWalletLedger.groupBy`. */
export interface WalletLedgerAggregateRow {
  /** Bucket the row belongs to. */
  bucket?: string;
  /** Direction (credit / debit). */
  direction?: string;
  /** Prisma `_sum` payload. */
  _sum?: { amountInCents?: string | number | bigint | null };
}

/**
 * Build a map keyed by `${bucket}:${direction}` whose value is the BigInt
 * sum of the ledger entries for that combination. Missing keys return
 * `0n` when read back via `.get(key) ?? 0n` in the caller.
 *
 * Money discipline: every value is BigInt cents. The Prisma `_sum`
 * value may arrive as string/number/bigint depending on driver version;
 * `BigInt(...)` coerces safely in every case.
 */
export function buildWalletLedgerSumMap(
  aggregates: WalletLedgerAggregateRow[],
): Map<string, bigint> {
  const sumByKey = new Map<string, bigint>();
  for (const row of aggregates) {
    const key = `${row.bucket}:${row.direction}`;
    const sum = row._sum?.amountInCents != null ? BigInt(row._sum.amountInCents) : 0n;
    sumByKey.set(key, sum);
  }
  return sumByKey;
}

/** Stored balances for a wallet, all in BigInt cents. */
export interface WalletStoredBalances {
  /** Wallet id. */
  id: string;
  /** Workspace id. */
  workspaceId: string;
  /** Available balance in cents. */
  availableBalanceInCents: bigint;
  /** Pending balance in cents. */
  pendingBalanceInCents: bigint;
  /** Blocked balance in cents. */
  blockedBalanceInCents: bigint;
}

/**
 * Compute the (credit, debit, derived) tuple for a single wallet bucket
 * given the prebuilt sum map. Money discipline: all values BigInt.
 */
export function computeBucketDerivedBalance(
  bucket: WalletBucket,
  sumByKey: Map<string, bigint>,
): { credit: bigint; debit: bigint; derived: bigint } {
  const credit = sumByKey.get(`${bucket}:credit`) ?? 0n;
  const debit = sumByKey.get(`${bucket}:debit`) ?? 0n;
  return { credit, debit, derived: credit - debit };
}

/** Look up the stored BigInt balance for a wallet bucket. */
export function readStoredBucketBalance(
  wallet: WalletStoredBalances,
  bucket: WalletBucket,
): bigint {
  const key = `${bucket}BalanceInCents` as
    | 'availableBalanceInCents'
    | 'pendingBalanceInCents'
    | 'blockedBalanceInCents';
  return BigInt(wallet[key] ?? 0);
}

/**
 * Walk every wallet bucket and emit a drift record whenever the stored
 * balance disagrees with the ledger-derived balance. Pure: no I/O.
 *
 * The wallet reconciliation reuses the DriftReport shape but populates
 * `orderId` with the walletId so existing alert routing keeps working
 * without a schema change.
 */
export function deriveWalletBucketDrifts(
  wallet: WalletStoredBalances,
  aggregates: WalletLedgerAggregateRow[],
): DriftReport[] {
  const sumByKey = buildWalletLedgerSumMap(aggregates);
  const drifts: DriftReport[] = [];

  for (const bucket of WALLET_BUCKETS) {
    const { credit, debit, derived } = computeBucketDerivedBalance(bucket, sumByKey);
    const stored = readStoredBucketBalance(wallet, bucket);

    if (derived !== stored) {
      drifts.push({
        orderId: wallet.id,
        workspaceId: wallet.workspaceId,
        kind: 'wallet_balance_ledger_mismatch',
        details: {
          walletId: wallet.id,
          bucket,
          storedInCents: stored.toString(),
          ledgerSumInCents: derived.toString(),
          creditInCents: credit.toString(),
          debitInCents: debit.toString(),
        },
      });
    }
  }

  return drifts;
}

/**
 * Stable serializer for `error` values used in cron-failure log lines.
 * Mirrors the inline `error instanceof Error ? .message : String(error)`
 * pattern so the service stays a one-liner consumer.
 */
export function describeErrorForLog(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Sample-drifts slice size used for the audit log summary. */
export const AUDIT_SUMMARY_SAMPLE_SIZE = 25;

/** Take the first `AUDIT_SUMMARY_SAMPLE_SIZE` drifts for audit summary. */
export function sampleDriftsForAudit(drifts: DriftReport[]): DriftReport[] {
  return drifts.slice(0, AUDIT_SUMMARY_SAMPLE_SIZE);
}
