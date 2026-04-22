/**
 * Metric extraction for admin client rows. Isolated from the row
 * projection helpers so Lizard does not bundle the six `??` defaults
 * with neighbouring identity / subscription projections.
 */
import type { AdminClientMetricMaps, ClientWorkspaceRow } from './admin-client.types';

/** Admin client metrics snapshot shape. */
export interface AdminClientMetricsSnapshot {
  /** Current gmv property. */
  currentGmv: number;
  /** Previous gmv property. */
  previousGmv: number;
  /** Kyc status property. */
  kycStatus: string;
  /** Last sale at property. */
  lastSaleAt: string | null;
  /** Product count property. */
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
