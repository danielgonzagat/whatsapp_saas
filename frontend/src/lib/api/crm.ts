// crmApi, segmentationApi objects
import { mutate } from 'swr';
import { apiFetch, tokenStorage } from './core';

const invalidateCrm = () =>
  mutate((key: string) => typeof key === 'string' && key.startsWith('/crm'));

/** Crm contact tag shape. */
export interface CrmContactTag {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
}

/** Crm contact shape. */
export interface CrmContact {
  /** Id property. */
  id: string;
  /** Name property. */
  name?: string | null;
  /** Phone property. */
  phone: string;
  /** Email property. */
  email?: string | null;
  /** Notes property. */
  notes?: string | null;
  /** Tags property. */
  tags?: CrmContactTag[];
  /** Custom fields property. */
  customFields?: Record<string, unknown> | null;
  /** Created at property. */
  createdAt?: string;
  /** Updated at property. */
  updatedAt?: string;
}

/** Crm stage shape. */
export interface CrmStage {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Order property. */
  order: number;
  /** Color property. */
  color?: string | null;
}

/** Crm pipeline shape. */
export interface CrmPipeline {
  /** Id property. */
  id: string;
  /** Name property. */
  name: string;
  /** Stages property. */
  stages: CrmStage[];
}

/** Crm deal shape. */
export interface CrmDeal {
  /** Id property. */
  id: string;
  /** Title property. */
  title: string;
  /** Value property. */
  value?: number | null;
  /** Status property. */
  status?: string | null;
  /** Stage id property. */
  stageId: string;
  /** Contact id property. */
  contactId?: string | null;
  /** Contact property. */
  contact?: CrmContact | null;
  /** Stage property. */
  stage?: {
    id: string;
    name: string;
    pipeline?: {
      id: string;
      name: string;
    } | null;
  } | null;
  /** Created at property. */
  createdAt?: string;
  /** Updated at property. */
  updatedAt?: string;
}

/** Segmentation preset shape. */
export interface SegmentationPreset {
  /** Name property. */
  name: string;
  /** Label property. */
  label?: string;
  /** Description property. */
  description?: string;
}

/** Segmentation stats shape. */
export interface SegmentationStats {
  /** Workspace id property. */
  workspaceId: string;
  /** Segments property. */
  segments: Record<string, number>;
  /** Total property. */
  total: number;
}

/** Crm api. */
export const crmApi = {
  listContacts: (params?: { page?: number; limit?: number; search?: string }) => {
    const search = new URLSearchParams();
    if (params?.page) {
      search.set('page', String(params.page));
    }
    if (params?.limit) {
      search.set('limit', String(params.limit));
    }
    if (params?.search) {
      search.set('search', params.search);
    }
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

  getContact: (phone: string) =>
    apiFetch<CrmContact & { deals: CrmDeal[] }>(`/crm/contacts/${encodeURIComponent(phone)}`),

  listDeals: (params?: { pipeline?: string; stage?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.pipeline) searchParams.set('pipeline', params.pipeline);
    if (params?.stage) searchParams.set('stage', params.stage);
    if (params?.search) searchParams.set('search', params.search);
    const qs = searchParams.toString();
    return apiFetch<CrmDeal[]>(`/crm/deals${qs ? `?${qs}` : ''}`);
  },

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
  /** Contact id property. */
  contactId: string;
  /** Score property. */
  score?: number;
  /** Sentiment property. */
  sentiment?: string;
  /** Buying intent property. */
  buyingIntent?: string;
  /** Risk level property. */
  riskLevel?: string;
  /** Summary property. */
  summary?: string;
  [key: string]: unknown;
}

/** Neuro next best action shape. */
export interface NeuroNextBestAction {
  /** Contact id property. */
  contactId: string;
  /** Action property. */
  action?: string;
  /** Reason property. */
  reason?: string;
  /** Priority property. */
  priority?: number;
  /** Suggested message property. */
  suggestedMessage?: string;
  [key: string]: unknown;
}

/** Neuro cluster shape. */
export interface NeuroCluster {
  /** Id property. */
  id: string;
  /** Name property. */
  name?: string;
  /** Size property. */
  size?: number;
  /** Avg score property. */
  avgScore?: number;
  [key: string]: unknown;
}

/** Neuro simulation result shape. */
export interface NeuroSimulationResult {
  /** Transcript property. */
  transcript?: string[];
  /** Outcome property. */
  outcome?: string;
  [key: string]: unknown;
}

/** Neuro crm api. */
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

/** Segmentation api. */
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
