'use client';

import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';

import { BRAZILIAN_BANKS as STATIC_BANKS } from '@/data/brazilian-banks';
import type { BrazilianBank } from '@/data/brazilian-banks';

// BrazilianBank type lives in @/data/brazilian-banks (canonical, where the
// data is defined). Re-export for the existing consumers that import it
// from this hook.
export type { BrazilianBank };

export const POPULAR_BANK_CODES = new Set([
  1, 33, 77, 104, 212, 237, 260, 290, 323, 336, 341, 380, 422, 748, 756,
]);

export function formatBankCode(code: number): string {
  return String(code).padStart(3, '0');
}

const FALLBACK_BANKS: BrazilianBank[] = STATIC_BANKS;

function isBrazilianBank(value: unknown): value is BrazilianBank {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.code === 'number' &&
    Number.isFinite(record.code) &&
    typeof record.name === 'string' &&
    record.name.trim().length > 0 &&
    typeof record.fullName === 'string' &&
    record.fullName.trim().length > 0 &&
    typeof record.ispb === 'string'
  );
}

function resolveBankPayload(data: BrazilianBank[] | undefined) {
  if (data === undefined) {
    return { banks: FALLBACK_BANKS, error: null };
  }
  if (!Array.isArray(data)) {
    return { banks: FALLBACK_BANKS, error: 'Lista de bancos inválida' };
  }
  if (data.length === 0) {
    return { banks: FALLBACK_BANKS, error: 'Lista de bancos vazia' };
  }
  if (!data.every(isBrazilianBank)) {
    return { banks: FALLBACK_BANKS, error: 'Lista de bancos inválida' };
  }
  return { banks: data, error: null };
}

export function useBrazilianBanks() {
  const { data, error, isLoading } = useSWR<BrazilianBank[]>(
    '/kyc/banks',
    swrFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 300000,
    },
  );

  const resolved = resolveBankPayload(data);
  const apiError = error ? (error as Error).message : resolved.error;

  return { banks: resolved.banks, isLoading, error: apiError };
}
