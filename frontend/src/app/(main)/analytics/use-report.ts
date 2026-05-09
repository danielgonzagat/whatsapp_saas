'use client';

import { swrFetcher } from '@/lib/fetcher';
import useSWR, { type SWRConfiguration } from 'swr';
import { buildUrl } from '../analytics.helpers';
import type { ReportFilters } from '../analytics.types';

const defaultOpts: SWRConfiguration = { keepPreviousData: true, revalidateOnFocus: false };

export function useReport<T>(ep: string, f: ReportFilters = {}, opts?: SWRConfiguration) {
  return useSWR<T>(buildUrl(ep, f), swrFetcher, { ...defaultOpts, ...opts });
}
