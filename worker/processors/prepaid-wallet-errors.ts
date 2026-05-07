/**
 * Worker-side error types for prepaid wallet settlement.
 *
 * Extracted to a sibling module so the settlement processor only declares a
 * single class per file (TSLint max-classes-per-file). The errors are
 * idempotency-safe sentinels: callers may compare via `instanceof` to decide
 * whether to retry, surface to the user, or fail the BullMQ job permanently.
 */

/** Thrown when a prepaid wallet cannot be located for the given workspace. */
export class WorkerWalletNotFoundError extends Error {
  /** Workspace identifier for which no prepaid wallet was found. */
  public readonly workspaceId: string;

  /**
   * @param workspaceId - Workspace whose prepaid wallet could not be located.
   */
  constructor(workspaceId: string) {
    super(`PrepaidWallet not found for workspace ${workspaceId}`);
    this.workspaceId = workspaceId;
    this.name = 'WorkerWalletNotFoundError';
  }
}

/**
 * Thrown when a wallet balance is too low to absorb a positive settlement
 * shortfall. The error is non-retryable: the caller must compensate via a
 * separate top-up or by recording an explicit ledger negative-balance entry.
 */
export class WorkerInsufficientWalletBalanceError extends Error {
  /** Wallet identifier whose balance is insufficient. */
  public readonly walletId: string;

  /** Cents required by the settlement attempt. */
  public readonly requestedCents: bigint;

  /** Cents currently available on the wallet. */
  public readonly currentCents: bigint;

  /**
   * @param walletId - Wallet identifier whose balance is insufficient.
   * @param requestedCents - Cents required by the settlement attempt.
   * @param currentCents - Cents currently available on the wallet.
   */
  constructor(walletId: string, requestedCents: bigint, currentCents: bigint) {
    super(
      `Insufficient prepaid wallet balance on ${walletId}: requested ${requestedCents.toString()}, have ${currentCents.toString()}.`,
    );
    this.walletId = walletId;
    this.requestedCents = requestedCents;
    this.currentCents = currentCents;
    this.name = 'WorkerInsufficientWalletBalanceError';
  }
}
