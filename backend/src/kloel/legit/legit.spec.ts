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
describe('LEGIT-001 — assessPrivacyCompliance', () => {
  it('returns compliant for explicit consent under LGPD', () => {
    const input: PrivacyComplianceInput = {
      workspaceId: WKS,
      jurisdiction: 'BR',
      hasConsent: true,
      consentBasis: 'explicit',
      dataSubjectRequest: null,
      dataExported: false,
      dataDeleted: false,
      processingJustification: 'Processamento necessario para entrega do servico contratado.',
      nowMs: NOW,
    };
    const result = assessPrivacyCompliance(input);
    expect(result.compliant).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('returns critical violation for GDPR without consent', () => {
    const input: PrivacyComplianceInput = {
      workspaceId: WKS,
      jurisdiction: 'EU',
      hasConsent: false,
      consentBasis: null,
      dataSubjectRequest: null,
      dataExported: false,
      dataDeleted: false,
      processingJustification: null,
      nowMs: NOW,
    };
    const result = assessPrivacyCompliance(input);
    expect(result.compliant).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]!.severity).toBe('critical');
    expect(result.requiredActions).toContain('obtain_explicit_consent');
  });

  it('returns moderate violation for weak consent basis under LGPD', () => {
    const input: PrivacyComplianceInput = {
      workspaceId: WKS,
      jurisdiction: 'BR',
      hasConsent: true,
      consentBasis: 'legitimate_interest',
      dataSubjectRequest: null,
      dataExported: false,
      dataDeleted: false,
      processingJustification: 'Interesse legitimo.',
      nowMs: NOW,
    };
    const result = assessPrivacyCompliance(input);
    expect(result.compliant).toBe(false);
    expect(result.violations[0]!.severity).toBe('moderate');
  });

  it('passes CCPA without consent requirement', () => {
    const input: PrivacyComplianceInput = {
      workspaceId: WKS,
      jurisdiction: 'US',
      hasConsent: false,
      consentBasis: null,
      dataSubjectRequest: null,
      dataExported: false,
      dataDeleted: false,
      processingJustification: null,
      nowMs: NOW,
    };
    const result = assessPrivacyCompliance(input);
    expect(result.compliant).toBe(true);
  });
});

// =========================================================================
// LEGIT-002 — Consent Ledger
// =========================================================================
describe('LEGIT-002 — manageConsent', () => {
  it('grants consent with expiry for explicit basis', () => {
    const input: ConsentInput = {
      workspaceId: WKS,
      userId: USR,
      purpose: 'marketing_communication',
      basis: 'explicit',
      jurisdiction: 'BR',
      action: 'grant',
      nowMs: NOW,
    };
    const result = manageConsent(input);
    expect(result.success).toBe(true);
    expect(result.record.status).toBe('granted');
    expect(result.record.expiresAt).not.toBeNull();
    expect(result.record.evidenceHash).toMatch(/^ev_/);
  });

  it('withdraws consent and clears expiry', () => {
    const input: ConsentInput = {
      workspaceId: WKS,
      userId: USR,
      purpose: 'marketing_communication',
      basis: 'explicit',
      jurisdiction: 'BR',
      action: 'withdraw',
      nowMs: NOW,
    };
    const result = manageConsent(input);
    expect(result.success).toBe(true);
    expect(result.record.status).toBe('withdrawn');
    expect(result.record.expiresAt).toBeNull();
    expect(result.record.withdrawnAt).not.toBeNull();
  });

  it('generates different evidence hashes for different inputs', () => {
    const a: ConsentInput = {
      workspaceId: WKS,
      userId: 'user_a',
      purpose: 'marketing',
      basis: 'explicit',
      jurisdiction: 'BR',
      action: 'grant',
      nowMs: NOW,
    };
    const b: ConsentInput = {
      workspaceId: WKS,
      userId: 'user_b',
      purpose: 'marketing',
      basis: 'explicit',
      jurisdiction: 'BR',
      action: 'grant',
      nowMs: NOW,
    };
    expect(manageConsent(a).record.evidenceHash).not.toBe(manageConsent(b).record.evidenceHash);
  });
});

// =========================================================================
// LEGIT-003 — WhatsApp Policy Enforcer
// =========================================================================
describe('LEGIT-003 — enforceWhatsappPolicy', () => {
  it('allows clean content', () => {
    const input: PolicyEnforcementInput = {
      workspaceId: WKS,
      userId: USR,
      content: 'Ola, como posso ajudar?',
      nowMs: NOW,
    };
    const result = enforceWhatsappPolicy(input);
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('rejects spam content', () => {
    const input: PolicyEnforcementInput = {
      workspaceId: WKS,
      userId: USR,
      content: 'spam message bulk_unsolicited',
      nowMs: NOW,
    };
    const result = enforceWhatsappPolicy(input);
    expect(result.allowed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  it('warns on HTTP links', () => {
    const input: PolicyEnforcementInput = {
      workspaceId: WKS,
      userId: USR,
      content: 'Veja mais em http://example.com',
      nowMs: NOW,
    };
    const result = enforceWhatsappPolicy(input);
    expect(result.warnings).toContain('WhatsApp recommends HTTPS links only.');
  });

  it('warns on excessive CAPS', () => {
    const input: PolicyEnforcementInput = {
      workspaceId: WKS,
      userId: USR,
      content: 'PROMOCAO IMPERDIVEL APROVEITE AGORA GARANTA JA COMPRE LOGO',
      nowMs: NOW,
    };
    const result = enforceWhatsappPolicy(input);
    expect(result.warnings).toContain('Excessive CAPS detected — may be perceived as aggressive.');
  });
});

// =========================================================================
// LEGIT-004 — Email Policy Enforcer
// =========================================================================
describe('LEGIT-004 — enforceEmailPolicy', () => {
  it('allows clean email', () => {
    const input: PolicyEnforcementInput = {
      workspaceId: WKS,
      userId: USR,
      content: 'Obrigado pela sua compra. Clique aqui para unsubscribe.',
      metadata: { subject: 'Confirmacao de pedido', physicalAddress: 'Rua Exemplo, 123' },
      nowMs: NOW,
    };
    const result = enforceEmailPolicy(input);
    expect(result.allowed).toBe(true);
  });

  it('rejects email without unsubscribe link', () => {
    const input: PolicyEnforcementInput = {
      workspaceId: WKS,
      userId: USR,
      content: 'Oferta especial para voce!',
      metadata: { subject: 'Oferta' },
      nowMs: NOW,
    };
    const result = enforceEmailPolicy(input);
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.evidence.includes('missing_unsubscribe'))).toBe(true);
  });

  it('flags spam subject line', () => {
    const input: PolicyEnforcementInput = {
      workspaceId: WKS,
      userId: USR,
      content: 'Confira nossas ofertas — unsubscribe aqui.',
      metadata: { subject: 'ACT NOW limited time exclusive offer!!!', physicalAddress: 'Rua X, 1' },
      nowMs: NOW,
    };
    const result = enforceEmailPolicy(input);
    expect(result.violations.some((v) => v.evidence.some((e) => e.startsWith('spam_subject')))).toBe(true);
  });
});

// =========================================================================
// LEGIT-005 — Ads Policy Enforcer
// =========================================================================
describe('LEGIT-005 — enforceAdsPolicy', () => {
  it('allows clean ad content', () => {
    const input: PolicyEnforcementInput = {
      workspaceId: WKS,
      userId: USR,
      content: 'Conheca nosso novo produto.',
      nowMs: NOW,
    };
    const result = enforceAdsPolicy(input);
    expect(result.allowed).toBe(true);
  });

  it('flags health claims without ANVISA', () => {
    const input: PolicyEnforcementInput = {
      workspaceId: WKS,
      userId: USR,
      content: 'Este produto cura doencas comprovado clinicamente.',
      nowMs: NOW,
    };
    const result = enforceAdsPolicy(input);
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.evidence.includes('health_claim_without_anvisa'))).toBe(true);
  });
});

// =========================================================================
// LEGIT-006 — Affiliate Terms Enforcer
// =========================================================================
describe('LEGIT-006 — enforceAffiliateTerms', () => {
  it('passes non-affiliate content', () => {
    const input: PolicyEnforcementInput = {
      workspaceId: WKS,
      userId: USR,
      content: 'Produto incrivel!',
      metadata: { channel: 'direct' },
      nowMs: NOW,
    };
    const result = enforceAffiliateTerms(input);
    expect(result.allowed).toBe(true);
  });

  it('rejects affiliate content without disclosure', () => {
    const input: PolicyEnforcementInput = {
      workspaceId: WKS,
      userId: USR,
      content: 'Compre agora! Ultimas vagas!',
      metadata: { channel: 'affiliate' },
      nowMs: NOW,
    };
    const result = enforceAffiliateTerms(input);
    expect(result.allowed).toBe(false);
  });

  it('rejects false scarcity in affiliate content', () => {
    const input: PolicyEnforcementInput = {
      workspaceId: WKS,
      userId: USR,
      content: 'Link de afiliado — so restam 2 vagas!',
      metadata: { channel: 'affiliate' },
      nowMs: NOW,
    };
    const result = enforceAffiliateTerms(input);
    expect(result.violations.some((v) => v.evidence.includes('false_scarcity'))).toBe(true);
  });
});

// =========================================================================
// LEGIT-007 — Commercial Promise Guard
// =========================================================================