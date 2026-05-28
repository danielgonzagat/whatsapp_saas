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

  const banks = Array.isArray(data) && data.length > 0 ? data : FALLBACK_BANKS;
  const apiError = error ? (error as Error).message : null;

  return { banks, isLoading, error: apiError };
}
