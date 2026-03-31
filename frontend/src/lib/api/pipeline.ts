// Sales Pipeline API — wraps /pipeline backend routes
import { apiFetch } from './core';

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

export interface PipelineStage {
  id: string;
  name: string;
  color: string;
  order: number;
  deals: PipelineDeal[];
}

export interface SalesPipeline {
  id: string;
  name: string;
  workspaceId: string;
  isDefault: boolean;
  stages: PipelineStage[];
}

export async function getSalesPipeline(): Promise<SalesPipeline> {
  const res = await apiFetch<SalesPipeline>('/pipeline');
  if (res.error) throw new Error(res.error || 'Erro ao carregar pipeline');
  return res.data as SalesPipeline;
}

export interface CreateDealPayload {
  title: string;
  value?: number;
  contactId?: string;
}

export async function createSalesDeal(payload: CreateDealPayload): Promise<PipelineDeal> {
  const res = await apiFetch<PipelineDeal>('/pipeline/deals', {
    method: 'POST',
    body: payload,
  });
  if (res.error) throw new Error(res.error || 'Erro ao criar deal');
  return res.data as PipelineDeal;
}

export async function moveSalesDeal(dealId: string, stageId: string): Promise<PipelineDeal> {
  const res = await apiFetch<PipelineDeal>(`/pipeline/deals/${dealId}/stage`, {
    method: 'PUT',
    body: { stageId },
  });
  if (res.error) throw new Error(res.error || 'Erro ao mover deal');
  return res.data as PipelineDeal;
}
