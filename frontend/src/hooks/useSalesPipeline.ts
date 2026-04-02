'use client';

import useSWR, { useSWRConfig } from 'swr';
import { swrFetcher } from '@/lib/fetcher';
import { apiFetch } from '@/lib/api';

export interface CreateSalesDealPayload {
  title: string;
  value?: number;
  contactId?: string;
  pipeline?: string;
  stage?: string;
}

export function useSalesPipeline() {
  const {
    data: pipelinesData,
    isLoading: pipelinesLoading,
    error: pipelinesError,
    mutate,
  } = useSWR('/crm/pipelines', swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  const pipelines = Array.isArray(pipelinesData) ? pipelinesData : [];
  const pipeline = pipelines[0] as Record<string, any> | undefined;
  const pipelineId = String(pipeline?.id || pipeline?._id || '');
  const {
    data: dealsData,
    isLoading: dealsLoading,
    error: dealsError,
  } = useSWR(
    pipelineId ? `/crm/deals?pipeline=${encodeURIComponent(pipelineId)}` : null,
    swrFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
    },
  );
  const deals = Array.isArray(dealsData)
    ? dealsData
    : Array.isArray((dealsData as any)?.deals)
      ? (dealsData as any).deals
      : [];
  const stages = Array.isArray(pipeline?.stages)
    ? pipeline!.stages.map((stage: any) => ({
        ...stage,
        deals: deals.filter((deal: any) => {
          const dealStageId = deal?.stageId || deal?.stage?._id || deal?.stage?.id || deal?.stage;
          return String(dealStageId || '') === String(stage?.id || stage?._id || '');
        }),
      }))
    : [];

  return {
    pipeline: pipeline || null,
    stages,
    isLoading: pipelinesLoading || dealsLoading,
    error: pipelinesError || dealsError,
    mutate,
  };
}

export function useSalesPipelineMutations() {
  const { mutate: globalMutate } = useSWRConfig();
  const invalidateDeals = () =>
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/crm/deals'));
  const invalidatePipelines = () =>
    globalMutate((key: string) => typeof key === 'string' && key.startsWith('/crm/pipelines'));

  const createDeal = async (payload: CreateSalesDealPayload) => {
    const res = await apiFetch('/crm/deals', { method: 'POST', body: payload });
    await invalidateDeals();
    await invalidatePipelines();
    return res;
  };

  const moveDeal = async (dealId: string, stageId: string) => {
    const res = await apiFetch(`/crm/deals/${dealId}/move`, { method: 'PUT', body: { stageId } });
    await invalidateDeals();
    await invalidatePipelines();
    return res;
  };

  return { createDeal, moveDeal };
}
