/**
 * UTP-OFFER-004 — Positioning Mismatch Detector (copy + audience level).
 *
 * Detects gaps between the marketed promise and what the target audience
 * actually perceives or expects. Compares promise language against
 * audience profile, conversion feedback (objections, lost reasons,
 * refund reasons) to surface positioning mismatches.
 *
 * Each gap is categorized and assigned a severity score. The aggregated
 * result indicates whether a repositioning is warranted.
 */

import type {
  AudienceProfile,
  ConversionFeedback,
  PositioningGapDetail,
  PositioningMismatchResult,
} from './offer.types';

const MIN_LEADS_FOR_FEEDBACK = 8;
const GAP_SEVERITY_THRESHOLD = 0.3;
const CRITICAL_SEVERITY_THRESHOLD = 0.7;
const MODERATE_SEVERITY_THRESHOLD = 0.5;

function promiseMatchesPainPoint(
  promise: string,
  painPoint: string,
): boolean {
  const promiseLower = promise.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const painLower = painPoint.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const painWords = painLower.split(/\s+/).filter((w) => w.length >= 4);
  return painWords.some((pw) => promiseLower.includes(pw));
}

function detectPainPointGaps(
  promise: string,
  audience: AudienceProfile,
): PositioningGapDetail[] {
  const gaps: PositioningGapDetail[] = [];
  const unmatched: string[] = [];

  for (const pp of audience.painPoints) {
    if (!promiseMatchesPainPoint(promise, pp)) {
      unmatched.push(pp);
    }
  }

  if (unmatched.length > 0 && unmatched.length / audience.painPoints.length > 0.67) {
    const severity = Math.min(1.0, unmatched.length / audience.painPoints.length);
    gaps.push({
      category: 'pain_point_coverage',
      description: `promise does not address ${unmatched.length}/${audience.painPoints.length} known pain points: ${unmatched.join(', ')}`,
      severity,
      evidence: [
        `unmatched pain points: ${unmatched.join(', ')}`,
        `audience role: ${audience.role}`,
      ],
    });
  }

  return gaps;
}

function detectPricePerceptionGap(
  promise: string,
  audience: AudienceProfile,
): PositioningGapDetail[] {
  const gaps: PositioningGapDetail[] = [];
  const promiseLower = promise.toLowerCase();
  const hasPremiumSignal = /premium|exclusivo|vip|luxo|elite|alto.valor/i.test(promiseLower);
  const hasAccessibilitySignal = /acess.vel|barato|popular|simples|b.sico/i.test(promiseLower);

  const audienceExpectsPremium = audience.pricePerception === 'high';
  const audienceExpectsLow = audience.pricePerception === 'low';

  if (audienceExpectsPremium && hasAccessibilitySignal) {
    gaps.push({
      category: 'price_positioning',
      description: `promise uses accessibility language but audience (${audience.role}) expects premium positioning`,
      severity: 0.7,
      evidence: [
        `audience price perception: ${audience.pricePerception}`,
        `promise contains accessibility signals`,
      ],
    });
  } else if (audienceExpectsLow && hasPremiumSignal) {
    gaps.push({
      category: 'price_positioning',
      description: `promise uses premium language but audience (${audience.role}) expects accessible pricing`,
      severity: 0.55,
      evidence: [
        `audience price perception: ${audience.pricePerception}`,
        `promise contains premium signals`,
      ],
    });
  }

  return gaps;
}

function detectTrustGap(
  promise: string,
  feedback: ConversionFeedback,
): PositioningGapDetail | undefined {
  const trustObj = feedback.objectionKinds['trust'] ?? 0;
  const credibilityObj = feedback.objectionKinds['credibility'] ?? 0;
  const authorityObj = feedback.objectionKinds['authority'] ?? 0;
  const totalObj = trustObj + credibilityObj + authorityObj;

  if (totalObj === 0) {return undefined;}

  const totalObjections = Object.values(feedback.objectionKinds).reduce((a, b) => a + b, 0);
  if (totalObjections === 0) {return undefined;}

  const ratio = totalObj / totalObjections;
  const hasProofSignals = /comprovad|provado|estudo|casos|clientes|depoimento/i.test(promise);

  if (ratio >= GAP_SEVERITY_THRESHOLD && !hasProofSignals) {
    return {
      category: 'trust_signaling',
      description: `${(ratio * 100).toFixed(0)}% of objections are trust-related but promise lacks proof/social proof language`,
      severity: Math.min(1.0, ratio + 0.15),
      evidence: [
        `trust-related objections: ${totalObj}/${totalObjections} (${(ratio * 100).toFixed(1)}%)`,
        `promise lacks proof signals (comprovado, casos, depoimentos, etc.)`,
      ],
    };
  }

  if (ratio < GAP_SEVERITY_THRESHOLD && hasProofSignals) {
    return {
      category: 'trust_signaling',
      description: `promise contains proof signals but trust objections are low (${(ratio * 100).toFixed(0)}%) — proof language may be redundant`,
      severity: 0.25,
      evidence: [
        `trust-related objections: ${totalObj}/${totalObjections} (${(ratio * 100).toFixed(1)}%)`,
        `promise contains proof language that may not be needed`,
      ],
    };
  }

  return undefined;
}

function detectFeedbackGaps(
  feedback: ConversionFeedback,
): PositioningGapDetail[] {
  const gaps: PositioningGapDetail[] = [];

  if (feedback.totalLeads < MIN_LEADS_FOR_FEEDBACK) {
    gaps.push({
      category: 'data_adequacy',
      description: `insufficient leads (${feedback.totalLeads} < ${MIN_LEADS_FOR_FEEDBACK}) for reliable positioning feedback`,
      severity: 0.1,
      evidence: [`total leads: ${feedback.totalLeads}`],
    });
    return gaps;
  }

  const lostTotal = Object.values(feedback.lostReasons).reduce((a, b) => a + b, 0);
  if (lostTotal > 0) {
    const expectationLost =
      (feedback.lostReasons['expectation'] ?? 0) +
      (feedback.lostReasons['fit'] ?? 0) +
      (feedback.lostReasons['not_what_i_thought'] ?? 0);
    const expectationRatio = expectationLost / lostTotal;

    if (expectationRatio >= GAP_SEVERITY_THRESHOLD) {
      gaps.push({
        category: 'expectation_mismatch',
        description: `${(expectationRatio * 100).toFixed(0)}% of lost leads cited expectation/positioning mismatch`,
        severity: Math.min(1.0, expectationRatio + 0.1),
        evidence: [
          `expectation-related losses: ${expectationLost}/${lostTotal} (${(expectationRatio * 100).toFixed(1)}%)`,
          `lost reasons: ${JSON.stringify(feedback.lostReasons)}`,
        ],
      });
    }
  }

  const refundTotal = Object.values(feedback.refundReasons).reduce((a, b) => a + b, 0);
  if (refundTotal > 0) {
    const mismatchRefunds =
      (feedback.refundReasons['not_as_described'] ?? 0) +
      (feedback.refundReasons['expectation'] ?? 0) +
      (feedback.refundReasons['misleading'] ?? 0);
    const mismatchRatio = mismatchRefunds / refundTotal;

    if (mismatchRatio >= GAP_SEVERITY_THRESHOLD) {
      gaps.push({
        category: 'refund_positioning',
        description: `${(mismatchRatio * 100).toFixed(0)}% of refunds cite mismatch between promise and delivery`,
        severity: Math.min(1.0, mismatchRatio + 0.05),
        evidence: [
          `mismatch-related refunds: ${mismatchRefunds}/${refundTotal} (${(mismatchRatio * 100).toFixed(1)}%)`,
        ],
      });
    }
  }

  return gaps;
}

function aggregateSeverity(gaps: readonly PositioningGapDetail[]): 'none' | 'minor' | 'moderate' | 'critical' {
  if (gaps.length === 0) {return 'none';}

  const maxSeverity = Math.max(...gaps.map((g) => g.severity));
  const avgSeverity = gaps.reduce((s, g) => s + g.severity, 0) / gaps.length;

  const score = maxSeverity * 0.6 + avgSeverity * 0.4;

  if (score >= CRITICAL_SEVERITY_THRESHOLD) {return 'critical';}
  if (score >= MODERATE_SEVERITY_THRESHOLD) {return 'moderate';}
  return 'minor';
}

export class PositioningMismatchDetector {
  public detect(
    promise: string,
    audienceProfile: AudienceProfile,
    conversionFeedback: ConversionFeedback,
  ): PositioningMismatchResult {
    const gaps: PositioningGapDetail[] = [
      ...detectPainPointGaps(promise, audienceProfile),
      ...detectPricePerceptionGap(promise, audienceProfile),
      ...detectFeedbackGaps(conversionFeedback),
    ];

    const trustGap = detectTrustGap(promise, conversionFeedback);
    if (trustGap) {
      gaps.push(trustGap);
    }

    const severity = aggregateSeverity(gaps);
    const hasMismatch = severity !== 'none';

    const evidence: string[] = gaps.flatMap((g) => g.evidence);
    evidence.push(`total gaps detected: ${gaps.length}`);

    const gapDescription = hasMismatch
      ? `positioning mismatch detected (severity: ${severity}) — ${gaps.length} gaps found across ${new Set(gaps.map((g) => g.category)).size} categories`
      : 'no significant positioning mismatch detected between promise and audience profile';

    const conf = hasMismatch
      ? Math.min(0.9, 0.35 + gaps.length * 0.15)
      : Math.max(0.5, 0.7 - conversionFeedback.totalLeads * 0.01);

    return {
      hasMismatch,
      gapDescription,
      severity,
      confidence: Math.round(conf * 100) / 100,
      evidence,
      gaps,
      computedAt: new Date().toISOString(),
    };
  }
}
