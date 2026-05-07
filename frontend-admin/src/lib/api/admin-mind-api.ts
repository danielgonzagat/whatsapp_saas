import { adminFetch } from './admin-client';

export interface MindBeliefAggregate {
  predicate: string;
  total: number;
  minSamples: number;
  maxSamples: number;
  avgMean: number;
}

export interface MindPredictionSummary {
  total: number;
  resolved: number;
  open: number;
  avgSurprise: number;
  highSurpriseCount: number;
}

export interface MindPolicySummary {
  total: number;
  resolved: number;
  unresolved: number;
  decisionTypes: string[];
}

export interface MindConversionBelief {
  subject: string;
  context: Record<string, unknown>;
  mean: number;
  variance: number;
  samples: number;
}

export interface AdminMindStateResponse {
  workspaceId: string;
  workspaceName: string;
  beliefSummary: {
    totalPredicates: number;
    predicates: MindBeliefAggregate[];
  };
  predictionSummary: MindPredictionSummary;
  policySummary: MindPolicySummary;
  topConversionBeliefs: MindConversionBelief[];
}

export interface AdminMindSurpriseItem {
  id: string;
  subject: string;
  predicate: string;
  predictedMean: number;
  actual: number | null;
  surprise: number | null;
  severity: 'critical' | 'high' | 'moderate' | 'low';
  horizonSec: number;
  resolvedAt: string | null;
  createdAt: string;
}

export interface AdminMindSurpriseResponse {
  workspaceId: string;
  workspaceName: string;
  items: AdminMindSurpriseItem[];
  total: number;
}

export interface AdminMindLiftAction {
  chosen: string;
  baseline: string;
  outcome: number;
  count: number;
}

export interface AdminMindLiftResponse {
  workspaceId: string;
  workspaceName: string;
  decisionType: string;
  sinceDays: number;
  n: number;
  mindMean: number;
  baselineMean: number;
  lift: number;
  pZScore: number;
  topChosenActions: AdminMindLiftAction[];
}

const ENDPOINT = '/mind';

export const adminMindApi = {
  state(workspaceId: string, decisionType?: string): Promise<AdminMindStateResponse> {
    const params = new URLSearchParams();
    if (decisionType) {
      params.set('decisionType', decisionType);
    }
    const qs = params.toString();
    return adminFetch<AdminMindStateResponse>(
      `${ENDPOINT}/${encodeURIComponent(workspaceId)}/state${qs ? `?${qs}` : ''}`,
    );
  },

  surprise(workspaceId: string, limit = 20): Promise<AdminMindSurpriseResponse> {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    return adminFetch<AdminMindSurpriseResponse>(
      `${ENDPOINT}/${encodeURIComponent(workspaceId)}/surprise?${params.toString()}`,
    );
  },

  lift(workspaceId: string, decisionType: string, sinceDays = 14): Promise<AdminMindLiftResponse> {
    const params = new URLSearchParams();
    params.set('decisionType', decisionType);
    if (sinceDays !== 14) {
      params.set('sinceDays', String(sinceDays));
    }
    return adminFetch<AdminMindLiftResponse>(
      `${ENDPOINT}/${encodeURIComponent(workspaceId)}/lift?${params.toString()}`,
    );
  },
};
