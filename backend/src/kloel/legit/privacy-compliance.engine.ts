/**
 * UTP-LEGIT-001 — Privacy Compliance Engine.
 *
 * Checks compliance with LGPD (Brazil), GDPR (EU), and CCPA (California).
 * Validates consent basis, data subject rights handling, data export,
 * data deletion, and processing justification.
 *
 * Pure function — stateless compliance evaluation.
 */

import type {
  DataSubjectRight,
  Jurisdiction,
  PolicyViolation,
  PrivacyComplianceInput,
  PrivacyComplianceResult,
} from './types';
import {
  CCPA_REQUIRED_DISCLOSURES,
  GDPR_REQUIRED_CONSENT_PURPOSES,
  LGPD_REQUIRED_CONSENT_PURPOSES,
  generateId,
} from './types';

function requiredConsentPurposes(jurisdiction: Jurisdiction): readonly string[] {
  switch (jurisdiction) {
    case 'BR':
      return LGPD_REQUIRED_CONSENT_PURPOSES;
    case 'EU':
    case 'UK':
      return GDPR_REQUIRED_CONSENT_PURPOSES;
    case 'US':
      return [];
    default:
      return GDPR_REQUIRED_CONSENT_PURPOSES;
  }
}

function requiresConsentForJurisdiction(jurisdiction: Jurisdiction): boolean {
  return jurisdiction === 'BR' || jurisdiction === 'EU' || jurisdiction === 'UK';
}

function validateDataSubjectRight(
  right: DataSubjectRight | null,
  jurisdiction: Jurisdiction,
): readonly PolicyViolation[] {
  const violations: PolicyViolation[] = [];

  if (!right) {
    return violations;
  }

  const supportedRightsBR: readonly DataSubjectRight[] = [
    'access',
    'rectification',
    'erasure',
    'portability',
    'objection',
    'automated_decision',
  ];

  const supportedRightsEU: readonly DataSubjectRight[] = [
    ...supportedRightsBR,
    'restriction',
  ];

  const supportedRightsUS: readonly DataSubjectRight[] = ['access', 'erasure'];

  let supported: readonly DataSubjectRight[];
  switch (jurisdiction) {
    case 'BR':
      supported = supportedRightsBR;
      break;
    case 'EU':
    case 'UK':
      supported = supportedRightsEU;
      break;
    case 'US':
      supported = supportedRightsUS;
      break;
    default:
      supported = supportedRightsEU;
  }

  if (!supported.includes(right)) {
    violations.push({
      violationId: generateId('viol'),
      workspaceId: '',
      userId: null,
      policyName: `${jurisdiction}_data_subject_rights`,
      severity: 'severe',
      description: `Data subject right '${right}' is not recognized in jurisdiction ${jurisdiction}.`,
      source: 'privacy-compliance.engine',
      evidence: [`unsupported_right:${right}`],
      detectedAt: new Date().toISOString(),
      resolvedAt: null,
    });
  }

  return violations;
}

export function assessPrivacyCompliance(input: PrivacyComplianceInput): PrivacyComplianceResult {
  const nowMs = input.nowMs ?? Date.now();
  const violations: PolicyViolation[] = [];
  const requiredActions: string[] = [];

  const needsConsent = requiresConsentForJurisdiction(input.jurisdiction);

  if (needsConsent && !input.hasConsent) {
    violations.push({
      violationId: generateId('viol'),
      workspaceId: input.workspaceId,
      userId: null,
      policyName: `${input.jurisdiction}_consent_required`,
      severity: 'critical',
      description: `Consent is required under ${input.jurisdiction} but has not been granted.`,
      source: 'privacy-compliance.engine',
      evidence: ['missing_consent'],
      detectedAt: new Date(nowMs).toISOString(),
      resolvedAt: null,
    });
    requiredActions.push('obtain_explicit_consent');
  }

  if (input.consentBasis && !['explicit', 'contractual', 'legal_obligation'].includes(input.consentBasis)) {
    violations.push({
      violationId: generateId('viol'),
      workspaceId: input.workspaceId,
      userId: null,
      policyName: `${input.jurisdiction}_consent_basis`,
      severity: 'moderate',
      description: `Consent basis '${input.consentBasis}' may be insufficient under ${input.jurisdiction}.`,
      source: 'privacy-compliance.engine',
      evidence: [`weak_basis:${input.consentBasis}`],
      detectedAt: new Date(nowMs).toISOString(),
      resolvedAt: null,
    });
    requiredActions.push('review_consent_basis');
  }

  const rightViolations = validateDataSubjectRight(input.dataSubjectRequest, input.jurisdiction);
  violations.push(...rightViolations);

  if (input.dataExported && !input.dataDeleted && input.dataSubjectRequest === 'erasure') {
    requiredActions.push('complete_data_deletion');
  }

  if (!input.processingJustification && needsConsent) {
    requiredActions.push('document_processing_justification');
  }

  const requiredDisclosures =
    input.jurisdiction === 'US' ? CCPA_REQUIRED_DISCLOSURES : [];

  const compliant = violations.length === 0;

  return {
    compliant,
    violations,
    requiredActions: [...requiredActions, ...requiredDisclosures],
    assessedAt: new Date(nowMs).toISOString(),
  };
}
