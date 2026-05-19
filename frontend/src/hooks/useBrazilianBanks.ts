'use client';

import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';

export interface BrazilianBank {
  code: number;
  name: string;
  fullName: string;
  ispb: string;
}

export const POPULAR_BANK_CODES = new Set([
  1, 33, 77, 104, 212, 237, 260, 290, 323, 336, 341, 380, 422, 748, 756,
]);

export function formatBankCode(code: number): string {
  return String(code).padStart(3, '0');
}

import { BRAZILIAN_BANKS as STATIC_BANKS } from '@/data/brazilian-banks';
import type { BrazilianBank as StaticBank } from '@/data/brazilian-banks';

function toBrazilianBank(b: StaticBank): BrazilianBank {
  return { code: b.code, name: b.name, fullName: b.fullName, ispb: b.ispb };
}

const FALLBACK_BANKS: BrazilianBank[] = STATIC_BANKS.map(toBrazilianBank);

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
