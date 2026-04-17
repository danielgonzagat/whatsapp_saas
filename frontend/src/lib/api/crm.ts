// crmApi, segmentationApi objects
import { mutate } from 'swr';
import { apiFetch, tokenStorage } from './core';

const invalidateCrm = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/crm'));

export interface CrmContactTag {
  id: string;
  name: string;
}

export interface CrmContact {
  id: string;
  name?: string | null;
  phone: string;
  email?: string | null;
  notes?: string | null;
  tags?: CrmContactTag[];
  customFields?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CrmStage {
  id: string;
  name: string;
  order: number;
  color?: string | null;
}

export interface CrmPipeline {
  id: string;
  name: string;
  stages: CrmStage[];
}

export interface CrmDeal {
  id: string;
  title: string;
  value?: number | null;
  status?: string | null;
  stageId: string;
  contactId?: string | null;
  contact?: CrmContact | null;
  stage?: {
    id: string;
    name: string;
    pipeline?: {
      id: string;
      name: string;
    } | null;
  } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface SegmentationPreset {
  name: string;
  label?: string;
  description?: string;
}

export interface SegmentationStats {
  workspaceId: string;
  segments: Record<string, number>;
  total: number;
}

export const crmApi = {
  listContacts: (params?: { page?: number; limit?: number; search?: string }) => {
    const search = new URLSearchParams();
    if (params?.page) search.set('page', String(params.page));
    if (params?.limit) search.set('limit', String(params.limit));
    if (params?.search) search.set('search', params.search);
    const qs = search.toString();
    return apiFetch<{
      data: CrmContact[];
      meta: { total: number; page: number; limit: number; pages: number };
    }>(`/crm/contacts${qs ? `?${qs}` : ''}`);
  },

  createContact: async (payload: {
    name?: string;
    phone: string;
    email?: string;
    notes?: string;
  }) => {
    const res = await apiFetch<CrmContact>(`/crm/contacts`, {
      method: 'POST',
      body: payload,
    });
    invalidateCrm();
    return res;
  },

  addTag: async (phone: string, tag: string) => {
    const res = await apiFetch<CrmContact>(`/crm/contacts/${encodeURIComponent(phone)}/tags`, {
      method: 'POST',
      body: { tag },
    });
    invalidateCrm();
    return res;
  },

  removeTag: async (phone: string, tag: string) => {
    const res = await apiFetch<CrmContact | null>(
      `/crm/contacts/${encodeURIComponent(phone)}/tags/${encodeURIComponent(tag)}`,
      {
        method: 'DELETE',
      },
    );
    invalidateCrm();
    return res;
  },

  listPipelines: () => apiFetch<CrmPipeline[]>(`/crm/pipelines`),

  createPipeline: async (name: string) => {
    const res = await apiFetch<CrmPipeline>(`/crm/pipelines`, {
      method: 'POST',
      body: { name },
    });
    invalidateCrm();
    return res;
  },

  listDeals: () => apiFetch<CrmDeal[]>(`/crm/deals`),

  createDeal: async (payload: {
    contactId: string;
    stageId: string;
    title: string;
    value: number;
  }) => {
    const res = await apiFetch<CrmDeal>(`/crm/deals`, {
      method: 'POST',
      body: payload,
    });
    invalidateCrm();
    return res;
  },

  moveDeal: async (dealId: string, stageId: string) => {
    const res = await apiFetch<CrmDeal>(`/crm/deals/${encodeURIComponent(dealId)}/move`, {
      method: 'PUT',
      body: { stageId },
    });
    invalidateCrm();
    return res;
  },

  updateDeal: async (
    dealId: string,
    payload: Partial<{
      title: string;
      value: number;
      status: string;
    }>,
  ) => {
    const res = await apiFetch<CrmDeal>(`/crm/deals/${encodeURIComponent(dealId)}`, {
      method: 'PUT',
      body: payload,
    });
    invalidateCrm();
    return res;
  },

  deleteDeal: async (dealId: string) => {
    const res = await apiFetch<{ id: string }>(`/crm/deals/${encodeURIComponent(dealId)}`, {
      method: 'DELETE',
    });
    invalidateCrm();
    return res;
  },
};

// ============= CRM NEURO (AI Analysis) =============

export interface NeuroAnalysis {
  contactId: string;
  score?: number;
  sentiment?: string;
  buyingIntent?: string;
  riskLevel?: string;
  summary?: string;
  [key: string]: unknown;
}

export interface NeuroNextBestAction {
  contactId: string;
  action?: string;
  reason?: string;
  priority?: number;
  suggestedMessage?: string;
  [key: string]: unknown;
}

export interface NeuroCluster {
  id: string;
  name?: string;
  size?: number;
  avgScore?: number;
  [key: string]: unknown;
}

export interface NeuroSimulationResult {
  transcript?: string[];
  outcome?: string;
  [key: string]: unknown;
}

export const neuroCrmApi = {
  analyze: async (contactId: string) => {
    const res = await apiFetch<NeuroAnalysis>(
      `/crm/neuro/analyze/${encodeURIComponent(contactId)}`,
      {
        method: 'POST',
      },
    );
    invalidateCrm();
    return res;
  },

  nextBestAction: (contactId: string) =>
    apiFetch<NeuroNextBestAction>(`/crm/neuro/next-best/${encodeURIComponent(contactId)}`),

  clusters: () => apiFetch<{ clusters: NeuroCluster[] }>(`/crm/neuro/clusters`),

  simulate: async (params: { persona: string; scenario: string; goal: string }) => {
    const res = await apiFetch<NeuroSimulationResult>(`/crm/neuro/simulate`, {
      method: 'POST',
      body: params,
    });
    invalidateCrm();
    return res;
  },
};

export const segmentationApi = {
  getPresets: () => apiFetch<{ presets: SegmentationPreset[] }>(`/segmentation/presets`),

  getStats: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error('missing_workspaceId');
    }
    return apiFetch<SegmentationStats>(`/segmentation/${encodeURIComponent(workspaceId)}/stats`);
  },

  getPresetSegment: (presetName: string, limit?: number) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error('missing_workspaceId');
    }
    const qs = limit ? `?limit=${encodeURIComponent(String(limit))}` : '';
    return apiFetch<{ contacts: CrmContact[]; total: number; preset: string }>(
      `/segmentation/${encodeURIComponent(workspaceId)}/preset/${encodeURIComponent(presetName)}${qs}`,
    );
  },

  autoSegment: () => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error('missing_workspaceId');
    }
    return apiFetch<Record<string, unknown>>(
      `/segmentation/${encodeURIComponent(workspaceId)}/auto-segment`,
      {
        method: 'POST',
      },
    );
  },

  querySegment: (criteria: {
    tags?: string[];
    excludeTags?: string[];
    lastMessageDays?: number;
    noMessageDays?: number;
    purchaseHistory?: 'any' | 'none' | 'recent';
    purchaseMinValue?: number;
    engagement?: 'hot' | 'warm' | 'cold' | 'ghost';
    stageIds?: string[];
    limit?: number;
  }) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error('missing_workspaceId');
    }
    return apiFetch<{ contacts: CrmContact[]; total: number }>(
      `/segmentation/${encodeURIComponent(workspaceId)}/query`,
      { method: 'POST', body: criteria },
    );
  },

  getContactScore: (contactId: string) => {
    const workspaceId = tokenStorage.getWorkspaceId();
    if (!workspaceId) {
      throw new Error('missing_workspaceId');
    }
    return apiFetch<{ score: number; contactId: string; [key: string]: unknown }>(
      `/segmentation/${encodeURIComponent(workspaceId)}/contact/${encodeURIComponent(contactId)}/score`,
    );
  },
};
