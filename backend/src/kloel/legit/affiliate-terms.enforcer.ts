/**
 * UTP-LEGIT-006 — Affiliate Terms Enforcer.
 *
 * Enforces affiliate marketing regulations (FTC, CONAR, LGPD).
 * Validates disclosure requirements, false scarcity claims,
 * fake results/testimonials, and income disclosure compliance.
 *
 * Pure function — stateless terms enforcement.
 */

import type { PolicyEnforcementInput, PolicyEnforcementResult, PolicyViolation } from './types';
import { AFFILIATE_REQUIRED_DISCLAIMERS, generateId } from './types';

export function enforceAffiliateTerms(input: PolicyEnforcementInput): PolicyEnforcementResult {
  const nowMs = input.nowMs ?? Date.now();
  const violations: PolicyViolation[] = [];
  const warnings: string[] = [];
  const lowerContent = input.content.toLowerCase();

  const isAffiliate = input.metadata?.['channel'] === 'affiliate';

  if (!isAffiliate) {
    return { allowed: true, violations: [], warnings: [], assessedAt: new Date(nowMs).toISOString() };
  }

  const hasDisclosure = lowerContent.includes('affiliate') || lowerContent.includes('afiliado');
  if (!hasDisclosure) {
    violations.push({
      violationId: generateId('aff_viol'),
      workspaceId: input.workspaceId,
      userId: input.userId,
      policyName: 'ftc_affiliate_disclosure',
      severity: 'critical',
      description: 'Affiliate content missing material connection disclosure — required by FTC and CONAR.',
      source: 'affiliate-terms.enforcer',
      evidence: ['missing_affiliate_disclosure'],
      detectedAt: new Date(nowMs).toISOString(),
      resolvedAt: null,
    });
  }

  if (
    lowerContent.includes('ultimas vagas') ||
    lowerContent.includes('so restam') ||
    lowerContent.includes('acabando')
  ) {
    violations.push({
      violationId: generateId('aff_viol'),
      workspaceId: input.workspaceId,
      userId: input.userId,
      policyName: 'affiliate_false_scarcity',
      severity: 'moderate',
      description: 'False scarcity claims detected — prohibited in affiliate marketing.',
      source: 'affiliate-terms.enforcer',
      evidence: ['false_scarcity'],
      detectedAt: new Date(nowMs).toISOString(),
      resolvedAt: null,
    });
  }

  if (lowerContent.includes('faturei') || lowerContent.includes('ganhei')) {
    const hasIncomeDisclaimer = lowerContent.includes('nao representa') || lowerContent.includes('resultados tipicos');
    if (!hasIncomeDisclaimer) {
      violations.push({
        violationId: generateId('aff_viol'),
        workspaceId: input.workspaceId,
        userId: input.userId,
        policyName: 'affiliate_income_disclosure',
        severity: 'severe',
        description: 'Income claims without disclaimer — required by FTC Endorsement Guides.',
        source: 'affiliate-terms.enforcer',
        evidence: ['missing_income_disclaimer'],
        detectedAt: new Date(nowMs).toISOString(),
        resolvedAt: null,
      });
    }
  }

  for (const disclaimer of AFFILIATE_REQUIRED_DISCLAIMERS) {
    const normalized = disclaimer.replace(/_/g, ' ');
    if (!lowerContent.includes(normalized.split('_')[0]!)) {
      warnings.push(`Recommended: add '${normalized}' disclosure.`);
    }
  }

  const allowed = violations.length === 0;

  return {
    allowed,
    violations,
    warnings,
    assessedAt: new Date(nowMs).toISOString(),
  };
}
