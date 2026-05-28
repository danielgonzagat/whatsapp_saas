// @@index: barrel re-export — the actual implementation lives in the
// `wallet.helpers.*.ts` siblings split out for Gate-fix2-C (max 400 LOC).
// The public surface is unchanged; callers keep importing from
// `./wallet.helpers`.

export {
  ConcurrentWalletUpdateError,
  KloelWalletNotFoundError,
} from './wallet.helpers.errors';

export {
  toSafeCents,
  calculateSaleSplit,
  calculateAnticipationSplit,
  isValidMonetaryAmount,
} from './wallet.helpers.cents';
export type { SaleSplit, AnticipationSplit } from './wallet.helpers.cents';

export {
  buildInsufficientBalanceMessage,
  buildWithdrawalDescription,
  buildAnticipationDescription,
  buildSaleTransactionMetadata,
  buildAnticipationTransactionMetadata,
  buildSaleSplitLogMessage,
  buildSaleLedgerMetadata,
} from './wallet.helpers.descriptions';

export {
  buildProcessSaleResponse,
  buildWithdrawalSuccessResponse,
  buildInvalidMonetaryAmountResponse,
  buildInsufficientBalanceFailureResponse,
  buildAnticipationSuccessResponse,
  buildWalletAnticipationRowData,
} from './wallet.helpers.responses';
export type {
  ProcessSaleResponse,
  WithdrawalSuccessResponse,
  MonetaryRequestFailureResponse,
  AnticipationSuccessResponse,
} from './wallet.helpers.responses';

export {
  uniqueWalletIds,
  buildWalletIndex,
  buildReconciliationSettledLogMessage,
  buildReconciliationStartLogMessage,
  buildConfirmPaymentNoopLogMessage,
  buildReconciliationFailedLogMessage,
} from './wallet.helpers.reconciliation';
