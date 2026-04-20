// Sales Pipeline API — wraps /pipeline backend routes
import { mutate } from 'swr';
import { apiFetch } from './core';

const invalidatePipeline = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/pipeline'));

/** Pipeline deal shape. */
export interface PipelineDeal {
  id: string;
  title: string;
  value: number;
  stageId: string;
  contactId?: string;
  contact?: {
    id: string;
    name?: string;
    phone?: string;
  };
  sourceCampaignId?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Pipeline stage shape. */
export interface PipelineStage {
  id: string;
  name: string;
  color: string;
  order: number;
  deals: PipelineDeal[];
}

/** Sales pipeline shape. */
export interface SalesPipeline {
  id: string;
  name: string;
  workspaceId: string;
  isDefault: boolean;
  stages: PipelineStage[];
}

/** Get sales pipeline. */
export async function getSalesPipeline(): Promise<SalesPipeline> {
  const res = await apiFetch<SalesPipeline>('/pipeline');
  if (res.error) {
    throw new Error(res.error || 'Erro ao carregar pipeline');
  }
  return res.data as SalesPipeline;
}

/** Create deal payload shape. */
export interface CreateDealPayload {
  title: string;
  value?: number;
  contactId?: string;
}

/** Create sales deal. */
export async function createSalesDeal(payload: CreateDealPayload): Promise<PipelineDeal> {
  const res = await apiFetch<PipelineDeal>('/pipeline/deals', {
    method: 'POST',
    body: payload,
  });
  if (res.error) {
    throw new Error(res.error || 'Erro ao criar deal');
  }
  invalidatePipeline();
  return res.data as PipelineDeal;
}

/** Move sales deal. */
export async function moveSalesDeal(dealId: string, stageId: string): Promise<PipelineDeal> {
  const res = await apiFetch<PipelineDeal>(`/pipeline/deals/${dealId}/stage`, {
    method: 'PUT',
    body: { stageId },
  });
  if (res.error) {
    throw new Error(res.error || 'Erro ao mover deal');
  }
  invalidatePipeline();
  return res.data as PipelineDeal;
}
