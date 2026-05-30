import { triggerLegalConsult } from './legal-consult.trigger';
import type { LegalConsultInput } from './types';

const NOW = Date.parse('2026-05-14T12:00:00.000Z');
const WKS = 'wks_legit_test';

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
