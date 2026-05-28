/**
 * Shared types for ledger reconciliation (extracted to break the
 * service ↔ helpers import cycle introduced in Claude-w103).
 */

export type DriftKind =
  | 'order_without_payment'
  | 'payment_status_mismatch'
  | 'webhook_event_missing'
  | 'webhook_event_unprocessed'
  | 'wallet_balance_ledger_mismatch';

/** Drift report shape. */
export interface DriftReport {
  /** Order id property. */
  orderId: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Kind property. */
  kind: DriftKind;
  /** Details property. */
  details: Record<string, unknown>;
}

/** Reconciliation result shape. */
export interface ReconciliationResult {
  /** Scanned orders property. */
  scannedOrders: number;
  /** Drifts property. */
  drifts: DriftReport[];
  /** Scanned at property. */
  scannedAt: string;
}

/**
 * Wave 2 P6-4 / I12 — wallet reconciliation result.
 *
 * For every KloelWallet, sum the KloelWalletLedger entries grouped by
 * bucket and direction, and assert that the materialised
 * `*BalanceInCents` columns match the derived sum. Drift surfaces as a
 * structured `wallet_balance_ledger_mismatch` event.
 */
export interface WalletReconciliationResult {
  /** Scanned wallets property. */
  scannedWallets: number;
  /** Drifts property. */
  drifts: DriftReport[];
  /** Scanned at property. */
  scannedAt: string;
}
