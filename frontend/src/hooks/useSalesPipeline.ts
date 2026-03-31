'use client';

import useSWR from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { createSalesDeal, moveSalesDeal, type CreateDealPayload } from '@/lib/api/pipeline';

export function useSalesPipeline() {
  const { data, isLoading, error, mutate } = useSWR('/pipeline', swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });

  return {
    pipeline: data || null,
    stages: (data as any)?.stages || [],
    isLoading,
    error,
    mutate,
  };
}

export function useSalesPipelineMutations() {
  const { mutate } = useSWR('/pipeline', null);

  const createDeal = async (payload: CreateDealPayload) => {
    const deal = await createSalesDeal(payload);
    mutate();
    return deal;
  };

  const moveDeal = async (dealId: string, stageId: string) => {
    const updated = await moveSalesDeal(dealId, stageId);
    mutate();
    return updated;
  };

  return { createDeal, moveDeal };
}
