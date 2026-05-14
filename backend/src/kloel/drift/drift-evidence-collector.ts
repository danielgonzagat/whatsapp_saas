import type { SpineEventRef } from '../mind/mind.types';
import type { BehaviorSnapshot, EvidenceBundle } from './drift.types';

export function collectEvidence(
  currentSnapshot: BehaviorSnapshot,
  previousSnapshots: readonly BehaviorSnapshot[],
  attributingEvents: readonly SpineEventRef[],
  opts: { readonly nowIso?: string } = {},
): EvidenceBundle {
  const now = opts.nowIso ?? new Date().toISOString();
  const driftId = `drift_${currentSnapshot.workspaceId}_${currentSnapshot.weekStart}`;

  const beforeSummary =
    previousSnapshots.length > 0
      ? `${previousSnapshots.length} snapshots anteriores cobrindo de ${previousSnapshots[0]!.weekStart} a ${previousSnapshots[previousSnapshots.length - 1]!.weekEnd}`
      : 'sem histórico anterior disponível';

  const afterSummary = `Snapshot da semana ${currentSnapshot.weekStart} a ${currentSnapshot.weekEnd} com ${currentSnapshot.eventCount} eventos, ${currentSnapshot.leadCount} leads e ${currentSnapshot.conversionCount} conversões`;

  return {
    driftId,
    workspaceId: currentSnapshot.workspaceId,
    before: {
      snapshots: previousSnapshots,
      summary: beforeSummary,
    },
    after: {
      snapshot: currentSnapshot,
      summary: afterSummary,
    },
    attributingEvents,
    computedAt: now,
  };
}
