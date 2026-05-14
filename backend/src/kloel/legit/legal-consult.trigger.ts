/**
 * UTP-LEGIT-013 — Legal Consult Trigger.
 *
 * Determines when legal consultation is required and generates
 * a structured consult record for routing to legal team.
 * Classifies urgency (routine, elevated, urgent, emergency)
 * and recommends immediate actions when warranted.
 *
 * Pure function — stateless legal consult generation.
 */

import type { LegalConsultInput, LegalConsultResult } from './types';
import { generateId } from './types';

function determineImmediateAction(
  urgency: string,
  affectedPolicies: readonly string[],
): string {
  if (urgency === 'emergency') {
    return 'EMERGENCY: Stop affected operations immediately. Legal team must respond within 2 hours.';
  }
  if (urgency === 'urgent') {
    return 'URGENT: Escalate to legal team within 4 hours. Prepare compliance brief.';
  }
  if (urgency === 'elevated') {
    return 'Schedule legal review within 24 hours. Begin gathering evidence.';
  }
  return 'File consult for next legal review cycle (within 5 business days).';
}

export function triggerLegalConsult(input: LegalConsultInput): LegalConsultResult {
  const nowMs = input.nowMs ?? Date.now();
  const requiresImmediateAction = input.urgency === 'emergency' || input.urgency === 'urgent';
  const recommendedAction = determineImmediateAction(input.urgency, input.affectedPolicies);

  const consult = {
    consultId: generateId('legal'),
    workspaceId: input.workspaceId,
    urgency: input.urgency,
    subject: input.subject,
    context: input.context,
    affectedPolicies: input.affectedPolicies,
    evidence: input.evidence,
    recommendedAction,
    triggeredAt: new Date(nowMs).toISOString(),
    resolvedAt: null,
  };

  return {
    consult,
    requiresImmediateAction,
    recommendedAction,
    assessedAt: new Date(nowMs).toISOString(),
  };
}
