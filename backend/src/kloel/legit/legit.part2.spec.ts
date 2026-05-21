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
describe('LEGIT-007 — guardCommercialPromise', () => {
  it('substantiates clean promise', () => {
    const input: CommercialPromiseInput = {
      workspaceId: WKS,
      userId: USR,
      claim: 'Nosso produto ajuda voce a se organizar.',
      evidenceUrls: [],
      jurisdiction: 'BR',
      productCategory: 'productivity',
      nowMs: NOW,
    };
    const result = guardCommercialPromise(input);
    expect(result.substantiated).toBe(true);
    expect(result.riskLevel).toBe('warning');
  });

  it('rejects guaranteed results claim without evidence', () => {
    const input: CommercialPromiseInput = {
      workspaceId: WKS,
      userId: USR,
      claim: 'Resultados garantidos em 7 dias! Dinheiro facil sem esforco.',
      evidenceUrls: [],
      jurisdiction: 'BR',
      productCategory: 'marketing',
      nowMs: NOW,
    };
    const result = guardCommercialPromise(input);
    expect(result.substantiated).toBe(false);
    expect(result.requiredEvidence.length).toBeGreaterThan(0);
  });

  it('adds health disclaimers for health category', () => {
    const input: CommercialPromiseInput = {
      workspaceId: WKS,
      userId: USR,
      claim: 'Produto comprovado cientificamente.',
      evidenceUrls: [],
      jurisdiction: 'BR',
      productCategory: 'health',
      nowMs: NOW,
    };
    const result = guardCommercialPromise(input);
    expect(result.disclaimers.some((d) => d.includes('profissional'))).toBe(true);
  });
});

// =========================================================================
// LEGIT-008 — Regulated Content Detector
// =========================================================================
describe('LEGIT-008 — detectRegulatedContent', () => {
  it('passes normal content', () => {
    const input: RegulatedContentInput = {
      workspaceId: WKS,
      content: 'Dicas de produtividade para o dia a dia.',
      contentType: 'article',
      jurisdiction: 'BR',
      targetAudience: 'general',
      nowMs: NOW,
    };
    const result = detectRegulatedContent(input);
    expect(result.regulated).toBe(false);
    expect(result.categories).toHaveLength(0);
  });

  it('detects health claims content', () => {
    const input: RegulatedContentInput = {
      workspaceId: WKS,
      content: 'Tratamento para doenca com composto clinico aprovado por medicos.',
      contentType: 'product_page',
      jurisdiction: 'BR',
      targetAudience: 'general',
      nowMs: NOW,
    };
    const result = detectRegulatedContent(input);
    expect(result.regulated).toBe(true);
    expect(result.categories).toContain('health_claims');
  });

  it('produces disclaimer text for regulated content', () => {
    const input: RegulatedContentInput = {
      workspaceId: WKS,
      content: 'Invista em bitcoin e ethereum para obter lucro.',
      contentType: 'article',
      jurisdiction: 'BR',
      targetAudience: 'general',
      nowMs: NOW,
    };
    const result = detectRegulatedContent(input);
    expect(result.requiresDisclaimer).toBe(true);
    expect(result.disclaimerText).not.toBeNull();
  });
});

// =========================================================================
// LEGIT-009 — Image Rights Checker
// =========================================================================
describe('LEGIT-009 — checkImageRights', () => {
  it('verifies stock image with license', () => {
    const input: ImageRightsInput = {
      workspaceId: WKS,
      imageUrl: 'https://cdn.example.com/photo.jpg',
      source: 'stock',
      licenseRef: 'unsplash-license-v1',
      attribution: null,
      licensee: null,
      expiresAt: null,
      nowMs: NOW,
    };
    const result = checkImageRights(input);
    expect(result.valid).toBe(true);
    expect(result.record.status).toBe('verified');
  });

  it('flags third-party image without attribution', () => {
    const input: ImageRightsInput = {
      workspaceId: WKS,
      imageUrl: 'https://cdn.example.com/photo.jpg',
      source: 'third_party',
      licenseRef: null,
      attribution: null,
      licensee: null,
      expiresAt: null,
      nowMs: NOW,
    };
    const result = checkImageRights(input);
    expect(result.valid).toBe(false);
    expect(result.record.status).toBe('missing_attribution');
  });

  it('detects expired license', () => {
    const input: ImageRightsInput = {
      workspaceId: WKS,
      imageUrl: 'https://cdn.example.com/photo.jpg',
      source: 'licensed',
      licenseRef: 'license_001',
      attribution: 'Fotografo X',
      licensee: 'Empresa Y',
      expiresAt: '2025-01-01T00:00:00.000Z',
      nowMs: NOW,
    };
    const result = checkImageRights(input);
    expect(result.valid).toBe(false);
    expect(result.record.status).toBe('license_expired');
  });

  it('verifies AI-generated image', () => {
    const input: ImageRightsInput = {
      workspaceId: WKS,
      imageUrl: 'https://cdn.example.com/ai-photo.jpg',
      source: 'ai_generated',
      licenseRef: null,
      attribution: null,
      licensee: null,
      expiresAt: null,
      nowMs: NOW,
    };
    const result = checkImageRights(input);
    expect(result.valid).toBe(true);
    expect(result.record.status).toBe('verified');
  });
});

// =========================================================================
// LEGIT-010 — Policy Update Watcher
// =========================================================================
describe('LEGIT-010 — watchPolicyUpdate', () => {
  it('flags immediate action for near effective date', () => {
    const input: PolicyUpdateInput = {
      policyName: 'whatsapp_commerce_policy',
      provider: 'whatsapp',
      previousVersion: 'v2.0',
      newVersion: 'v2.1',
      summary: 'Updated commerce policy.',
      effectiveAt: new Date(NOW + 3 * 24 * 3600_000).toISOString(),
      nowMs: NOW,
    };
    const result = watchPolicyUpdate(input);
    expect(result.requiresImmediateAction).toBe(true);
  });

  it('does not flag for far-future effective date', () => {
    const input: PolicyUpdateInput = {
      policyName: 'meta_ads_policy',
      provider: 'meta',
      previousVersion: 'v1.0',
      newVersion: 'v1.1',
      summary: 'Updated ads policy.',
      effectiveAt: new Date(NOW + 60 * 24 * 3600_000).toISOString(),
      nowMs: NOW,
    };
    const result = watchPolicyUpdate(input);
    expect(result.requiresImmediateAction).toBe(false);
  });

  it('includes privacy related policies in impacted list', () => {
    const input: PolicyUpdateInput = {
      policyName: 'privacy_policy',
      provider: 'meta',
      previousVersion: 'v3.0',
      newVersion: 'v3.1',
      summary: 'Updated privacy terms.',
      effectiveAt: new Date(NOW + 30 * 24 * 3600_000).toISOString(),
      nowMs: NOW,
    };
    const result = watchPolicyUpdate(input);
    expect(result.impactedPolicies).toContain('lgpd_compliance');
    expect(result.impactedPolicies).toContain('gdpr_compliance');
  });
});

// =========================================================================
// LEGIT-011 — Risk Flag Elevator
// =========================================================================
describe('LEGIT-011 — elevateRiskFlag', () => {
  it('elevates critical severity', () => {
    const input: RiskFlagInput = {
      workspaceId: WKS,
      category: 'whatsapp_policy',
      severity: 'critical',
      description: 'WhatsApp policy violation detected.',
      sourceEvent: 'whatsapp_send',
      affectedResources: ['message_001'],
      nowMs: NOW,
    };
    const result = elevateRiskFlag(input);
    expect(result.requiresElevation).toBe(true);
    expect(result.flag.status).toBe('escalated');
  });

  it('does not elevate warning severity', () => {
    const input: RiskFlagInput = {
      workspaceId: WKS,
      category: 'ads_misleading',
      severity: 'warning',
      description: 'Minor ad wording issue.',
      sourceEvent: 'ad_create',
      affectedResources: ['ad_001'],
      nowMs: NOW,
    };
    const result = elevateRiskFlag(input);
    expect(result.requiresElevation).toBe(false);
    expect(result.flag.status).toBe('open');
  });

  it('elevates data breach regardless of severity', () => {
    const input: RiskFlagInput = {
      workspaceId: WKS,
      category: 'data_breach',
      severity: 'moderate',
      description: 'Potential data exposure.',
      sourceEvent: 'data_export',
      affectedResources: ['user_data_001'],
      nowMs: NOW,
    };
    const result = elevateRiskFlag(input);
    expect(result.requiresElevation).toBe(true);
  });
});

// =========================================================================
// LEGIT-012 — Block With Justification
// =========================================================================
describe('LEGIT-012 — applyBlockWithJustification', () => {
  it('applies block with appeal instructions', () => {
    const input: BlockInput = {
      workspaceId: WKS,
      reason: 'policy_violation',
      description: 'WhatsApp Commerce Policy violation.',
      legalBasis: 'WhatsApp Business Terms of Service',
      appliedBy: 'system',
      blockedResources: ['message_template_001'],
      expiresAt: null,
      nowMs: NOW,
    };
    const result = applyBlockWithJustification(input);
    expect(result.block.appealInstructions).toContain('recorrer');
    expect(result.requiresLegalReview).toBe(false);
  });

  it('marks court order as permanent', () => {
    const input: BlockInput = {
      workspaceId: WKS,
      reason: 'court_order',
      description: 'Judicial block order.',
      legalBasis: 'Mandado Judicial n. 123/2026',
      appliedBy: 'legal_team',
      blockedResources: ['page_001'],
      expiresAt: null,
      nowMs: NOW,
    };
    const result = applyBlockWithJustification(input);
    expect(result.isPermanent).toBe(true);
    expect(result.requiresLegalReview).toBe(true);
  });
});

// =========================================================================
// LEGIT-013 — Legal Consult Trigger
// =========================================================================