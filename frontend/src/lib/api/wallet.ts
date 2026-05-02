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

export async function getWalletBalance(workspaceId: string): Promise<WalletBalance> {
  const res = await apiFetch<WalletBalance>(
    `/kloel/wallet/${encodeURIComponent(workspaceId)}/balance`,
  );
  if (res.error) {
    throw new Error(res.error);
  }
  return res.data as WalletBalance;
}

/** Get wallet transactions. */
export async function getWalletTransactions(workspaceId: string): Promise<WalletTransaction[]> {
  const res = await apiFetch<WalletTransaction[] | { transactions: WalletTransaction[] }>(
    `/kloel/wallet/${encodeURIComponent(workspaceId)}/transactions`,
  );
  if (res.error) {
    throw new Error(res.error);
  }
  const data = res.data;
  if (Array.isArray(data)) {
    return data;
  }
  return (data as { transactions: WalletTransaction[] })?.transactions || [];
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
