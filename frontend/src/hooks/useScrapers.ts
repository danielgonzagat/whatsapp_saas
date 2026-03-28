"use client";

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';

export interface ScrapingJob {
  id: string;
  type: 'MAPS' | 'INSTAGRAM' | 'GROUP';
  query: string;
  status: string;
  resultsCount?: number;
  flowId?: string;
  createdAt: string;
  updatedAt?: string;
}

export function useScrapers() {
  const { data, error, isLoading, mutate } = useSWR<any>('/scrapers/jobs', swrFetcher);
  const jobs: ScrapingJob[] = Array.isArray(data) ? data : data?.jobs || [];
  return { jobs, isLoading, error, mutate };
}

export function useScraper(id: string) {
  const { data, error, isLoading } = useSWR<ScrapingJob>(
    id ? `/scrapers/jobs/${id}` : null,
    swrFetcher,
  );
  return { job: data || null, isLoading, error };
}
