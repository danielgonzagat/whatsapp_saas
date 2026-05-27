/**
 * UTP-CREATOR-001 — Audience-Partner Fit Detector
 *
 * Evaluates fit between audience signals and a prospective partner/brand.
 * Considers audience demographics inferred from recent engagement events,
 * partner value alignment, and authenticity risk.
 *
 * Pure function — stateless. Input: recent events + partner profile.
 * Output: AudiencePartnerFit.
 */

import type {
  AudiencePartnerFit,
  AudiencePartnerFitVerdict,
  CreatorEvent,
} from './types';

export interface PartnerProfile {
  readonly partnerId: string;
  readonly partnerBrand: string;
  readonly workspaceId: string;
  readonly category: string;
  readonly valueKeywords: readonly string[];
  readonly authenticityRiskBaseline: number;
}

export interface FitConfig {
  readonly minEventsForAnalysis: number;
  readonly relevanceWeight: number;
  readonly valueAlignmentWeight: number;
  readonly authenticityRiskWeight: number;
  readonly strongFitMinScore: number;
  readonly moderateFitMinScore: number;
  readonly weakFitMinScore: number;
}

const DEFAULT_FIT_CONFIG: FitConfig = {
  minEventsForAnalysis: 5,
  relevanceWeight: 0.4,
  valueAlignmentWeight: 0.35,
  authenticityRiskWeight: 0.25,
  strongFitMinScore: 0.75,
  moderateFitMinScore: 0.55,
  weakFitMinScore: 0.35,
};

const ENGAGEMENT_CATEGORY_SIGNALS: Readonly<Record<string, readonly string[]>> = {
  education: ['curso', 'aprender', 'aula', 'estudar', 'conhecimento', 'mentoria'],
  technology: ['software', 'app', 'ferramenta', 'plataforma', 'automação'],
  health: ['saúde', 'bem-estar', 'fitness', 'dieta', 'suplemento'],
  finance: ['investir', 'dinheiro', 'renda', 'faturamento', 'lucro'],
  lifestyle: ['viagem', 'estilo', 'casa', 'carro', 'luxo'],
  marketing: ['vender', 'tráfego', 'anúncio', 'conversão', 'lead'],
  spirituality: ['mente', 'propósito', 'consciência', 'crescimento', 'energia'],
};

function classifyAudienceCategory(recentEvents: readonly CreatorEvent[]): string {
  const keywordHits = new Map<string, number>();

  for (const ev of recentEvents) {
    const text = extractMessageText(ev);
    if (!text) {continue;}

    const lower = text.toLowerCase();
    for (const [category, keywords] of Object.entries(ENGAGEMENT_CATEGORY_SIGNALS)) {
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          keywordHits.set(category, (keywordHits.get(category) ?? 0) + 1);
        }
      }
    }
  }

  if (keywordHits.size === 0) {return 'general';}

  let best = 'general';
  let bestCount = 0;
  for (const [cat, count] of keywordHits) {
    if (count > bestCount) {
      bestCount = count;
      best = cat;
    }
  }
  return best;
}

function computeAudienceRelevance(
  audienceCategory: string,
  partnerCategory: string,
): number {
  if (!audienceCategory || audienceCategory === 'general') {return 0.5;}
  if (audienceCategory === partnerCategory) {return 1.0;}

  const related: Record<string, readonly string[]> = {
    education: ['marketing', 'technology'],
    marketing: ['education', 'technology'],
    technology: ['marketing', 'education', 'finance'],
    finance: ['technology', 'lifestyle'],
    lifestyle: ['finance', 'health'],
    health: ['lifestyle'],
  };

  const relatedCategories = related[audienceCategory] ?? [];
  return relatedCategories.includes(partnerCategory) ? 0.6 : 0.25;
}

function computeValueAlignment(
  recentEvents: readonly CreatorEvent[],
  valueKeywords: readonly string[],
): number {
  if (valueKeywords.length === 0) {return 0.5;}

  let hitCount = 0;
  let totalMessages = 0;

  for (const ev of recentEvents) {
    const text = extractMessageText(ev);
    if (!text) {continue;}
    totalMessages += 1;

    const lower = text.toLowerCase();
    for (const kw of valueKeywords) {
      if (lower.includes(kw.toLowerCase())) {
        hitCount += 1;
        break;
      }
    }
  }

  if (totalMessages === 0) {return 0.5;}
  return Math.min(1, hitCount / Math.max(1, totalMessages));
}

function computeAuthenticityRisk(
  recentEvents: readonly CreatorEvent[],
  baseline: number,
): number {
  const negativeCount = recentEvents.filter(
    (e) => e.eventName === 'commerce.lead.objection_raised',
  ).length;

  const silenceCount = recentEvents.filter(
    (e) => e.eventName === 'commerce.lead.went_silent',
  ).length;

  const riskFromSignals = Math.min(0.5, (negativeCount * 0.1) + (silenceCount * 0.08));
  return Math.min(1, baseline + riskFromSignals);
}

function determineVerdict(
  fitScore: number,
  config: FitConfig,
): AudiencePartnerFitVerdict {
  if (fitScore >= config.strongFitMinScore) {return 'strong_fit';}
  if (fitScore >= config.moderateFitMinScore) {return 'moderate_fit';}
  if (fitScore >= config.weakFitMinScore) {return 'weak_fit';}
  return 'mismatch';
}

function buildReasons(
  verdict: AudiencePartnerFitVerdict,
  audienceCategory: string,
  partnerCategory: string,
  relevance: number,
  alignment: number,
  risk: number,
): string[] {
  const reasons: string[] = [];

  if (audienceCategory === partnerCategory) {
    reasons.push(`audience category "${audienceCategory}" matches partner category`);
  } else if (audienceCategory !== 'general') {
    reasons.push(
      `audience category "${audienceCategory}" differs from partner "${partnerCategory}"`,
    );
  }

  if (relevance >= 0.7) {
    reasons.push(`high audience relevance (${relevance.toFixed(2)})`);
  }
  if (alignment >= 0.6) {
    reasons.push(`strong value alignment (${alignment.toFixed(2)})`);
  }
  if (risk >= 0.5) {
    reasons.push(`elevated authenticity risk (${risk.toFixed(2)})`);
  }

  if (verdict === 'mismatch') {
    reasons.push('audience signals do not align with partner profile');
  }
  if (verdict === 'weak_fit') {
    reasons.push('partial alignment; proceed with caution');
  }

  return reasons;
}

function extractMessageText(ev: CreatorEvent): string | undefined {
  const p = ev.payload;
  if (!p) {return undefined;}
  if (typeof p['messageBody'] === 'string') {return p['messageBody'];}
  if (typeof p['body'] === 'string') {return p['body'];}
  if (typeof p['text'] === 'string') {return p['text'];}
  return undefined;
}

/**
 * Detect audience-partner fit from recent events and partner profile.
 */
export function detectAudiencePartnerFit(
  recentEvents: readonly CreatorEvent[],
  partner: PartnerProfile,
  config: Partial<FitConfig> = {},
): AudiencePartnerFit {
  const cfg: FitConfig = { ...DEFAULT_FIT_CONFIG, ...config };
  const now = new Date().toISOString();

  if (recentEvents.length < cfg.minEventsForAnalysis) {
    return {
      partnerId: partner.partnerId,
      partnerBrand: partner.partnerBrand,
      workspaceId: partner.workspaceId,
      fitScore: 0.3,
      audienceRelevance: 0.3,
      valueAlignment: 0.3,
      authenticityRisk: partner.authenticityRiskBaseline,
      verdict: 'weak_fit',
      reasons: [`insufficient audience data (${recentEvents.length}/${cfg.minEventsForAnalysis} events)`],
      generatedAt: now,
    };
  }

  const audienceCategory = classifyAudienceCategory(recentEvents);
  const relevance = computeAudienceRelevance(audienceCategory, partner.category);
  const alignment = computeValueAlignment(recentEvents, partner.valueKeywords);
  const risk = computeAuthenticityRisk(recentEvents, partner.authenticityRiskBaseline);

  const fitScore =
    relevance * cfg.relevanceWeight +
    alignment * cfg.valueAlignmentWeight +
    (1 - risk) * cfg.authenticityRiskWeight;

  const verdict = determineVerdict(fitScore, cfg);
  const reasons = buildReasons(verdict, audienceCategory, partner.category, relevance, alignment, risk);

  return {
    partnerId: partner.partnerId,
    partnerBrand: partner.partnerBrand,
    workspaceId: partner.workspaceId,
    fitScore: parseFloat(fitScore.toFixed(3)),
    audienceRelevance: parseFloat(relevance.toFixed(3)),
    valueAlignment: parseFloat(alignment.toFixed(3)),
    authenticityRisk: parseFloat(risk.toFixed(3)),
    verdict,
    reasons,
    generatedAt: now,
  };
}
