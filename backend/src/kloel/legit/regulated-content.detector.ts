/**
 * UTP-LEGIT-008 — Regulated Content Detector.
 *
 * Detects content that falls under regulated categories:
 * health claims, financial advice, legal advice, medical devices,
 * pharmaceuticals, tobacco, alcohol, gambling, adult content,
 * crypto advice, political content, hate speech, restricted products.
 *
 * Pure function — stateless regulated content classification.
 */

import type {
  PolicyViolation,
  RegulatedCategory,
  RegulatedContentInput,
  RegulatedContentResult,
} from './types';
import { REGULATED_CONTENT_DISCLAIMERS, generateId } from './types';

const CATEGORY_KEYWORDS: Readonly<Record<RegulatedCategory, readonly string[]>> = {
  health_claims: ['cura', 'tratamento', 'doenca', 'saude', 'emagrecimento', 'clinico', 'medico'],
  financial_advice: ['investimento', 'acoes', 'renda fixa', 'day trade', 'forex', 'criptomoeda', 'lucro'],
  legal_advice: ['juridico', 'advogado', 'processo', 'lei', 'direito', 'constituicao'],
  medical_device: ['dispositivo medico', 'aparelho', 'protese', 'implante', 'ortodontico'],
  pharmaceutical: ['medicamento', 'remedio', 'farmaco', 'droga', 'prescricao', 'dose'],
  tobacco: ['cigarro', 'tabaco', 'nicotina', 'vape', 'fumo', 'charuto'],
  alcohol: ['cerveja', 'vinho', 'whisky', 'vodka', 'bebida alcoolica', 'drink'],
  gambling: ['aposta', 'cassino', 'loteria', 'bingo', 'jogo de azar', 'bet'],
  adult_content: ['conteudo adulto', '+18', 'sensual', 'erotico'],
  crypto_advice: ['bitcoin', 'ethereum', 'nft', 'token', 'defi', 'blockchain investimento'],
  political: ['eleicao', 'candidato', 'partido', 'voto', 'politica', 'governo'],
  hate_speech: ['odio', 'discriminacao', 'raca', 'genero', 'xenofobia'],
  restricted_product: ['produto controlado', 'arma', 'explosivo', 'substancia proibida'],
};

export function detectRegulatedContent(
  input: RegulatedContentInput,
): RegulatedContentResult {
  const nowMs = input.nowMs ?? Date.now();
  const violations: PolicyViolation[] = [];
  const lowerContent = input.content.toLowerCase();

  const matchedCategories: RegulatedCategory[] = [];

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<
    [RegulatedCategory, readonly string[]]
  >) {
    const matchCount = keywords.filter((kw) => lowerContent.includes(kw)).length;
    if (matchCount >= 2 || (keywords.length === 1 && matchCount >= 1)) {
      matchedCategories.push(category);

      violations.push({
        violationId: generateId('reg_viol'),
        workspaceId: input.workspaceId,
        userId: null,
        policyName: 'regulated_content_detection',
        severity: category === 'hate_speech' ? 'critical' : 'moderate',
        description: `Content matches regulated category '${category}' — requires compliance review.`,
        source: 'regulated-content.detector',
        evidence: [`category:${category}`, `match_count:${matchCount}`],
        detectedAt: new Date(nowMs).toISOString(),
        resolvedAt: null,
      });
    }
  }

  const requiresApproval = matchedCategories.length >= 2 || lowerContent.includes('saude');
  const requiresDisclaimer = matchedCategories.length > 0;

  let disclaimerText: string | null = null;
  if (requiresDisclaimer && matchedCategories.length > 0) {
    disclaimerText = matchedCategories
      .map((cat) => REGULATED_CONTENT_DISCLAIMERS[cat])
      .filter(Boolean)
      .join('\n');
  }

  const regulated = matchedCategories.length > 0;

  return {
    regulated,
    categories: matchedCategories,
    requiresApproval,
    requiresDisclaimer,
    disclaimerText,
    violations,
    assessedAt: new Date(nowMs).toISOString(),
  };
}
