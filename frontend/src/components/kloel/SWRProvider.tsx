'use client';
import { swrFetcher } from '@/lib/fetcher';
import { SWRConfig } from 'swr';

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        revalidateOnFocus: false,
        dedupingInterval: 2000,
        errorRetryCount: 3,
      }}
    >
      {children}
    </SWRConfig>
  );
}
