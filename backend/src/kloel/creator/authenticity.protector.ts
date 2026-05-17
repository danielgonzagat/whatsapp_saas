/**
 * UTP-CREATOR-004 — Authenticity Protector
 *
 * Protects creator authenticity by scanning outbound messaging for
 * patterns that erode audience trust: overselling, misleading claims,
 * forced endorsements, value misalignment, and audience gaslighting.
 *
 * Pure function — stateless. Input: outbound message texts.
 * Output: AuthenticityProtection.
 */

import type {
  AuthenticityProtection,
  AuthenticityWarningFlag,
  AuthenticityWarningKind,
  CreatorEvent,
} from './types';

export interface AuthenticityConfig {
  readonly maxRecentMessages: number;
  readonly oversellingRatioThreshold: number;
  readonly misleadingClaimMinConfidence: number;
  readonly forcedEndorsementKeywordCount: number;
}

const DEFAULT_AUTHENTICITY_CONFIG: AuthenticityConfig = {
  maxRecentMessages: 20,
  oversellingRatioThreshold: 0.25,
  misleadingClaimMinConfidence: 0.5,
  forcedEndorsementKeywordCount: 3,
};

const OVERSELLING_PATTERNS: ReadonlyArray<{ readonly pattern: string; readonly confidence: number }> = [
  { pattern: 'só hoje', confidence: 0.6 },
  { pattern: 'última chance', confidence: 0.7 },
  { pattern: 'nunca mais', confidence: 0.65 },
  { pattern: 'acabando', confidence: 0.55 },
  { pattern: 'vagas limitadas', confidence: 0.5 },
  { pattern: 'não perca', confidence: 0.6 },
  { pattern: 'oportunidade única', confidence: 0.65 },
];

const MISLEADING_CLAIM_PATTERNS: ReadonlyArray<{ readonly pattern: string; readonly confidence: number }> = [
  { pattern: 'fature 10k', confidence: 0.7 },
  { pattern: 'sem esforço', confidence: 0.8 },
  { pattern: 'garantia de resultado', confidence: 0.75 },
  { pattern: '100% garantido', confidence: 0.7 },
  { pattern: 'resultado em 24h', confidence: 0.65 },
  { pattern: 'método secreto', confidence: 0.6 },
  { pattern: 'fórmula mágica', confidence: 0.7 },
];

const FORCED_ENDORSEMENT_KEYWORDS = [
  'parceiro',
  'parceria',
  'recomendo',
  'uso e recomendo',
  'melhor do mercado',
  'número um',
  'líder',
  'confio de olhos fechados',
];

const VALUE_MISALIGNMENT_TRIGGERS = [
  'mesmo que',
  'apesar de',
  'não gosto mas',
  'não uso mas',
  'não é meu estilo',
];

const GASLIGHTING_PATTERNS = [
  'você precisa',
  'se você não',
  'todo mundo está',
  'você está perdendo',
  'você vai se arrepender',
];

function scanPatterns(
  text: string,
  patterns: ReadonlyArray<{ readonly pattern: string; readonly confidence: number }>,
  kind: AuthenticityWarningKind,
  minConfidence: number,
): AuthenticityWarningFlag[] {
  const lower = text.toLowerCase();
  const flags: AuthenticityWarningFlag[] = [];

  for (const { pattern, confidence } of patterns) {
    if (lower.includes(pattern) && confidence >= minConfidence) {
      flags.push({ kind, confidence, matchedPattern: pattern });
    }
  }

  return flags;
}

function detectOverselling(
  texts: readonly string[],
  config: AuthenticityConfig,
): AuthenticityWarningFlag | null {
  let hitCount = 0;
  let bestConfidence = 0;
  let bestPattern = '';

  for (const text of texts) {
    const flags = scanPatterns(text, OVERSELLING_PATTERNS, 'overselling', 0.3);
    if (flags.length > 0) {
      hitCount += 1;
      for (const f of flags) {
        if (f.confidence > bestConfidence) {
          bestConfidence = f.confidence;
          bestPattern = f.matchedPattern;
        }
      }
    }
  }

  if (texts.length > 0 && hitCount / texts.length >= config.oversellingRatioThreshold) {
    return {
      kind: 'overselling',
      confidence: bestConfidence,
      matchedPattern: bestPattern,
    };
  }

  return null;
}

function detectMisleadingClaims(
  texts: readonly string[],
  config: AuthenticityConfig,
): AuthenticityWarningFlag | null {
  let bestConfidence = 0;
  let bestPattern = '';

  for (const text of texts) {
    const flags = scanPatterns(text, MISLEADING_CLAIM_PATTERNS, 'misleading_claim', config.misleadingClaimMinConfidence);
    for (const f of flags) {
      if (f.confidence > bestConfidence) {
        bestConfidence = f.confidence;
        bestPattern = f.matchedPattern;
      }
    }
  }

  if (bestConfidence > 0) {
    return {
      kind: 'misleading_claim',
      confidence: bestConfidence,
      matchedPattern: bestPattern,
    };
  }

  return null;
}

function detectForcedEndorsement(
  texts: readonly string[],
  config: AuthenticityConfig,
): AuthenticityWarningFlag | null {
  let maxHitsInOne = 0;
  let bestPattern = '';

  for (const text of texts) {
    const lower = text.toLowerCase();
    let hits = 0;
    for (const kw of FORCED_ENDORSEMENT_KEYWORDS) {
      if (lower.includes(kw)) hits += 1;
    }
    if (hits > maxHitsInOne) {
      maxHitsInOne = hits;
      bestPattern = FORCED_ENDORSEMENT_KEYWORDS.find((kw) => lower.includes(kw)) ?? '';
    }
  }

  if (maxHitsInOne >= config.forcedEndorsementKeywordCount) {
    return {
      kind: 'forced_endorsement',
      confidence: Math.min(1, maxHitsInOne * 0.25),
      matchedPattern: bestPattern,
    };
  }

  return null;
}

function detectValueMisalignment(
  texts: readonly string[],
): AuthenticityWarningFlag | null {
  for (const text of texts) {
    const lower = text.toLowerCase();
    for (const trigger of VALUE_MISALIGNMENT_TRIGGERS) {
      if (lower.includes(trigger)) {
        return {
          kind: 'value_misalignment',
          confidence: 0.7,
          matchedPattern: trigger,
        };
      }
    }
  }

  return null;
}

function detectAudienceGaslighting(
  texts: readonly string[],
): AuthenticityWarningFlag | null {
  let maxConfidence = 0;
  let bestPattern = '';

  for (const text of texts) {
    const lower = text.toLowerCase();
    for (const pattern of GASLIGHTING_PATTERNS) {
      if (lower.includes(pattern)) {
        const confidence = pattern.startsWith('você precisa') ? 0.75
          : pattern.startsWith('se você não') ? 0.8
          : 0.55;
        if (confidence > maxConfidence) {
          maxConfidence = confidence;
          bestPattern = pattern;
        }
      }
    }
  }

  if (maxConfidence > 0) {
    return {
      kind: 'audience_gaslighting',
      confidence: maxConfidence,
      matchedPattern: bestPattern,
    };
  }

  return null;
}

function extractMessageText(ev: CreatorEvent): string | undefined {
  const p = ev.payload;
  if (!p) return undefined;
  if (typeof p['messageBody'] === 'string') return p['messageBody'] as string;
  if (typeof p['body'] === 'string') return p['body'] as string;
  if (typeof p['text'] === 'string') return p['text'] as string;
  return undefined;
}

/**
 * Protect authenticity by scanning outbound messaging for trust-eroding patterns.
 */
export function protectAuthenticity(
  outboundMessages: readonly CreatorEvent[],
  config: Partial<AuthenticityConfig> = {},
): AuthenticityProtection {
  const cfg: AuthenticityConfig = { ...DEFAULT_AUTHENTICITY_CONFIG, ...config };
  const now = new Date().toISOString();

  const sample = outboundMessages.slice(-cfg.maxRecentMessages);
  const texts = sample
    .map((e) => extractMessageText(e))
    .filter((t): t is string => t !== undefined && t.length > 0);

  const warningFlags: AuthenticityWarningFlag[] = [];

  const overselling = detectOverselling(texts, cfg);
  if (overselling) warningFlags.push(overselling);

  const misleading = detectMisleadingClaims(texts, cfg);
  if (misleading) warningFlags.push(misleading);

  const forced = detectForcedEndorsement(texts, cfg);
  if (forced) warningFlags.push(forced);

  const misalignment = detectValueMisalignment(texts);
  if (misalignment) warningFlags.push(misalignment);

  const gaslighting = detectAudienceGaslighting(texts);
  if (gaslighting) warningFlags.push(gaslighting);

  const atRisk = warningFlags.length > 0;

  const totalConfidence = warningFlags.reduce((sum, f) => sum + f.confidence, 0);
  const flagPenalty = Math.min(1, totalConfidence / Math.max(1, warningFlags.length));

  const organicKeywords = ['conteúdo', 'compartilhar', 'experiência', 'aprender', 'reflexão'];
  let organicCount = 0;
  for (const t of texts) {
    const lower = t.toLowerCase();
    if (organicKeywords.some((kw) => lower.includes(kw))) {
      organicCount += 1;
    }
  }
  const organicRatio = texts.length > 0 ? organicCount / texts.length : 0.5;

  const endorsementKeywords = ['recomendo', 'uso e recomendo', 'parceiro', 'parceria'];
  let endorsementCount = 0;
  for (const t of texts) {
    const lower = t.toLowerCase();
    if (endorsementKeywords.some((kw) => lower.includes(kw))) {
      endorsementCount += 1;
    }
  }
  const endorsementConsistency = texts.length > 0
    ? 1 - Math.min(1, endorsementCount / texts.length)
    : 1;

  const authenticityScore = Math.max(0, Math.min(1,
    (1 - flagPenalty) * 0.5 +
    organicRatio * 0.25 +
    endorsementConsistency * 0.25,
  ));

  return {
    authenticityScore: parseFloat(authenticityScore.toFixed(3)),
    atRisk,
    organicRatio: parseFloat(organicRatio.toFixed(3)),
    endorsementConsistency: parseFloat(endorsementConsistency.toFixed(3)),
    warningFlags,
    generatedAt: now,
  };
}
