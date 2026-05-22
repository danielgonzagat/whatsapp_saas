/**
 * UTP-LEGIT-001..013 — Camada LEGIT (Legal & Regulatory Compliance).
 *
 * Delegar sem medo de risco legal/regulatorio/reputacional.
 * Cobre LGPD, GDPR, CCPA, WhatsApp Policy, Email (CAN-SPAM/LGPD),
 * Ads (CONAR/ANVISA), Commercial Promise, Regulated Content,
 * Image Rights, Policy Updates, Risk Flags, Block with Justification,
 * Legal Consult Trigger.
 */
export type Jurisdiction = 'BR' | 'US' | 'EU' | 'UK' | 'GLOBAL';
export type DataSubjectRight = 'access' | 'rectification' | 'erasure' | 'portability' | 'restriction' | 'objection' | 'automated_decision';
export type ConsentBasis = 'explicit' | 'legitimate_interest' | 'contractual' | 'legal_obligation' | 'vital_interest' | 'public_interest';
type ConsentStatus = 'granted' | 'withdrawn' | 'expired' | 'never_granted' | 'pending';
export type PolicyViolationSeverity = 'warning' | 'minor' | 'moderate' | 'severe' | 'critical';
export type RegulatedCategory =
  | 'health_claims'
  | 'financial_advice'
  | 'legal_advice'
  | 'medical_device'
  | 'pharmaceutical'
  | 'tobacco'
  | 'alcohol'
  | 'gambling'
  | 'adult_content'
  | 'crypto_advice'
  | 'political'
  | 'hate_speech'
  | 'restricted_product';
type ImageRightsSource = 'stock' | 'licensed' | 'ai_generated' | 'user_uploaded' | 'third_party' | 'commissioned';
export type ImageRightsStatus = 'verified' | 'missing_attribution' | 'license_expired' | 'unlicensed' | 'pending_review' | 'violation_detected';
type RiskFlagCategory =
  | 'lgpd_violation'
  | 'gdpr_violation'
  | 'ccpa_violation'
  | 'whatsapp_policy'
  | 'email_spam'
  | 'ads_misleading'
  | 'affiliate_terms'
  | 'commercial_promise'
  | 'regulated_content'
  | 'image_rights'
  | 'data_breach'
  | 'legal_threat'
  | 'regulatory_notice';
type RiskFlagStatus = 'open' | 'acknowledged' | 'investigating' | 'escalated' | 'resolved' | 'dismissed' | 'requires_legal';
type BlockReason =
  | 'policy_violation'
  | 'legal_requirement'
  | 'regulatory_order'
  | 'copyright_claim'
  | 'trademark_infringement'
  | 'right_of_publicity'
  | 'court_order'
  | 'platform_terms'
  | 'consent_required'
  | 'jurisdiction_block';
type LegalConsultUrgency = 'routine' | 'elevated' | 'urgent' | 'emergency';
export interface ConsentRecord {
  readonly consentId: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly purpose: string;
  readonly basis: ConsentBasis;
  readonly jurisdiction: Jurisdiction;
  readonly status: ConsentStatus;
  readonly grantedAt: string;
  readonly withdrawnAt: string | null;
  readonly expiresAt: string | null;
  readonly evidenceHash: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly createdAt: string;
}
export interface PolicyViolation {
  readonly violationId: string;
  readonly workspaceId: string;
  readonly userId: string | null;
  readonly policyName: string;
  readonly severity: PolicyViolationSeverity;
  readonly description: string;
  readonly source: string;
  readonly evidence: readonly string[];
  readonly detectedAt: string;
  readonly resolvedAt: string | null;
}
interface ImageRights {
  readonly imageId: string;
  readonly workspaceId: string;
  readonly source: ImageRightsSource;
  readonly status: ImageRightsStatus;
  readonly url: string;
  readonly licenseRef: string | null;
  readonly attribution: string | null;
  readonly licensee: string | null;
  readonly expiresAt: string | null;
  readonly verifiedAt: string | null;
  readonly createdAt: string;
}
interface PolicyChange {
  readonly changeId: string;
  readonly policyName: string;
  readonly provider: string;
  readonly previousVersion: string;
  readonly newVersion: string;
  readonly summary: string;
  readonly effectiveAt: string;
  readonly requiresAction: boolean;
  readonly actionDeadline: string | null;
  readonly complianceChecklist: readonly string[];
  readonly detectedAt: string;
  readonly acknowledgedAt: string | null;
}
interface RiskFlag {
  readonly flagId: string;
  readonly workspaceId: string;
  readonly category: RiskFlagCategory;
  readonly severity: PolicyViolationSeverity;
  readonly description: string;
  readonly sourceEvent: string;
  readonly affectedResources: readonly string[];
  readonly status: RiskFlagStatus;
  readonly assignedTo: string | null;
  readonly escalatedAt: string | null;
  readonly resolvedAt: string | null;
  readonly createdAt: string;
}
interface LegalConsult {
  readonly consultId: string;
  readonly workspaceId: string;
  readonly urgency: LegalConsultUrgency;
  readonly subject: string;
  readonly context: string;
  readonly affectedPolicies: readonly string[];
  readonly evidence: readonly string[];
  readonly recommendedAction: string;
  readonly triggeredAt: string;
  readonly resolvedAt: string | null;
}
interface BlockJustification {
  readonly blockId: string;
  readonly workspaceId: string;
  readonly reason: BlockReason;
  readonly description: string;
  readonly legalBasis: string;
  readonly appliedBy: string;
  readonly blockedResources: readonly string[];
  readonly appealInstructions: string;
  readonly expiresAt: string | null;
  readonly appliedAt: string;
  readonly liftedAt: string | null;
}
// Privacy compliance inputs
export interface PrivacyComplianceInput {
  readonly workspaceId: string;
  readonly jurisdiction: Jurisdiction;
  readonly hasConsent: boolean;
  readonly consentBasis: ConsentBasis | null;
  readonly dataSubjectRequest: DataSubjectRight | null;
  readonly dataExported: boolean;
  readonly dataDeleted: boolean;
  readonly processingJustification: string | null;
  readonly nowMs?: number;
}
export interface PrivacyComplianceResult {
  readonly compliant: boolean;
  readonly violations: readonly PolicyViolation[];
  readonly requiredActions: readonly string[];
  readonly assessedAt: string;
}
// Consent input
export interface ConsentInput {
  readonly workspaceId: string;
  readonly userId: string;
  readonly purpose: string;
  readonly basis: ConsentBasis;
  readonly jurisdiction: Jurisdiction;
  readonly action: 'grant' | 'withdraw' | 'verify';
  readonly metadata?: Readonly<Record<string, string>>;
  readonly nowMs?: number;
}
export interface ConsentResult {
  readonly success: boolean;
  readonly record: ConsentRecord;
  readonly action: string;
}
// Policy enforcement inputs
export interface PolicyEnforcementInput {
  readonly workspaceId: string;
  readonly userId: string | null;
  readonly content: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly nowMs?: number;
}
export interface PolicyEnforcementResult {
  readonly allowed: boolean;
  readonly violations: readonly PolicyViolation[];
  readonly warnings: readonly string[];
  readonly assessedAt: string;
}
// Commercial promise input
export interface CommercialPromiseInput {
  readonly workspaceId: string;
  readonly userId: string | null;
  readonly claim: string;
  readonly evidenceUrls: readonly string[];
  readonly jurisdiction: Jurisdiction;
  readonly productCategory: string;
  readonly nowMs?: number;
}
export interface CommercialPromiseResult {
  readonly substantiated: boolean;
  readonly riskLevel: PolicyViolationSeverity;
  readonly requiredEvidence: readonly string[];
  readonly disclaimers: readonly string[];
  readonly violations: readonly PolicyViolation[];
  readonly assessedAt: string;
}
// Regulated content input
export interface RegulatedContentInput {
  readonly workspaceId: string;
  readonly content: string;
  readonly contentType: string;
  readonly jurisdiction: Jurisdiction;
  readonly targetAudience: string;
  readonly nowMs?: number;
}
export interface RegulatedContentResult {
  readonly regulated: boolean;
  readonly categories: readonly RegulatedCategory[];
  readonly requiresApproval: boolean;
  readonly requiresDisclaimer: boolean;
  readonly disclaimerText: string | null;
  readonly violations: readonly PolicyViolation[];
  readonly assessedAt: string;
}
// Image rights input
export interface ImageRightsInput {
  readonly workspaceId: string;
  readonly imageUrl: string;
  readonly source: ImageRightsSource;
  readonly licenseRef: string | null;
  readonly attribution: string | null;
  readonly licensee: string | null;
  readonly expiresAt: string | null;
  readonly nowMs?: number;
}
export interface ImageRightsResult {
  readonly valid: boolean;
  readonly record: ImageRights;
  readonly violations: readonly PolicyViolation[];
  readonly assessedAt: string;
}
// Policy update input
export interface PolicyUpdateInput {
  readonly policyName: string;
  readonly provider: string;
  readonly previousVersion: string;
  readonly newVersion: string;
  readonly summary: string;
  readonly effectiveAt: string;
  readonly nowMs?: number;
}
export interface PolicyUpdateResult {
  readonly change: PolicyChange;
  readonly requiresImmediateAction: boolean;
  readonly impactedPolicies: readonly string[];
  readonly assessedAt: string;
}
// Risk flag input
export interface RiskFlagInput {
  readonly workspaceId: string;
  readonly category: RiskFlagCategory;
  readonly severity: PolicyViolationSeverity;
  readonly description: string;
  readonly sourceEvent: string;
  readonly affectedResources: readonly string[];
  readonly nowMs?: number;
}
export interface RiskFlagResult {
  readonly flag: RiskFlag;
  readonly requiresElevation: boolean;
  readonly recommendedAction: string;
  readonly assessedAt: string;
}
// Block justification input
export interface BlockInput {
  readonly workspaceId: string;
  readonly reason: BlockReason;
  readonly description: string;
  readonly legalBasis: string;
  readonly appliedBy: string;
  readonly blockedResources: readonly string[];
  readonly expiresAt: string | null;
  readonly nowMs?: number;
}
export interface BlockResult {
  readonly block: BlockJustification;
  readonly isPermanent: boolean;
  readonly requiresLegalReview: boolean;
  readonly assessedAt: string;
}
// Legal consult trigger input
export interface LegalConsultInput {
  readonly workspaceId: string;
  readonly urgency: LegalConsultUrgency;
  readonly subject: string;
  readonly context: string;
  readonly affectedPolicies: readonly string[];
  readonly evidence: readonly string[];
  readonly nowMs?: number;
}
export interface LegalConsultResult {
  readonly consult: LegalConsult;
  readonly requiresImmediateAction: boolean;
  readonly recommendedAction: string;
  readonly assessedAt: string;
}
// =========================================================================
// CONSTANTS
// =========================================================================
export * from './constants';
