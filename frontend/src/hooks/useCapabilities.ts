'use client';

import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';
import type { FrontendCapability } from '@/lib/capability-data/types';
import { FRONTEND_CAPABILITIES as STATIC_CAPABILITIES } from '@/lib/capability-data';

export type { CapabilityCategory, CapabilityStatus } from '@/lib/capability-data/types';
export type { FrontendCapability } from '@/lib/capability-data/types';

const FALLBACK_CAPABILITIES: FrontendCapability[] = STATIC_CAPABILITIES.map((c) => ({ ...c, roles: [...c.roles] }));

export function useCapabilities() {
  const { data, error, isLoading } = useSWR<FrontendCapability[]>(
    '/capabilities',
    swrFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 60000,
    },
  );

  const capabilities = Array.isArray(data) && data.length > 0 ? data : FALLBACK_CAPABILITIES;
  const apiError = error ? (error as Error).message : null;

  return { capabilities, isLoading, error: apiError };
}
