import { apiFetch } from './core';

export interface WalletBalance {
  /** Available property. */
  available: number;
  /** Pending property. */
  pending: number;
  /** Blocked property. */
  blocked: number;
  /** Total property. */
  total: number;
  /** Formatted available property. */
  formattedAvailable: string;
  /** Formatted pending property. */
  formattedPending: string;
  /** Formatted total property. */
  formattedTotal: string;
}

/** Wallet transaction shape. */
export interface WalletTransaction {
  /** Id property. */
  id: string;
  /** Type property. */
  type: 'sale' | 'withdrawal' | 'refund' | 'fee';
  /** Amount property. */
  amount: number;
  /** Gross amount property. */
  grossAmount?: number;
  /** Gateway fee property. */
  gatewayFee?: number;
  /** Kloel fee property. */
  kloelFee?: number;
  /** Net amount property. */
  netAmount?: number;
  /** Status property. */
  status: 'pending' | 'confirmed' | 'failed';
  /** Description property. */
  description?: string;
  /** Created at property. */
  createdAt: string;
}

type WalletApiEnvelope<T> = {
  data?: T;
  error?: string;
  status?: number;
};

interface WalletTransactionsResponse {
  transactions?: WalletTransaction[];
}

function confirmWalletPayload<T>(
  response: WalletApiEnvelope<T>,
  fallbackMessage: string,
  missingPayloadMessage: string,
): T {
  if (response.error) {
    throw new Error(response.error);
  }
  if (typeof response.status === 'number' && response.status >= 400) {
    throw new Error(fallbackMessage);
  }
  if (response.data === undefined || response.data === null) {
    throw new Error(missingPayloadMessage);
  }
  return response.data;
}

export async function getWalletBalance(workspaceId: string): Promise<WalletBalance> {
  const res = await apiFetch<WalletBalance>(
    `/kloel/wallet/${encodeURIComponent(workspaceId)}/balance`,
  );
  return confirmWalletPayload(
    res,
    'Failed to load wallet balance',
    'Wallet balance did not return a confirmed payload',
  );
}

/** Get wallet transactions. */
export async function getWalletTransactions(workspaceId: string): Promise<WalletTransaction[]> {
  const res = await apiFetch<WalletTransaction[] | WalletTransactionsResponse>(
    `/kloel/wallet/${encodeURIComponent(workspaceId)}/transactions`,
  );
  const data = confirmWalletPayload(
    res,
    'Failed to load wallet transactions',
    'Wallet transactions did not return a confirmed payload',
  );
  if (Array.isArray(data)) {
    return data;
  }
  if (Array.isArray(data.transactions)) {
    return data.transactions;
  }
  throw new Error('Wallet transactions did not return a confirmed payload');
}

/** Process sale. */
export async function processSale(
  workspaceId: string,
  data: { amount: number; saleId: string; description: string; kloelFeePercent?: number },
): Promise<unknown> {
  const res = await apiFetch<unknown>(
    `/kloel/wallet/${encodeURIComponent(workspaceId)}/process-sale`,
    {
      method: 'POST',
      body: data,
    },
  );
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data;
}

/** Request withdrawal. */
export async function requestWithdrawal(
  workspaceId: string,
  amount: number,
  bankAccount: string,
): Promise<unknown> {
  const res = await apiFetch<unknown>(`/kloel/wallet/${encodeURIComponent(workspaceId)}/withdraw`, {
    method: 'POST',
    body: { amount, bankAccount },
  });
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data;
}

/** Confirm transaction. */
export async function confirmTransaction(
  workspaceId: string,
  transactionId: string,
): Promise<unknown> {
  const res = await apiFetch<unknown>(
    `/kloel/wallet/${encodeURIComponent(workspaceId)}/confirm/${encodeURIComponent(transactionId)}`,
    {
      method: 'POST',
    },
  );
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data;
}
