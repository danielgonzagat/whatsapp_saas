'use client';
import { SWRConfig } from 'swr';
import { swrFetcher } from '@/lib/fetcher';

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={{
      fetcher: swrFetcher,
      revalidateOnFocus: false,
      dedupingInterval: 2000,
      errorRetryCount: 3,
    }}>
      {children}
    </SWRConfig>
  );
}
