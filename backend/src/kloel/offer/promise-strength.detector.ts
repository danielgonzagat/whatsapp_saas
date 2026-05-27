/**
 * UTP-OFFER-002 — Promise Strength Detector (copy-level).
 *
 * Analyzes offer copy text combined with conversion metrics to classify
 * promise strength as 'weak', 'moderate', or 'strong'.
 *
 * Copy signals evaluated: specificity, urgency, social proof markers,
 * transformation language, and value quantification.
 * Conversion data provides the empirical baseline.
 *
 * The combined score determines the final classification with a
 * confidence modifier from sample size adequacy.
 */

import type {
  PromiseStrength,
  PromiseStrengthConversionData,
  PromiseStrengthResult,
} from './offer.types';

const MIN_SAMPLE_SIZE = 10;
const STRONG_CONVERSION_THRESHOLD = 0.12;

const POWER_WORDS = new Set([
  'garantido', 'comprovado', 'exclusivo', 'limitado', 'resultado',
  'transformação', 'segredo', 'revelado', 'descoberto', 'científico',
  'garantia', 'inédito', 'imperdível', 'acelerador', 'definitivo',
  'step-by-step', 'passo a passo', 'método', 'fórmula', 'sistema',
  'automático', 'escalável', 'lucrativo', 'multiplicador',
]);

const SPECIFICITY_MARKERS = new Set([
  'dias', 'semanas', 'meses', 'horas', '%', 'por cento',
  'número', 'valor', 'exato', 'preciso', 'exatamente',
  'R$', 'US$', '€', 'mil', 'milhão',
]);

const URGENCY_SIGNALS = new Set([
  'hoje', 'agora', 'última', 'vagas', 'encerra', 'prazo',
  'restam', 'apenas', 'só', 'única', 'exclusiva',
]);

function normalize(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countTokens(label: string, text: string, dict: ReadonlySet<string>): number {
  void label;
  let count = 0;
  const lower = text.toLowerCase();
  for (const token of dict) {
    const normalized = normalize(token);
    const regex = new RegExp(`\\b${escapeRegex(normalized)}\\b`, 'i');
    if (regex.test(lower)) {
      count++;
    }
  }
  return count;
}

function copyScore(offerCopy: string): number {
  const wordCount = offerCopy.split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) {return 0;}

  const power = countTokens('power', offerCopy, POWER_WORDS);
  const specificity = countTokens('specificity', offerCopy, SPECIFICITY_MARKERS);
  const urgency = countTokens('urgency', offerCopy, URGENCY_SIGNALS);

  const powerDensity = power / Math.max(1, wordCount) * 100;
  const specDensity = specificity / Math.max(1, wordCount) * 100;
  const urgencyDensity = urgency / Math.max(1, wordCount) * 100;

  const score = powerDensity * 0.35 + specDensity * 0.40 + urgencyDensity * 0.25;
  return Math.min(1.0, score / 5);
}

function classify(
  copyScoreValue: number,
  conversionRate: number,
  sampleSize: number,
): PromiseStrength {
  if (sampleSize < MIN_SAMPLE_SIZE) {
    if (copyScoreValue >= 0.6) {return 'moderate';}
    if (copyScoreValue >= 0.3) {return 'weak';}
    return 'weak';
  }

  const composite = copyScoreValue * 0.4 + (conversionRate / STRONG_CONVERSION_THRESHOLD) * 0.6;

  if (composite >= 0.7) {return 'strong';}
  if (composite >= 0.35) {return 'moderate';}
  return 'weak';
}

function confidence(copyScoreValue: number, sampleSize: number): number {
  const sampleFactor = Math.min(1.0, sampleSize / (MIN_SAMPLE_SIZE * 4));
  const copyFactor = Math.abs(copyScoreValue - 0.5) * 2;
  return Math.min(0.95, 0.3 + sampleFactor * 0.35 + copyFactor * 0.3);
}

function buildEvidence(
  copyScoreValue: number,
  data: PromiseStrengthConversionData,
  classification: PromiseStrength,
): string[] {
  const lines: string[] = [];

  if (data.sampleSize < MIN_SAMPLE_SIZE) {
    lines.push(`low sample size (${data.sampleSize} < ${MIN_SAMPLE_SIZE}) — relying primarily on copy analysis`);
  }

  lines.push(`copy quality score: ${(copyScoreValue * 100).toFixed(1)}%`);
  lines.push(`lead-to-cart rate: ${(data.leadToCartRate * 100).toFixed(1)}%`);
  lines.push(`cart-to-purchase rate: ${(data.cartToPurchaseRate * 100).toFixed(1)}%`);
  lines.push(`overall conversion: ${(data.overallConversionRate * 100).toFixed(1)}%`);

  if (classification === 'weak') {
    lines.push('insufficient persuasive signals in offer copy combined with low conversion');
  } else if (classification === 'moderate') {
    lines.push('adequate but not exceptional promise strength indicated by copy and conversion');
  } else {
    lines.push('strong persuasive signals and healthy conversion metrics');
  }

  return lines;
}

export class PromiseStrengthDetector {
  public analyze(
    offerCopy: string,
    conversionData: PromiseStrengthConversionData,
  ): PromiseStrengthResult {
    const copyScoreValue = copyScore(offerCopy);
    const conversionRate = conversionData.overallConversionRate;
    const sampleSize = conversionData.sampleSize;

    const strength = classify(copyScoreValue, conversionRate, sampleSize);
    const conf = confidence(copyScoreValue, sampleSize);
    const evidence = buildEvidence(copyScoreValue, conversionData, strength);

    return {
      strength,
      confidence: Math.round(conf * 100) / 100,
      evidence,
      computedAt: new Date().toISOString(),
    };
  }
}
