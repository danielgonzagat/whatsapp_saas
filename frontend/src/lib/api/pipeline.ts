// Sales Pipeline API — wraps /pipeline backend routes
import { mutate } from 'swr';
import { apiFetch } from './core';

const invalidatePipeline = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/pipeline'));

/** Pipeline deal shape. */
export interface PipelineDeal {
  /** Id property. */
  id: string;
  /** Title property. */
  title: string;
  /** Value property. */
  value: number;
  /** Stage id property. */
  stageId: string;
  /** Contact id property. */
  contactId?: string;
  /** Contact property. */
  contact?: {
    id: string;
    name?: string;
    phone?: string;
  };
  /** Source campaign id property. */
  sourceCampaignId?: string;
  /** Created at property. */
  createdAt: string;
  /** Updated at property. */
  updatedAt?: string;
}

/** Pipeline stage shape. */
export interface PipelineStage {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Color property. */
  color: string;
  /** Order property. */
  order: number;
  /** Deals property. */
  deals: PipelineDeal[];
}

/** Sales pipeline shape. */
export interface SalesPipeline {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Workspace id property. */
  workspaceId: string;
  /** Is default property. */
  isDefault: boolean;
  /** Stages property. */
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
  /** Title property. */
  title: string;
  /** Value property. */
  value?: number;
  /** Contact id property. */
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
