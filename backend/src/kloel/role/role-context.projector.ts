/**
 * UTP-ROLE-002 — Role Context Projector.
 *
 * Projects internal RoleDetection state into the ABI roleContext
 * payload (PCI.2 §3.14). Converts the canonical internal types to
 * AbiRoleDetection / AbiRoleContext for the LLM consumer.
 *
 * Pure function — no DI, no side effects.
 * Produces truthMode = 'inferred' on all projected outputs.
 */

import type { AbiRoleContext, AbiRoleDetection } from '../abi/abi-schema';
import type { RoleDetection, RoleMetricSnapshot } from './types';
import { ALL_ROLES } from './types';
import { getRelevantMetricsForRole } from './role-metric.registry';
import { getLeversForRole } from './leverage-map.service';

export interface ProjectRoleContextInput {
  readonly detections: readonly RoleDetection[];
  readonly workspaceId: string;
  readonly metricSnapshots?: readonly RoleMetricSnapshot[];
}

/**
 * UTP-ROLE-002: project RoleDetection[] into AbiRoleContext.
 *
 * Converts internal detections to the ABI contract shape,
 * resolves the primary role, collects real levers, and
 * attaches relevant metric snapshots.
 */
export function projectRoleContext(
  input: ProjectRoleContextInput,
): AbiRoleContext {
  const detections = input.detections;
  const primaryRole = detections.length > 0 ? detections[0]!.role : undefined;

  const abiDetections: AbiRoleDetection[] = detections.map((d) => ({
    role: d.role,
    confidence: d.confidence,
    detectedFromSignals: d.detectedFromSignals,
  }));

  const levers = primaryRole ? getLeversForRole(primaryRole) : [];

  const metrics: { metricName: string; currentValue: number | string }[] = [];

  if (primaryRole) {
    const relevantMetrics = getRelevantMetricsForRole(primaryRole);
    const snapshotMap = new Map(
      (input.metricSnapshots ?? []).map((m) => [m.metricName, m]),
    );
    for (const rm of relevantMetrics) {
      const snap = snapshotMap.get(rm.metricName);
      metrics.push({
        metricName: rm.metricName,
        currentValue: snap?.currentValue ?? '--',
      });
    }
  }

  return {
    detectedRoles: abiDetections,
    primaryRole,
    realLevers: levers,
    relevantMetrics: metrics,
  };
}

/**
 * UTP-ROLE-002 helper: project a single RoleDetection to AbiRoleDetection.
 */
export function projectSingleDetection(
  detection: RoleDetection,
): AbiRoleDetection {
  return {
    role: detection.role,
    confidence: detection.confidence,
    detectedFromSignals: detection.detectedFromSignals,
  };
}

/**
 * UTP-ROLE-002 helper: create a default empty roleContext for workspaces
 * that have not yet accumulated enough spine events for detection.
 */
export function emptyRoleContext(): AbiRoleContext {
  return {
    detectedRoles: [],
    primaryRole: undefined,
    realLevers: [],
    relevantMetrics: [],
  };
}
