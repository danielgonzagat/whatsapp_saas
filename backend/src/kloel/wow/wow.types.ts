/**
 * UTP-WOW-001..006 — Camada XI (First-Hour Wow).
 *
 * Delivers a value shock in the first minutes of workspace activation
 * by rapidly ingesting available history, running wisdom/insight/maturity
 * consumers, ranking insights by impact, packaging with evidence, and
 * filtering by confidence floor — all within a single orchestration.
 *
 * Implements B0.2 (confidence delegation) and B0.5 (cold-start as default
 * input mode) from the Cognitive Organism Plan.
 */

import type { Insight, RankedInsight } from '../insight/insight.types';
import type { MaturityVerdict } from '../maturity/maturity.types';
import type { SpineEventRef } from '../mind/mind.types';

/**
 * History ingestion result — the structured input collected from any
 * available spine events at workspace activation time.
 */
export interface HistoryIngestion {
  readonly workspaceId: string;
  readonly events: readonly SpineEventRef[];
  readonly ingestedAt: string;
  readonly totalEventCount: number;
  readonly eventKinds: readonly string[];
}

/**
 * A pattern detected from the first-hour ingestion pipeline,
 * combining maturity classification with business insights.
 */
export interface FirstHourPattern {
  readonly workspaceId: string;
  readonly maturityVerdict: MaturityVerdict;
  readonly insights: readonly Insight[];
  readonly rankedInsights: readonly RankedWOWInsight[];
  readonly detectedAt: string;
}

/**
 * WOW-specific ranked insight — extends the canonical RankedInsight
 * with first-hour delivery metadata.
 */
export interface RankedWOWInsight extends RankedInsight {
  readonly wowUrgency: 'immediate' | 'first_session' | 'first_week';
  readonly wowDeliveryPriority: number;
}

/**
 * An insight packaged with traceable evidence for first-hour delivery.
 * Every evidence item carries provenance (source, processor, version).
 */
export interface EvidenceBundle {
  readonly insight: RankedWOWInsight;
  readonly evidenceItems: readonly EvidenceItem[];
  readonly assembledAt: string;
  readonly totalEvidenceWeight: number;
}

/**
 * A single evidence item — a spine event or derived fact that supports
 * the insight's claim.
 */
export interface EvidenceItem {
  readonly description: string;
  readonly sourceEventId?: string;
  readonly sourceEventName?: string;
  readonly truthMode: 'observed' | 'inferred' | 'projected';
  readonly provenance: {
    readonly processor: string;
    readonly processorVersion: string;
  };
  readonly weight: number;
}

/**
 * The outcome of the first-hour orchestration: what was delivered,
 * what was blocked, and what awaits acknowledgment.
 */
export interface OrchestrationOutcome {
  readonly workspaceId: string;
  readonly ingestion: HistoryIngestion;
  readonly pattern: FirstHourPattern;
  readonly deliveredEvidence: readonly EvidenceBundle[];
  readonly blockedInsightCount: number;
  readonly blockedReasons: readonly string[];
  readonly acknowledged: boolean;
  readonly orchestratedAt: string;
  readonly orchestrationDurationMs: number;
}

/**
 * Delivery decision for a single insight in the first-hour context.
 */
export interface FirstHourDeliveryDecision {
  readonly insight: RankedWOWInsight;
  readonly deliver: boolean;
  readonly reason?: string;
  readonly channel: 'whatsapp' | 'dashboard';
  readonly timing: 'now';
}

/**
 * Confidence floor thresholds tuned for first-hour cold-start scenarios.
 * Slightly lower than the standard insight thresholds because the WOW
 * layer operates with incomplete history (B0.5 cold-start mode).
 */
export const WOW_CONFIDENCE_FLOOR_DEFAULT = 0.35;

export const WOW_CONFIDENCE_FLOOR_PER_KIND: ReadonlyMap<string, number> = new Map([
  ['funnel_bottleneck', 0.4],
  ['pricing_elasticity', 0.45],
  ['channel_roi', 0.45],
  ['offer_fit', 0.35],
  ['objection_pattern', 0.3],
  ['qualification_leak', 0.35],
  ['cooling_window', 0.3],
  ['product_positioning', 0.4],
]);

/**
 * Max insights to deliver in the first hour to avoid overwhelming
 * the user with noise.
 */
export const MAX_FIRST_HOUR_INSIGHTS = 5;

/**
 * Default observation window for first-hour history ingestion in days.
 */
export const DEFAULT_INGESTION_WINDOW_DAYS = 90;
