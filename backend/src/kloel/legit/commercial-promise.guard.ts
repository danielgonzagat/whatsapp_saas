/**
 * UTP-LEGIT-007 — Commercial Promise Guard.
 *
 * Guards against unsubstantiated commercial claims.
 * Detects red-flag promises: guaranteed results, easy money,
 * quick enrichment, false before/after, fake testimonials.
 *
 * Pure function — stateless promise validation.
 */

import type {
  CommercialPromiseInput,
  CommercialPromiseResult,
  PolicyViolation,
  PolicyViolationSeverity,
} from './types';
import { COMMERCIAL_PROMISE_RED_FLAGS, containsAny, generateId } from './types';

function assessPromiseSeverity(
  redFlagCount: number,
  hasEvidence: boolean,
): PolicyViolationSeverity {
  if (redFlagCount === 0) {
    return 'warning';
  }
  if (redFlagCount === 1 && hasEvidence) {
    return 'minor';
  }
  if (redFlagCount <= 2) {
    return 'moderate';
  }
  if (redFlagCount <= 4) {
    return 'severe';
  }
  return 'critical';
}

export function guardCommercialPromise(
  input: CommercialPromiseInput,
): CommercialPromiseResult {
  const nowMs = input.nowMs ?? Date.now();
  const violations: PolicyViolation[] = [];
  const disclaimers: string[] = [];
  const requiredEvidence: string[] = [];

  const matchedFlags = COMMERCIAL_PROMISE_RED_FLAGS.filter((flag) =>
    containsAny(input.claim, [flag]),
  );

  for (const flag of matchedFlags) {
    violations.push({
      violationId: generateId('promise_viol'),
      workspaceId: input.workspaceId,
      userId: input.userId,
      policyName: 'commercial_promise_substantiation',
      severity: 'severe',
      description: `Commercial claim contains red-flag pattern '${flag}' — requires substantiation.`,
      source: 'commercial-promise.guard',
      evidence: [`red_flag:${flag}`],
      detectedAt: new Date(nowMs).toISOString(),
      resolvedAt: null,
    });
  }

  const hasEvidence = input.evidenceUrls.length > 0;
  const substantiated = matchedFlags.length === 0 || (hasEvidence && matchedFlags.length <= 1);
  const riskLevel = assessPromiseSeverity(matchedFlags.length, hasEvidence);

  if (!hasEvidence && matchedFlags.length > 0) {
    requiredEvidence.push('study_or_research', 'testimonial_with_consent', 'data_source');
    disclaimers.push('Resultados podem variar.', 'Este nao e um resultado tipico.');
  }

  if (input.productCategory === 'health' || input.productCategory === 'finance') {
    disclaimers.push('Consulte um profissional antes de tomar decisoes baseadas neste conteudo.');
  }

  if (matchedFlags.length >= 3) {
    disclaimers.push('Esta promessa requer revisao juridica antes de publicacao.');
  }

  return {
    substantiated,
    riskLevel,
    requiredEvidence,
    disclaimers,
    violations,
    assessedAt: new Date(nowMs).toISOString(),
  };
}
