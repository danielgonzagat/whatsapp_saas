/**
 * UTP-LEGIT-003 — WhatsApp Policy Enforcer.
 *
 * Enforces WhatsApp Commerce & Business policy rules.
 * Detects forbidden content patterns: spam, bulk unsolicited,
 * scraping, impersonation, illegal products, adult services,
 * gambling, MLM, payday loans, etc.
 *
 * Pure function — stateless policy enforcement.
 */

import type { PolicyEnforcementInput, PolicyEnforcementResult, PolicyViolation } from './types';
import { WHATSAPP_FORBIDDEN_CONTENT_PATTERNS, containsAny, generateId } from './types';

export function enforceWhatsappPolicy(input: PolicyEnforcementInput): PolicyEnforcementResult {
  const nowMs = input.nowMs ?? Date.now();
  const violations: PolicyViolation[] = [];
  const warnings: string[] = [];

  const lowerContent = input.content.toLowerCase();
  const matchedPatterns = WHATSAPP_FORBIDDEN_CONTENT_PATTERNS.filter(
    (pattern) => containsAny(input.content, [pattern]),
  );

  for (const pattern of matchedPatterns) {
    violations.push({
      violationId: generateId('wp_viol'),
      workspaceId: input.workspaceId,
      userId: input.userId,
      policyName: 'whatsapp_commerce_policy',
      severity: pattern === 'child_exploitation' || pattern === 'violence_incitement' ? 'critical' : 'severe',
      description: `Content contains forbidden pattern '${pattern}' as per WhatsApp Commerce Policy.`,
      source: 'whatsapp-policy.enforcer',
      evidence: [`matched_pattern:${pattern}`],
      detectedAt: new Date(nowMs).toISOString(),
      resolvedAt: null,
    });
  }

  if (lowerContent.length > 4096) {
    warnings.push('Message exceeds WhatsApp 4096 character limit.');
  }

  if (lowerContent.includes('http://') && !lowerContent.includes('https://')) {
    warnings.push('WhatsApp recommends HTTPS links only.');
  }

  if (/[*_~`]{4,}/.test(input.content)) {
    warnings.push('Excessive formatting detected — may trigger spam filter.');
  }

  if (input.content.split(/\s+/).filter((w) => w === w.toUpperCase() && w.length > 3).length > 5) {
    warnings.push('Excessive CAPS detected — may be perceived as aggressive.');
  }

  const allowed = violations.length === 0;

  return {
    allowed,
    violations,
    warnings,
    assessedAt: new Date(nowMs).toISOString(),
  };
}
