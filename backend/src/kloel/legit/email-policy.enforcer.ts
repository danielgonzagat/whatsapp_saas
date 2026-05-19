/**
 * UTP-LEGIT-004 — Email Policy Enforcer.
 *
 * Enforces CAN-SPAM (US) and LGPD email marketing rules.
 * Detects spam triggers, missing unsubscribe links,
 * misleading subject lines, and deceptive headers.
 *
 * Pure function — stateless policy enforcement.
 */

import type { PolicyEnforcementInput, PolicyEnforcementResult, PolicyViolation } from './types';
import { EMAIL_SPAM_TRIGGERS, containsAny, generateId } from './types';

export function enforceEmailPolicy(input: PolicyEnforcementInput): PolicyEnforcementResult {
  const nowMs = input.nowMs ?? Date.now();
  const violations: PolicyViolation[] = [];
  const warnings: string[] = [];

  const lowerContent = input.content.toLowerCase();
  const subject = input.metadata?.['subject'] ?? '';

  if (containsAny(subject, EMAIL_SPAM_TRIGGERS)) {
    violations.push({
      violationId: generateId('email_viol'),
      workspaceId: input.workspaceId,
      userId: input.userId,
      policyName: 'can_spam_act',
      severity: 'moderate',
      description: 'Subject line contains spam trigger words as defined by CAN-SPAM Act guidelines.',
      source: 'email-policy.enforcer',
      evidence: [`spam_subject:${subject}`],
      detectedAt: new Date(nowMs).toISOString(),
      resolvedAt: null,
    });
  }

  if (containsAny(input.content, EMAIL_SPAM_TRIGGERS)) {
    const matchedBody = EMAIL_SPAM_TRIGGERS.filter((t) => lowerContent.includes(t));
    if (matchedBody.length >= 3) {
      violations.push({
        violationId: generateId('email_viol'),
        workspaceId: input.workspaceId,
        userId: input.userId,
        policyName: 'can_spam_act',
        severity: 'minor',
        description: `Email body contains ${matchedBody.length} spam trigger patterns.`,
        source: 'email-policy.enforcer',
        evidence: matchedBody.map((t) => `spam_body:${t}`),
        detectedAt: new Date(nowMs).toISOString(),
        resolvedAt: null,
      });
    }
  }

  if (!lowerContent.includes('unsubscribe') && !lowerContent.includes('descadastrar')) {
    violations.push({
      violationId: generateId('email_viol'),
      workspaceId: input.workspaceId,
      userId: input.userId,
      policyName: 'can_spam_act',
      severity: 'critical',
      description: 'Email missing unsubscribe mechanism — required by CAN-SPAM and LGPD.',
      source: 'email-policy.enforcer',
      evidence: ['missing_unsubscribe'],
      detectedAt: new Date(nowMs).toISOString(),
      resolvedAt: null,
    });
  }

  const physicalAddress = input.metadata?.['physicalAddress'] ?? '';
  if (!physicalAddress) {
    warnings.push('Physical mailing address missing — required by CAN-SPAM for commercial emails.');
  }

  const fromName = input.metadata?.['fromName'] ?? '';
  if (fromName && fromName.includes('no-reply')) {
    warnings.push('Using no-reply@ sender — consider using a real reply-to address.');
  }

  const allowed = violations.length === 0;

  return {
    allowed,
    violations,
    warnings,
    assessedAt: new Date(nowMs).toISOString(),
  };
}
