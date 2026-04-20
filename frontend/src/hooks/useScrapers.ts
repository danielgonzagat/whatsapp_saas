'use client';

import { tokenStorage } from '@/lib/api/core';
import { scrapersApi } from '@/lib/api/misc';
import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';

/** Scraping job shape. */
export interface ScrapingJob {
  /** Id property. */
  id: string;
  /** Type property. */
  type: 'MAPS' | 'INSTAGRAM' | 'GROUP';
  /** Query property. */
  query: string;
  /** Status property. */
  status: string;
  /** Results count property. */
  resultsCount?: number;
  /** Flow id property. */
  flowId?: string;
  /** Created at property. */
  createdAt: string;
  /** Updated at property. */
  updatedAt?: string;
}

/** Use scrapers. */
export function useScrapers() {
  const { data, error, isLoading, mutate } = useSWR<ScrapingJob[] | { jobs?: ScrapingJob[] }>(
    '/scrapers/jobs',
    swrFetcher,
  );
  const jobs: ScrapingJob[] = Array.isArray(data) ? data : data?.jobs || [];
  return { jobs, isLoading, error, mutate };
}

/** Use scraper. */
export function useScraper(id: string) {
  const { data, error, isLoading } = useSWR<ScrapingJob>(
    id ? `/scrapers/jobs/${id}` : null,
    swrFetcher,
  );
  return { job: data || null, isLoading, error };
}

/** Create scraper job. */
export async function createScraperJob(data: {
  type: 'MAPS' | 'INSTAGRAM' | 'GROUP';
  query: string;
  location?: string;
  flowId?: string;
}): Promise<ScrapingJob> {
  const workspaceId = tokenStorage.getWorkspaceId() || '';
  const res = await scrapersApi.createJob({ workspaceId, ...data });
  if (res.error) {
    throw new Error(res.error || 'Erro ao criar job');
  }
  return res.data as ScrapingJob;
}

/** Import scraper results. */
export async function importScraperResults(
  jobId: string,
): Promise<{ imported: number; errors?: unknown[] }> {
  const workspaceId = tokenStorage.getWorkspaceId() || '';
  const res = await scrapersApi.importResults(jobId, workspaceId);
  if (res.error) {
    throw new Error(res.error || 'Erro ao importar resultados');
  }
  return res.data as { imported: number; errors?: unknown[] };
}
