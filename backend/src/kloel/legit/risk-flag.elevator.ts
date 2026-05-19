/**
 * UTP-LEGIT-011 — Risk Flag Elevator.
 *
 * Evaluates risk flags and determines if elevation to legal
 * team is required. Classifies by category (LGPD/GDPR/CCPA,
 * WhatsApp, Email, Ads, Affiliate, Commercial Promise,
 * Regulated Content, Image Rights, Data Breach, Legal Threat,
 * Regulatory Notice) and recommends action.
 *
 * Pure function — stateless risk flag elevation logic.
 */

import type { RiskFlagInput, RiskFlagResult } from './types';
import { generateId } from './types';

function requiresElevation(
  category: string,
  severity: string,
): boolean {
  if (severity === 'critical' || severity === 'severe') {
    return true;
  }
  const elevatedCategories = [
    'lgpd_violation',
    'gdpr_violation',
    'data_breach',
    'legal_threat',
    'regulatory_notice',
  ];
  return elevatedCategories.includes(category) && severity !== 'warning';
}

function recommendAction(
  category: string,
  severity: string,
): string {
  if (severity === 'critical') {
    return `CRITICAL: ${category} requires immediate legal review and possible content takedown.`;
  }
  if (severity === 'severe') {
    return `HIGH: ${category} should be escalated to legal within 24 hours.`;
  }
  if (severity === 'moderate') {
    return `MEDIUM: ${category} should be reviewed within 5 business days.`;
  }
  return `LOW: ${category} logged for audit trail — no immediate action required.`;
}

export function elevateRiskFlag(input: RiskFlagInput): RiskFlagResult {
  const nowMs = input.nowMs ?? Date.now();
  const needsElevation = requiresElevation(input.category, input.severity);
  const recommendedAction = recommendAction(input.category, input.severity);

  const flag = {
    flagId: generateId('risk'),
    workspaceId: input.workspaceId,
    category: input.category,
    severity: input.severity,
    description: input.description,
    sourceEvent: input.sourceEvent,
    affectedResources: input.affectedResources,
    status: needsElevation ? 'escalated' as const : 'open' as const,
    assignedTo: null,
    escalatedAt: needsElevation ? new Date(nowMs).toISOString() : null,
    resolvedAt: null,
    createdAt: new Date(nowMs).toISOString(),
  };

  return {
    flag,
    requiresElevation: needsElevation,
    recommendedAction,
    assessedAt: new Date(nowMs).toISOString(),
  };
}
