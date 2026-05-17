/**
 * UTP-CREATOR-006 — Creator Trust Capital Tracker
 *
 * Extends Camada IX trust for creator-audience relationships.
 * Measures accumulated trust capital between a creator and their
 * audience, distinct from per-conversation trust states.
 *
 * Composes audience trust, authenticity index, consistency score,
 * recommendation fidelity, recovery capacity, and audience retention
 * rate into a single creator-level trust capital score.
 *
 * Service — stateful (in-memory store per workspace). Input: recent
 * events + trust state from Camada IX. Output: CreatorTrustCapital.
 */

import { Injectable, Logger } from '@nestjs/common';

import type {
  CreatorTrustCapital,
  CreatorTrustVerdict,
  CreatorEvent,
} from './types';
import type { TrustState } from '../trust/trust.types';

export interface CreatorTrustConfig {
  readonly audienceTrustWeight: number;
  readonly authenticityWeight: number;
  readonly consistencyWeight: number;
  readonly fidelityWeight: number;
  readonly retentionWeight: number;
  readonly recoveryWeight: number;
  readonly strongCapitalMin: number;
  readonly stableCapitalMin: number;
  readonly erodingCapitalMin: number;
  readonly retentionWindowDays: number;
}

const DEFAULT_CREATOR_TRUST_CONFIG: CreatorTrustConfig = {
  audienceTrustWeight: 0.25,
  authenticityWeight: 0.2,
  consistencyWeight: 0.15,
  fidelityWeight: 0.15,
  retentionWeight: 0.15,
  recoveryWeight: 0.1,
  strongCapitalMin: 0.75,
  stableCapitalMin: 0.5,
  erodingCapitalMin: 0.25,
  retentionWindowDays: 90,
};

const INITIAL_TRUST_CAPITAL = 0.6;
const TRUST_CAPITAL_FLOOR = 0.0;
const TRUST_CAPITAL_CEILING = 1.0;

function computeAudienceTrust(
  trustStates: readonly TrustState[],
): number {
  if (trustStates.length === 0) return 0.6;

  const avgTrust = trustStates.reduce((sum, ts) => sum + ts.trustScore, 0) / trustStates.length;
  return Math.max(0, Math.min(1, avgTrust));
}

function computeAuthenticityIndex(
  recentEvents: readonly CreatorEvent[],
): number {
  if (recentEvents.length === 0) return 0.7;

  const objectionCount = recentEvents.filter(
    (e) => e.eventName === 'commerce.lead.objection_raised',
  ).length;

  const negativeCount = recentEvents.filter((e) =>
    e.valence === 'negative',
  ).length;

  const penalty = (objectionCount * 0.1) + (negativeCount * 0.05);
  return Math.max(0, Math.min(1, 0.8 - penalty));
}

function computeConsistencyScore(
  recentEvents: readonly CreatorEvent[],
): number {
  if (recentEvents.length < 3) return 0.5;

  const positiveRatio = recentEvents.filter((e) =>
    e.valence === 'positive',
  ).length / recentEvents.length;

  const negativeRatio = recentEvents.filter((e) =>
    e.valence === 'negative',
  ).length / recentEvents.length;

  return Math.max(0, Math.min(1, 0.5 + positiveRatio - negativeRatio));
}

function computeRecommendationFidelity(
  recentEvents: readonly CreatorEvent[],
): number {
  const totalWithPayload = recentEvents.filter((e) => e.payload).length;
  if (totalWithPayload === 0) return 0.5;

  const endorsementKeywords = ['recomendo', 'uso e recomendo', 'parceiro', 'parceria'];
  let roughEndorsements = 0;

  for (const ev of recentEvents) {
    const text = extractMessageText(ev);
    if (!text) continue;
    const lower = text.toLowerCase();
    if (endorsementKeywords.some((kw) => lower.includes(kw))) {
      roughEndorsements += 1;
    }
  }

  const endorsementRatio = Math.min(1, roughEndorsements / Math.max(1, totalWithPayload));
  return 1 - endorsementRatio;
}

function computeRecoveryCapacity(
  recentEvents: readonly CreatorEvent[],
): number {
  const silenceCount = recentEvents.filter(
    (e) => e.eventName === 'commerce.lead.went_silent',
  ).length;

  if (silenceCount === 0) return 0.8;

  const repliesAfterSilence = recentEvents.filter((e, i) => {
    if (i === 0) return false;
    const prev = recentEvents[i - 1];
    if (!prev || !recentEvents[i]) return false;

    return (
      prev.eventName === 'commerce.lead.went_silent' &&
      e.eventName === 'commerce.lead.replied'
    );
  }).length;

  return Math.max(0, Math.min(1, 0.8 - (silenceCount * 0.15) + (repliesAfterSilence * 0.1)));
}

function computeAudienceRetentionRate(
  recentEvents: readonly CreatorEvent[],
  config: CreatorTrustConfig,
): number {
  const now = Date.now();
  const windowMs = config.retentionWindowDays * 24 * 60 * 60 * 1000;

  const recentInWindow = recentEvents.filter((e) => {
    const t = new Date(e.occurredAt).getTime();
    return now - t <= windowMs;
  });

  if (recentInWindow.length === 0) return 0.5;

  const positiveInteractionCount = recentInWindow.filter((e) => {
    return e.eventName === 'commerce.lead.replied' && e.valence !== 'negative';
  }).length;

  return Math.min(1, positiveInteractionCount / Math.max(1, recentInWindow.length));
}

function determineVerdict(
  trustCapital: number,
  config: CreatorTrustConfig,
): CreatorTrustVerdict {
  if (trustCapital >= config.strongCapitalMin) return 'strong';
  if (trustCapital >= config.stableCapitalMin) return 'stable';
  if (trustCapital >= config.erodingCapitalMin) return 'eroding';
  return 'depleted';
}

function buildReason(
  trustCapital: number,
  verdict: CreatorTrustVerdict,
  audienceTrust: number,
  authenticityIndex: number,
  consistencyScore: number,
): string {
  switch (verdict) {
    case 'strong':
      return `trust capital healthy (${trustCapital.toFixed(2)}): audience trust ${audienceTrust.toFixed(2)}, authenticity ${authenticityIndex.toFixed(2)}`;
    case 'stable':
      return `trust capital stable (${trustCapital.toFixed(2)}): consistency ${consistencyScore.toFixed(2)}`;
    case 'eroding':
      return `trust capital eroding (${trustCapital.toFixed(2)}): authenticity ${authenticityIndex.toFixed(2)} declining`;
    case 'depleted':
      return `trust capital critically low (${trustCapital.toFixed(2)}): audience trust ${audienceTrust.toFixed(2)} depleted`;
  }
}

function extractMessageText(ev: CreatorEvent): string | undefined {
  const p = ev.payload;
  if (!p) return undefined;
  if (typeof p['messageBody'] === 'string') return p['messageBody'] as string;
  if (typeof p['body'] === 'string') return p['body'] as string;
  if (typeof p['text'] === 'string') return p['text'] as string;
  return undefined;
}

@Injectable()
export class CreatorTrustCapitalTrackerService {
  private readonly logger = new Logger(CreatorTrustCapitalTrackerService.name);
  private readonly store = new Map<string, CreatorTrustCapital>();

  private workspaceKey(workspaceId: string): string {
    return workspaceId;
  }

  trackCapital(
    workspaceId: string,
    recentEvents: readonly CreatorEvent[],
    trustStates: readonly TrustState[],
    config: Partial<CreatorTrustConfig> = {},
  ): CreatorTrustCapital {
    const cfg: CreatorTrustConfig = { ...DEFAULT_CREATOR_TRUST_CONFIG, ...config };
    const now = new Date().toISOString();

    const audienceTrust = computeAudienceTrust(trustStates);
    const authenticityIndex = computeAuthenticityIndex(recentEvents);
    const consistencyScore = computeConsistencyScore(recentEvents);
    const recommendationFidelity = computeRecommendationFidelity(recentEvents);
    const recoveryCapacity = computeRecoveryCapacity(recentEvents);
    const audienceRetentionRate = computeAudienceRetentionRate(recentEvents, cfg);

    const trustCapital = Math.max(TRUST_CAPITAL_FLOOR, Math.min(TRUST_CAPITAL_CEILING,
      audienceTrust * cfg.audienceTrustWeight +
      authenticityIndex * cfg.authenticityWeight +
      consistencyScore * cfg.consistencyWeight +
      recommendationFidelity * cfg.fidelityWeight +
      audienceRetentionRate * cfg.retentionWeight +
      recoveryCapacity * cfg.recoveryWeight,
    ));

    const verdict = determineVerdict(trustCapital, cfg);

    const result: CreatorTrustCapital = {
      workspaceId,
      trustCapital: parseFloat(trustCapital.toFixed(3)),
      audienceTrust: parseFloat(audienceTrust.toFixed(3)),
      authenticityIndex: parseFloat(authenticityIndex.toFixed(3)),
      consistencyScore: parseFloat(consistencyScore.toFixed(3)),
      recommendationFidelity: parseFloat(recommendationFidelity.toFixed(3)),
      recoveryCapacity: parseFloat(recoveryCapacity.toFixed(3)),
      audienceRetentionRate: parseFloat(audienceRetentionRate.toFixed(3)),
      verdict,
      reason: buildReason(trustCapital, verdict, audienceTrust, authenticityIndex, consistencyScore),
      generatedAt: now,
    };

    const key = this.workspaceKey(workspaceId);
    this.store.set(key, result);

    if (verdict === 'depleted') {
      this.logger.warn(
        `workspace=${workspaceId} creator trust capital critically low: ${trustCapital.toFixed(2)}`,
      );
    }

    return result;
  }

  getState(workspaceId: string): CreatorTrustCapital | undefined {
    return this.store.get(this.workspaceKey(workspaceId));
  }

  getDefaultCapital(workspaceId: string): CreatorTrustCapital {
    return {
      workspaceId,
      trustCapital: INITIAL_TRUST_CAPITAL,
      audienceTrust: 0.6,
      authenticityIndex: 0.7,
      consistencyScore: 0.5,
      recommendationFidelity: 0.5,
      recoveryCapacity: 0.8,
      audienceRetentionRate: 0.5,
      verdict: 'stable',
      reason: 'initial state — no history yet',
      generatedAt: new Date().toISOString(),
    };
  }
}
