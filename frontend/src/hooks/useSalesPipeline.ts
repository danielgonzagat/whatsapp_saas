'use client';

import { type CreateDealPayload, createSalesDeal, moveSalesDeal } from '@/lib/api/pipeline';
import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';

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
