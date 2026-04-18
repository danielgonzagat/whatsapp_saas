'use client';

import { type CreateDealPayload, createSalesDeal, moveSalesDeal } from '@/lib/api/pipeline';
import { swrFetcher } from '@/lib/fetcher';
import useSWR from 'swr';

interface RawPipelineStage {
  id?: string;
  _id?: string;
  name?: string;
  [k: string]: unknown;
}

interface RawPipelineDeal {
  id?: string;
  _id?: string;
  value?: number;
  stageId?: string | null;
  stage?: string | { id?: string; _id?: string } | null;
  [k: string]: unknown;
}

interface RawPipeline {
  id?: string;
  _id?: string;
  name?: string;
  stages?: RawPipelineStage[];
  [k: string]: unknown;
}

export interface PipelineStage extends RawPipelineStage {
  id: string;
  deals: PipelineDeal[];
}

export interface PipelineDeal extends RawPipelineDeal {
  id: string;
}

type DealsPayload = RawPipelineDeal[] | { deals?: RawPipelineDeal[] } | null | undefined;

export function useSalesPipeline() {
  const {
    data: pipelinesData,
    isLoading: pipelinesLoading,
    error: pipelinesError,
    mutate,
  } = useSWR<RawPipeline[]>('/crm/pipelines', swrFetcher, {
    keepPreviousData: true,
    revalidateOnFocus: false,
  });
  const pipelines = Array.isArray(pipelinesData) ? pipelinesData : [];
  const pipeline: RawPipeline | undefined = pipelines[0];
  const pipelineId = String(pipeline?.id || pipeline?._id || '');
  const {
    data: dealsData,
    isLoading: dealsLoading,
    error: dealsError,
  } = useSWR<DealsPayload>(
    pipelineId ? `/crm/deals?pipeline=${encodeURIComponent(pipelineId)}` : null,
    swrFetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
    },
  );
  const rawDeals: RawPipelineDeal[] = Array.isArray(dealsData)
    ? dealsData
    : Array.isArray(dealsData?.deals)
      ? dealsData.deals
      : [];
  const deals: PipelineDeal[] = rawDeals
    .filter((deal): deal is RawPipelineDeal & { id: string } => Boolean(deal?.id || deal?._id))
    .map((deal) => ({ ...deal, id: String(deal.id || deal._id || '') }));
  const stages: PipelineStage[] = Array.isArray(pipeline?.stages)
    ? pipeline.stages
        .filter((stage): stage is RawPipelineStage => Boolean(stage?.id || stage?._id))
        .map((stage) => {
          const stageId = String(stage.id || stage._id || '');
          return {
            ...stage,
            id: stageId,
            deals: deals.filter((deal) => {
              const stageRef = deal?.stage;
              const dealStageId =
                deal?.stageId ||
                (typeof stageRef === 'object' && stageRef !== null
                  ? stageRef._id || stageRef.id
                  : stageRef) ||
                '';
              return String(dealStageId || '') === stageId;
            }),
          };
        })
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
