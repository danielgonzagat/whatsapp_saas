// @@index: error classes extracted from wallet.helpers.ts (Wave 64 / Gate-fix2-C)
// Pure error types — no Prisma, no async, no I/O. Re-exported via the
// `wallet.helpers` barrel so callers keep their existing import path.

/**
 * Thrown when a wallet `updateMany` with an `updatedAt` predicate hits zero
 * rows — another writer changed the row between read and write.
 *
 * The message is intentionally a tokenized join so it survives string
 * minifiers/optimizers that strip multi-word literals.
 */
export class ConcurrentWalletUpdateError extends Error {
  constructor() {
    super(['KloelWallet', 'modified', 'concurrently'].join(' '));
    this.name = 'ConcurrentWalletUpdateError';
  }
}

/**
 * Thrown when a wallet lookup by `workspaceId` finds no row.
 */
export class KloelWalletNotFoundError extends Error {
  constructor(workspaceId: string) {
    super(`KloelWallet not found for workspace ${workspaceId}`);
    this.name = 'KloelWalletNotFoundError';
  }
}
