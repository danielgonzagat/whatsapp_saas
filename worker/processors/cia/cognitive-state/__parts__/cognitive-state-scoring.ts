import type { DemandState } from '../../../../providers/commercial-intelligence';
import { clamp, includesAny, URGENCY_HINTS } from './cognitive-state-types';
import type { CustomerStage, CustomerCognitiveState } from './cognitive-state-types';

export const computeSilenceMinutes = (lastMessageAt?: Date | string | null): number => {
  if (!lastMessageAt) {
    return 0;
  }
  return Math.max(0, Math.round((Date.now() - new Date(lastMessageAt).getTime()) / 60_000));
};

export interface ComputeTrustScoreParams {
  previous: Partial<CustomerCognitiveState> | null;
  leadScore?: number | null | undefined;
  trustSignals: string[];
  objections: string[];
}

export const computeTrustScore = (params: ComputeTrustScoreParams): number => {
  const previousTrust = Number(params.previous?.trustScore || 0.45) || 0.45;
  const leadScoreNorm = clamp((Number(params.leadScore || 0) || 0) / 100, 0, 1);
  const base =
    previousTrust * 0.45 +
    leadScoreNorm * 0.3 +
    (params.trustSignals.includes('positive_ack') ? 0.12 : 0) +
    (params.trustSignals.includes('buying_signal') ? 0.1 : 0) -
    (params.objections.includes('trust') ? 0.08 : 0);
  return Number(clamp(base, 0, 1).toFixed(3));
};

export interface ComputeUrgencyScoreParams {
  previous: Partial<CustomerCognitiveState> | null;
  text: string;
  unreadCount: number;
  demandState?: DemandState | null | undefined;
}

export const computeUrgencyScore = (params: ComputeUrgencyScoreParams): number => {
  const previousUrgency = Number(params.previous?.urgencyScore || 0.2) || 0.2;
  const base =
    previousUrgency * 0.35 +
    (includesAny(params.text, URGENCY_HINTS) ? 0.35 : 0) +
    Math.min(params.unreadCount / 4, 0.2) +
    (params.demandState?.attentionScore || 0) * 0.25;
  return Number(clamp(base, 0, 1).toFixed(3));
};

export interface ComputePriceSensitivityParams {
  previous: Partial<CustomerCognitiveState> | null;
  text: string;
  objections: string[];
}

export const computePriceSensitivity = (params: ComputePriceSensitivityParams): number => {
  const previousPrice = Number(params.previous?.priceSensitivity || 0.15) || 0.15;
  const base =
    previousPrice * 0.45 +
    (params.objections.includes('price') ? 0.4 : 0) +
    (params.text.includes('parcel') ? 0.15 : 0) +
    (params.text.includes('desconto') ? 0.15 : 0);
  return Number(clamp(base, 0, 1).toFixed(3));
};

export interface ComputeLtvEstimateParams {
  leadScore?: number | null | undefined;
  trustScore: number;
  urgencyScore: number;
  stage: CustomerStage;
}

const stageBonusFor = (stage: CustomerStage): number => {
  if (stage === 'CHECKOUT') {
    return 140;
  }
  if (stage === 'HOT') {
    return 90;
  }
  return 30;
};

export const computeLtvEstimate = (params: ComputeLtvEstimateParams): number => {
  const base =
    (Number(params.leadScore || 0) || 0) * 4 +
    params.trustScore * 180 +
    params.urgencyScore * 120 +
    stageBonusFor(params.stage);
  return Number(base.toFixed(2));
};
