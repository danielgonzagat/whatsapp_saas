/**
 * Camada XXVII — Ecosystem Intelligence types.
 *
 * Detects opportunities ACROSS roles (produtor / afiliado / agência /
 * creator / closer / especialista / gestor) without ever leaking
 * identifiable cross-workspace data. Privacy-first; suggestion-only;
 * silence under conflict (B0.11 + B0.18).
 */

import type { Role } from '../role/types';
export type { Role };

export interface CrossRolePattern {
  readonly patternId: string;
  readonly description: string;
  readonly observedAcrossRoles: readonly Role[];
  readonly evidenceWorkspacesCount: number;
  readonly confidence: number;
}

export interface RoleFitMatch {
  readonly fitId: string;
  readonly producerWorkspaceFingerprint: string;
  readonly partnerWorkspaceFingerprint: string;
  readonly roleA: Role;
  readonly roleB: Role;
  readonly score: number;
  readonly reasonTokens: readonly string[];
}

export interface OpportunityRanking {
  readonly opportunityId: string;
  readonly description: string;
  readonly impactScore: number;
  readonly viability: number;
  readonly conflictRisk: number;
  readonly rank: number;
}

export interface EcosystemPrivacyVerdict {
  readonly verdict: 'PASS' | 'FAIL';
  readonly leaksDetected: readonly string[];
}

export interface ConflictDetection {
  readonly conflictId: string;
  readonly kind: 'self-deal' | 'cross-bet' | 'incentive-bias' | 'workspace-overlap';
  readonly description: string;
  readonly silenceRecommended: boolean;
}

export type DeliveryChannel = 'whatsapp' | 'inbox' | 'email' | 'dashboard';

export interface SuggestionDelivery {
  readonly suggestionId: string;
  readonly recipientFingerprint: string;
  readonly recipientRole: Role;
  readonly channel: DeliveryChannel;
  readonly summary: string;
  readonly explanation: string;
  readonly disclosure?: string;
  readonly createdAt: string;
}
