import { assessPrivacyCompliance } from './privacy-compliance.engine';
import { manageConsent } from './consent.ledger';
import { enforceWhatsappPolicy } from './whatsapp-policy.enforcer';
import { enforceEmailPolicy } from './email-policy.enforcer';
import { enforceAdsPolicy } from './ads-policy.enforcer';
import { enforceAffiliateTerms } from './affiliate-terms.enforcer';
import { guardCommercialPromise } from './commercial-promise.guard';
import { detectRegulatedContent } from './regulated-content.detector';
import { checkImageRights } from './image-rights.checker';
import { watchPolicyUpdate } from './policy-update.watcher';
import { elevateRiskFlag } from './risk-flag.elevator';
import { applyBlockWithJustification } from './block-with-justification.service';
import { triggerLegalConsult } from './legal-consult.trigger';
import type {
  BlockInput,
  CommercialPromiseInput,
  ConsentInput,
  ImageRightsInput,
  LegalConsultInput,
  PolicyEnforcementInput,
  PolicyUpdateInput,
  PrivacyComplianceInput,
  RegulatedContentInput,
  RiskFlagInput,
} from './types';

const NOW = Date.parse('2026-05-14T12:00:00.000Z');
const WKS = 'wks_legit_test';
const USR = 'usr_legit_test';

// =========================================================================
// LEGIT-001 — Privacy Compliance Engine
// =========================================================================
describe('LEGIT-013 — triggerLegalConsult', () => {
  it('triggers emergency consult', () => {
    const input: LegalConsultInput = {
      workspaceId: WKS,
      urgency: 'emergency',
      subject: 'Data breach detected',
      context: 'Personal data of 500 users exposed.',
      affectedPolicies: ['lgpd_compliance', 'gdpr_compliance'],
      evidence: ['access_log', 'exposed_endpoint'],
      nowMs: NOW,
    };
    const result = triggerLegalConsult(input);
    expect(result.requiresImmediateAction).toBe(true);
    expect(result.consult.urgency).toBe('emergency');
    expect(result.consult.affectedPolicies).toContain('lgpd_compliance');
  });

  it('files routine consult without immediate action', () => {
    const input: LegalConsultInput = {
      workspaceId: WKS,
      urgency: 'routine',
      subject: 'Policy review request',
      context: 'Review new affiliate terms.',
      affectedPolicies: ['affiliate_terms'],
      evidence: ['draft_terms'],
      nowMs: NOW,
    };
    const result = triggerLegalConsult(input);
    expect(result.requiresImmediateAction).toBe(false);
    expect(result.recommendedAction).toContain('5 business days');
  });
});
