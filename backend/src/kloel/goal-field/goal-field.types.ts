import type { SpineEventRef } from '../mind/mind.types';
import { randomIdSegment } from '../../common/random-id';

/**
 * GOAL family types — implements Camada III (Dynamic Goal Field).
 *
 * Tensions are detected by per-dimension detectors over the spine;
 * aggregated multidimensionally with commerce dominance; promoted into
 * goal candidates; selected by impact × viability × risk; surviving by
 * real outcome.
 *
 * Mode `shadow` (default) emits NO contracts to downstream. Mode
 * `active` allows goal-promoted events to be emitted onto the spine.
 */

export type TensionDimension =
  | 'cognitive'
  | 'structural'
  | 'commercial'
  | 'financial'
  | 'operational'
  | 'ux';

export interface Tension {
  readonly tensionId: string;
  readonly detectorName: string;
  readonly dimension: TensionDimension;
  readonly workspaceId?: string;
  readonly entityRef?: { readonly entityType: string; readonly entityId: string };
  readonly severity: number;
  readonly description: string;
  readonly detectedAt: string;
  readonly evidenceEventIds: readonly string[];
}

export interface Detector {
  readonly name: string;
  readonly dimension: TensionDimension;
  readonly detect: (events: readonly SpineEventRef[], nowMs: number) => readonly Tension[];
}

export interface AggregatedTension {
  readonly key: string;
  readonly workspaceId?: string;
  readonly entityRef?: { readonly entityType: string; readonly entityId: string };
  readonly weightedSeverity: number;
  readonly contributingTensions: readonly Tension[];
  readonly dominantDimension: TensionDimension;
}

export interface GoalCandidate {
  readonly goalId: string;
  readonly summary: string;
  readonly workspaceId?: string;
  readonly entityRef?: { readonly entityType: string; readonly entityId: string };
  readonly emergedAt: string;
  readonly impact: number;
  readonly viability: number;
  readonly risk: number;
  readonly score: number;
  readonly evidenceEventIds: readonly string[];
  readonly contributingTensions: readonly Tension[];
}

export type GoalFieldMode = 'shadow' | 'active';

export interface GoalEmissionResult {
  readonly mode: GoalFieldMode;
  readonly tensions: readonly Tension[];
  readonly aggregated: readonly AggregatedTension[];
  readonly candidates: readonly GoalCandidate[];
  readonly promoted: readonly GoalCandidate[];
  readonly cycleAt: string;
}

export const DIMENSION_WEIGHT: Readonly<Record<TensionDimension, number>> = Object.freeze({
  // Commercial dominance per Camada III + B0.1
  commercial: 1.0,
  financial: 0.9,
  operational: 0.7,
  ux: 0.65,
  structural: 0.6,
  cognitive: 0.55,
});

export function makeTensionId(): string {
  return `t_${Date.now()}_${randomIdSegment(6)}`;
}

export function makeGoalId(): string {
  return `g_${Date.now()}_${randomIdSegment(6)}`;
}

export function entityKey(t: Tension | AggregatedTension): string {
  const wk = t.workspaceId ?? 'global';
  const e = t.entityRef ? `${t.entityRef.entityType}:${t.entityRef.entityId}` : 'no-entity';
  return `${wk}/${e}`;
}
