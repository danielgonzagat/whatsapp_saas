/**
 * UTP-LEGIT-005 — Ads Policy Enforcer.
 *
 * Enforces advertising regulations (CONAR/ANVISA Brazil, FTC US).
 * Detects restricted categories, misleading claims, missing
 * disclaimers, and unauthorized health/financial claims.
 *
 * Pure function — stateless policy enforcement.
 */

import type { PolicyEnforcementInput, PolicyEnforcementResult, PolicyViolation } from './types';
import { ADS_RESTRICTED_CATEGORIES_BR, containsAny, generateId } from './types';

export function enforceAdsPolicy(input: PolicyEnforcementInput): PolicyEnforcementResult {
  const nowMs = input.nowMs ?? Date.now();
  const violations: PolicyViolation[] = [];
  const warnings: string[] = [];
  const lowerContent = input.content.toLowerCase();

  const matchedCategories = ADS_RESTRICTED_CATEGORIES_BR.filter(
    (cat) => containsAny(input.content, [cat]),
  );

  for (const category of matchedCategories) {
    violations.push({
      violationId: generateId('ad_viol'),
      workspaceId: input.workspaceId,
      userId: input.userId,
      policyName: 'conar_brazil',
      severity: category === 'medicamentos' || category === 'saude' ? 'critical' : 'moderate',
      description: `Ad content references restricted category '${category}' — requires regulatory compliance.`,
      source: 'ads-policy.enforcer',
      evidence: [`restricted_category:${category}`],
      detectedAt: new Date(nowMs).toISOString(),
      resolvedAt: null,
    });
  }

  const healthClaims = ['cura', 'tratamento', 'clinico', 'comprovado', 'medico', 'remedio', 'doenca'];
  const hasHealthClaim = healthClaims.some((claim) => lowerContent.includes(claim));
  const hasAnvisaRef = lowerContent.includes('anvisa');

  if (hasHealthClaim && !hasAnvisaRef) {
    violations.push({
      violationId: generateId('ad_viol'),
      workspaceId: input.workspaceId,
      userId: input.userId,
      policyName: 'anvisa_rdc_96_2008',
      severity: 'severe',
      description: 'Health claims detected without ANVISA reference — prohibited for non-regulated products.',
      source: 'ads-policy.enforcer',
      evidence: ['health_claim_without_anvisa'],
      detectedAt: new Date(nowMs).toISOString(),
      resolvedAt: null,
    });
  }

  if (lowerContent.includes('garantia') && lowerContent.includes('dinheiro')) {
    warnings.push('Money-back guarantee claims require clear terms disclosure.');
  }

  if (lowerContent.includes('melhor') || lowerContent.includes('numero 1')) {
    warnings.push('Superlative claims ("best", "#1") require substantiation.');
  }

  if (lowerContent.includes('gratis') && lowerContent.includes('comprar')) {
    warnings.push('Ambiguous free/paid distinction — clarify terms.');
  }

  const allowed = violations.length === 0;

  return {
    allowed,
    violations,
    warnings,
    assessedAt: new Date(nowMs).toISOString(),
  };
}
