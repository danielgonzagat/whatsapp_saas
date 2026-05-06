/*
  KLOEL — CARTEIRA / TYPES
  Tipos e interfaces compartilhados entre as partes da carteira.
*/

export interface RawBankAccount {
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

export interface WithdrawalItem {
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

export interface AnticipationItem {
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

export interface RawTransaction {
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

export type BalanceData = {
  available: number;
  pending: number;
  blocked: number;
  total: number;
};

export type TransactionItem = {
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
