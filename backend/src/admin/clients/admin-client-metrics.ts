/**
 * Metric extraction for admin client rows. Isolated from the row
 * projection helpers so Lizard does not bundle the six `??` defaults
 * with neighbouring identity / subscription projections.
 */
import type { AdminClientMetricMaps } from './admin-client-row.builder';
import type { ClientWorkspaceRow } from './admin-client-row.builder';

/** Admin client metrics snapshot shape. */
export interface AdminClientMetricsSnapshot {
  currentGmv: number;
  previousGmv: number;
  kycStatus: string;
  lastSaleAt: string | null;
  productCount: number;
}

function resolveMetricOwnerKyc(workspace: ClientWorkspaceRow): string {
  return workspace.agents[0]?.kycStatus ?? 'unknown';
}

/** Extract client metrics. */
export function extractClientMetrics(
  workspace: ClientWorkspaceRow,
  maps: AdminClientMetricMaps,
): AdminClientMetricsSnapshot {
  return {
    currentGmv: maps.currentGmvMap.get(workspace.id) ?? 0,
    previousGmv: maps.previousGmvMap.get(workspace.id) ?? 0,
    kycStatus: resolveMetricOwnerKyc(workspace),
    lastSaleAt: maps.lastSaleMap.get(workspace.id) ?? null,
    productCount: maps.productMap.get(workspace.id) ?? 0,
  };
}
