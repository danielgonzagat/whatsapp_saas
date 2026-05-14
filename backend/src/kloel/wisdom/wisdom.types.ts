/**
 * UTP-WISDOM-001..008 — Camada VI (Cross-Workspace Commercial Wisdom).
 *
 * Extracts abstract patterns from per-workspace event sets with k-anonymity
 * and diff-privacy noise. No identifiable data crosses workspace boundaries.
 *
 * Implements PCI.2 §3.13 (wisdomContext) and the Camada VI semantics
 * from the Cognitive Organism Plan (Parte B — WISDOM family).
 */

import type { SpineEventRef } from '../mind/mind.types';

/**
 * A workspace event set — the raw input for pattern extraction.
 * Consumer (WISDOM-001) receives a map of workspaceId → events.
 */
export interface WorkspaceEventSet {
  readonly workspaceId: string;
  readonly events: readonly SpineEventRef[];
}

/**
 * Aggregated commercial signal derived from a single workspace's event set.
 * Intermediate representation consumed by the pattern extractor.
 */
export interface AggregatedSignal {
  readonly workspaceId: string;
  readonly totalEvents: number;
  readonly conversionCount: number;
  readonly leadCount: number;
  readonly paymentCount: number;
  readonly refundCount: number;
  readonly replyCount: number;
  readonly handoffCount: number;
  readonly campaignClickCount: number;
  readonly dealWonCount: number;
  readonly dealLostCount: number;
  readonly positiveValenceCount: number;
  readonly negativeValenceCount: number;
  readonly uniqueLeadIds: number;
  readonly uniqueProductIds: number;
  readonly uniqueStages: readonly string[];
  readonly peakHours: readonly number[];
  readonly observationWindowDays: number;
}

/**
 * A candidate pattern discovered by the pattern extractor (WISDOM-001).
 * Represents a cross-workspace abstract signal before anonymization.
 */
export interface CandidatePattern {
  readonly patternId: string;
  readonly description: string;
  readonly applicableConditions: readonly string[];
  readonly evidenceWorkspaceIds: readonly string[];
  readonly evidenceWorkspacesCount: number;
  readonly confidence: number;
  readonly signalKind: SignalKind;
  readonly aggregatedValue: number;
}

/**
 * Taxonomy tags assigned to a pattern by WISDOM-004.
 */
export interface PatternTaxonomy {
  readonly verticalHint: string | undefined;
  readonly tickethint: string | undefined;
  readonly stageHint: string | undefined;
  readonly channelHint: string | undefined;
}

/**
 * A fully-processed pattern ready for projection into the ABI.
 * This is the canonical internal type; the projector (WISDOM-005)
 * converts it to AbiWisdomPattern for the ABI consumer.
 */
export interface WisdomPattern {
  readonly patternId: string;
  readonly description: string;
  readonly applicableConditions: readonly string[];
  readonly evidenceWorkspacesCount: number;
  readonly confidence: number;
  readonly signalKind: SignalKind;
  readonly taxonomy: PatternTaxonomy;
}

/**
 * The kind of signal the pattern describes — used for filtering
 * and relevance matching.
 */
export type SignalKind =
  | 'conversion_rate'
  | 'reply_rate'
  | 'refund_rate'
  | 'handoff_rate'
  | 'deal_close_rate'
  | 'lead_volume'
  | 'campaign_efficiency'
  | 'peak_activity'
  | 'stage_distribution'
  | 'product_concentration';

/**
 * Relevance context for filtering wisdom patterns to a target workspace
 * (WISDOM-006).
 */
export interface TargetWorkspaceContext {
  readonly workspaceId: string;
  readonly vertical?: string;
  readonly ticketRange?: 'low' | 'medium' | 'high';
  readonly maturityStage?: string;
  readonly activeChannels?: readonly string[];
}

/**
 * Opt-in/out entry for a workspace-role pair (WISDOM-007).
 * Persisted in-memory; persistence layer added later.
 */
export interface OptEntry {
  readonly workspaceId: string;
  readonly role: string;
  readonly optedIn: boolean;
  readonly updatedAt: string;
}

/**
 * k-anonymity parameters (WISDOM-002).
 */
export interface KAnonymityParams {
  readonly k: number;
}

/**
 * N-validation parameters (WISDOM-003).
 */
export interface NValidationParams {
  readonly n: number;
}

/**
 * Diff-privacy parameters (WISDOM-002).
 */
export interface DiffPrivacyParams {
  readonly epsilon: number;
}

/**
 * Default constants for the wisdom pipeline.
 */
export const DEFAULT_K_ANONYMITY = 3;
export const DEFAULT_N_VALIDATION = 3;
export const DEFAULT_DIFF_PRIVACY_EPSILON = 0.5;

/**
 * PII / identifiable keywords that must never appear in pattern descriptions
 * (enforced by WISDOM-008 — attribution guard).
 */
export const PII_KEYWORD_PATTERNS: readonly RegExp[] = [
  /\bworkspaceId\b/gi,
  /\bleadId\b/gi,
  /\bproductId\b/gi,
  /\buserId\b/gi,
  /\bcustomerId\b/gi,
  /\borderId\b/gi,
  /\bwks_\w+/g,
  /\blead_\w+/g,
  /\bprod_\w+/g,
  /\buser_\w+/g,
  /\bemail\b/gi,
  /\bphone\b/gi,
  /\bdocument\b/gi,
  /\bcpf\b/gi,
  /\bcnpj\b/gi,
  /\brg\b/gi,
  /\baddress\b/gi,
];
